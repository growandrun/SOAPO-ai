/* 치료사 화면: 대시보드 + 환자별 상세 (요약, 일정·컨디션, 내원기록, SOAP, 이력, 가정 프로그램, 메시지) */
import { cache, view } from "./data.js";
import * as AI from "./ai.js";
import { state } from "./state.js";
import { h, localDate, fmtDate, DAY } from "./util.js";
import { lineChart, spark } from "./charts.js";
import { topbar, KIND, STATUS, STATUS_PILL, fmtTime, fmtDay, dday, fmtBirth } from "./layout.js";
import { FIELDS, GROUPS, TREATMENTS, OBSERVATIONS, treatment, levelsOf, levelLabelOf, itemSummary, observation } from "./catalog.js";

const LEVEL_ORDER = { danger: 0, warn: 1, info: 2 };
const plusDays = (n) => localDate(new Date(Date.now() + n * DAY));

export function therapistHtml() {
  if (state.selected && !view.patient(state.selected)) state.selected = null;
  if (state.tView === "patient" && !state.selected) state.tView = "dashboard";
  const main = state.tView === "new" || !cache.patients.length ? newPatientHtml()
    : state.tView === "patient" ? patientDetailHtml(view.patient(state.selected))
    : dashboardHtml();
  return `${topbar()}<div class="work"><aside class="rail">${railHtml()}</aside><main class="main">${main}</main></div>`;
}

export function railHtml() {
  const pts = cache.patients;
  return `<button class="pitem navitem" data-act="t-dashboard" aria-current="${state.tView === "dashboard"}"><strong>대시보드</strong><span class="small muted">오늘 일정 · 확인 필요 · 환자 현황</span></button>
  <div class="toolbar" style="justify-content:space-between"><span class="label">담당 환자 ${pts.length}명</span><button class="btn sm" data-act="new-patient">+ 환자 등록</button></div>
  <div class="plist">${pts.map((x) => {
    const al = AI.screen(x, view.ctx(x.id));
    const d = al.filter((y) => y.level === "danger").length, w = al.filter((y) => y.level === "warn").length;
    const un = view.unread(x.id);
    return `<button class="pitem" data-act="pick" data-id="${x.id}" aria-current="${state.tView === "patient" && x.id === state.selected}">
      <div class="row"><strong>${h(x.name)}</strong></div>
      <span class="small muted mono">${x.birthDate ? fmtBirth(x.birthDate) : "생년월일 미입력"}</span>
      <div class="flags">${d ? `<span class="pill danger">위험 ${d}</span>` : ""}${w ? `<span class="pill warn">주의 ${w}</span>` : ""}${!d && !w ? `<span class="pill ok">양호</span>` : ""}${un ? `<span class="pill info">메시지 ${un}</span>` : ""}${x.userId ? "" : `<span class="pill plain">앱 미가입</span>`}</div>
    </button>`; }).join("")}</div>`;
}

/* ================= 대시보드 ================= */
function dashboardHtml() {
  const pts = cache.patients;
  const today = localDate();
  const byTime = (a, b) => a.startsAt.localeCompare(b.startsAt);
  const todays = cache.appointments.filter((a) => a.date === today).sort(byTime);
  const alerts = pts.flatMap((p) => AI.screen(p, view.ctx(p.id)).map((a) => ({ ...a, p }))).sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  const dangers = alerts.filter((a) => a.level === "danger").length;
  const unread = pts.reduce((t, p) => t + view.unread(p.id), 0);
  const joined = pts.filter((p) => p.userId).length;
  const deadlines = [
    ...pts.flatMap((p) => p.goals.filter((g) => g.status === "active" && g.due && g.due <= plusDays(14)).map((g) => ({ date: g.due, p, text: `${g.type} 기한`, sub: g.text }))),
    ...cache.appointments.filter((a) => a.kind === "reevaluation" && a.status === "scheduled" && a.date >= today && a.date <= plusDays(14)).map((a) => ({ date: a.date, p: view.patient(a.patientId), text: "재평가 예정", sub: `${fmtDay(a.startsAt)} ${fmtTime(a.startsAt)}` })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const doneToday = todays.filter((a) => a.status === "done").length;

  const apptRow = (a, withDate) => {
    const p = view.patient(a.patientId);
    const noteToday = view.notes(a.patientId).some((n) => n.date === a.date);
    return `<li class="appt">
      <span class="mono appt-time">${withDate ? fmtDay(a.startsAt) + " " : ""}${fmtTime(a.startsAt)}</span>
      <span class="appt-who"><button class="linklike" data-act="pick" data-id="${a.patientId}">${h(p?.name ?? "")}</button> <span class="small muted">${KIND[a.kind]} · ${a.duration}분</span>${a.note ? `<span class="small muted"> · ${h(a.note)}</span>` : ""}</span>
      <span class="appt-act">${a.status === "scheduled" && !withDate
        ? `<button class="btn sm" data-act="appt-status" data-id="${a.id}" data-status="done">완료</button><button class="btn sm ghost" data-act="appt-status" data-id="${a.id}" data-status="no_show">결석</button><button class="btn sm ghost" data-act="appt-status" data-id="${a.id}" data-status="cancelled">취소</button>`
        : `<span class="pill ${STATUS_PILL[a.status]}">${STATUS[a.status]}</span>`}
        ${a.status !== "cancelled" && a.status !== "no_show" && !withDate && !visitLinked(a) ? `<button class="btn sm" data-act="write-visit" data-id="${a.patientId}" data-appt="${a.id}">내원기록</button>` : ""}
        ${a.status === "done" && !noteToday ? `<button class="btn sm primary" data-act="write-soap" data-id="${a.patientId}" data-date="${a.date}">SOAP 쓰기</button>` : ""}</span>
    </li>`;
  };

  return `<div class="dash">
    <div class="phead"><div><span class="label">${new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })}</span><h1>${h(cache.profile.name)} 선생님, 오늘 할 일입니다</h1></div></div>
    <div class="tiles">
      <div class="tile"><span class="small muted">오늘 치료</span><strong>${doneToday}<small>/${todays.length}</small></strong><span class="small muted">완료 / 예정</span></div>
      <div class="tile ${dangers ? "is-danger" : alerts.length ? "is-warn" : ""}"><span class="small muted">확인 필요</span><strong>${alerts.filter((a) => a.level !== "info").length}</strong><span class="small muted">위험 ${dangers} · 주의 ${alerts.filter((a) => a.level === "warn").length}</span></div>
      <div class="tile ${unread ? "is-info" : ""}"><span class="small muted">새 메시지</span><strong>${unread}</strong><span class="small muted">환자·보호자</span></div>
      <div class="tile"><span class="small muted">담당 환자</span><strong>${pts.length}</strong><span class="small muted">앱 가입 ${joined}명</span></div>
    </div>

    <div class="grid2">
      <section class="panel">
        <div class="toolbar" style="justify-content:space-between"><h2>오늘 일정</h2><span class="small muted">${todays.length}건</span></div>
        ${todays.length ? `<ul class="appts">${todays.map((a) => apptRow(a, false)).join("")}</ul>` : `<p class="muted small">오늘 잡힌 치료가 없습니다.</p>`}
        <details><summary class="small">일정 추가</summary>${apptForm(null)}</details>
      </section>

      <section class="panel">
        <div class="toolbar" style="justify-content:space-between"><h2>확인이 필요한 환자</h2><span class="pill info">AI 자동 검진</span></div>
        ${alerts.length ? `<ul class="alerts">${alerts.slice(0, 12).map((a) => `<li class="alert ${a.level}"><span class="dot"></span><span><button class="linklike" data-act="pick" data-id="${a.p.id}"><b>${h(a.p.name)}</b></button> ${h(a.text)}</span></li>`).join("")}</ul>` : `<p class="muted">확인할 위험 신호가 없습니다.</p>`}
        ${alerts.length > 12 ? `<p class="small muted">외 ${alerts.length - 12}건은 환자별 화면에서 볼 수 있습니다.</p>` : ""}
      </section>

      <section class="panel wide">
        <h2>다가오는 기한 (2주)</h2>
        ${deadlines.length ? `<ul class="deadlines">${deadlines.map((d) => `<li><span class="pill ${d.date < today ? "danger" : d.date <= plusDays(3) ? "warn" : "plain"}">${dday(d.date)}</span><span><button class="linklike" data-act="pick" data-id="${d.p?.id}"><b>${h(d.p?.name ?? "")}</b></button> ${h(d.text)}<br><span class="small muted">${h(d.sub)}</span></span></li>`).join("")}</ul>` : `<p class="muted small">2주 안에 끝나는 목표나 재평가가 없습니다.</p>`}
      </section>

    </div>

    ${weekTable()}

    <section class="panel">
      <div class="toolbar" style="justify-content:space-between"><h2>환자 현황</h2><span class="small muted">최근 7일 기준</span></div>
      ${caseloadTable()}
    </section>
  </div>`;
}

function caseloadTable() {
  const rows = cache.patients.map((p) => {
    const ctx = view.ctx(p.id);
    const st = AI.homeStats(ctx.programs, ctx.sessions);
    const pains = ctx.symptoms.slice(-7).map((x) => x.pain);
    const k = AI.latestScores(p.scores).find((x) => x.tool === "K-MBI") ?? AI.latestScores(p.scores)[0];
    const last = ctx.notes[0];
    const next = view.nextAppointment(p.id);
    const goalsActive = p.goals.filter((g) => g.status === "active").length, goalsMet = p.goals.filter((g) => g.status === "met").length;
    const un = view.unread(p.id);
    return `<tr>
      <td><button class="linklike" data-act="pick" data-id="${p.id}"><b>${h(p.name)}</b></button>${p.birthDate ? `<div class="small muted mono">${fmtBirth(p.birthDate)}</div>` : ""}</td>
      <td class="num">${st.adherence == null ? `<span class="muted">처방 없음</span>` : `<span class="pill ${st.adherence >= 80 ? "ok" : st.adherence >= 50 ? "plain" : "warn"}">${st.adherence}%</span>`}</td>
      <td>${spark(pains)}</td>
      <td class="num">${k ? `${k.value}${k.prev != null ? ` <span class="small ${k.value >= k.prev ? "up" : "down"}">${k.value >= k.prev ? "▲" : "▼"}${Math.abs(k.value - k.prev)}</span>` : ""}<div class="small muted">${h(k.tool)}</div>` : `<span class="muted">–</span>`}</td>
      <td class="num">${goalsMet}/${goalsMet + goalsActive}</td>
      <td>${last ? `<span class="mono small">${fmtDate(last.date)}</span>` : `<span class="pill warn">없음</span>`}</td>
      <td>${next ? `<span class="mono small">${fmtDay(next.startsAt)} ${fmtTime(next.startsAt)}</span>` : `<span class="muted small">없음</span>`}</td>
      <td>${un ? `<span class="pill info">${un}</span>` : p.userId ? `<span class="muted small">–</span>` : `<span class="pill plain">미가입</span>`}</td>
    </tr>`;
  }).join("");
  return `<div class="tablewrap"><table class="caseload"><thead><tr><th>환자</th><th class="num">운동 수행률</th><th>통증 추이</th><th class="num">평가 점수</th><th class="num">달성 목표</th><th>마지막 SOAP</th><th>다음 치료</th><th>새 메시지</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 주간 시간표: 월~일 7칸, 칸마다 시간순 일정 */
function weekTable() {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + 7 * state.weekOffset);
  const days = Array.from({ length: 7 }, (_, i) => localDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
  const today = localDate();
  const byDay = (d) => cache.appointments.filter((a) => a.date === d && a.status !== "cancelled").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const total = days.reduce((t, d) => t + byDay(d).length, 0);
  return `<section class="panel">
    <div class="toolbar" style="justify-content:space-between"><h2>주간 시간표</h2>
      <div class="toolbar"><button class="btn sm ghost" data-act="week" data-dir="-1" aria-label="지난주">◀</button><span class="small mono">${fmtDate(days[0])} – ${fmtDate(days[6])}</span><button class="btn sm ghost" data-act="week" data-dir="1" aria-label="다음 주">▶</button>${state.weekOffset ? `<button class="btn sm ghost" data-act="week" data-dir="0">이번 주</button>` : ""}<span class="small muted">${total}건</span></div></div>
    <div class="weekwrap"><div class="week">${days.map((d, i) => `<div class="wday ${d === today ? "is-today" : ""}">
      <div class="wday-head"><b>${WEEKDAYS[(i + 1) % 7]}</b> <span class="mono small">${fmtDate(d)}</span></div>
      ${byDay(d).map((a) => `<button class="wslot ${a.status}" data-act="pick" data-id="${a.patientId}" title="${h(KIND[a.kind])} · ${a.duration}분 · ${STATUS[a.status]}"><span class="mono">${fmtTime(a.startsAt)}</span> ${h(view.patient(a.patientId)?.name ?? "")}</button>`).join("") || `<span class="small muted">–</span>`}
    </div>`).join("")}</div></div>
  </section>`;
}

function apptForm(patientId) {
  const opts = cache.patients.map((p) => `<option value="${p.id}" ${p.id === patientId ? "selected" : ""}>${h(p.name)}</option>`).join("");
  return `<form id="f-appt" class="formgrid appt-form" style="margin-top:.6rem">
    ${patientId ? `<input type="hidden" id="ap-patient" value="${patientId}">` : `<div class="field wide"><label class="label" for="ap-patient">환자</label><select id="ap-patient" required>${opts}</select></div>`}
    <div class="field"><label class="label" for="ap-date">날짜</label><input type="date" id="ap-date" value="${localDate()}" required></div>
    <div class="field"><label class="label" for="ap-time">시간</label><input type="time" id="ap-time" value="10:00" required></div>
    <div class="field"><label class="label" for="ap-kind">종류</label><select id="ap-kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
    <div class="field"><label class="label" for="ap-dur">시간(분)</label><input type="text" id="ap-dur" inputmode="numeric" value="30"></div>
    <div class="field"><label class="label" for="ap-repeat">반복</label><select id="ap-repeat"><option value="">반복 안 함</option><option value="weekly">매주 반복</option></select></div>
    <div class="field wide"><label class="label" for="ap-note">메모 (선택)</label><input type="text" id="ap-note" maxlength="200" placeholder="예: 보호자 동반, K-MBI 재평가"></div>
    <fieldset class="wide repeat-opts"><legend class="label">반복할 요일과 기간</legend>
      <div class="toolbar">${WEEKDAYS.map((d, i) => `<label class="chk day"><input type="checkbox" name="ap-dow" value="${i}"><span>${d}</span></label>`).join("")}</div>
      <div class="toolbar"><label class="small" for="ap-weeks">기간</label><select id="ap-weeks">${[1, 2, 3, 4, 6, 8, 12].map((w) => `<option value="${w}" ${w === 4 ? "selected" : ""}>${w}주</option>`).join("")}</select>
        <span class="small muted">요일을 고르지 않으면 시작 날짜의 요일로 반복합니다.</span></div>
    </fieldset>
    <div class="wide"><button class="btn primary" type="submit">일정 추가</button></div>
  </form>`;
}

/* ================= 환자 상세 ================= */
function patientDetailHtml(p) {
  const un = view.unread(p.id);
  const tabs = [["overview", "요약·AI 검진"], ["schedule", "일정·컨디션"], ["visits", "내원기록"], ["soap", "SOAP 작성"], ["history", "기록 이력"], ["home", "가정 프로그램"], ["msg", `메시지${un ? ` (${un})` : ""}`]];
  const member = cache.names[p.userId];
  return `<div class="phead"><div style="display:grid;gap:.25rem;min-width:0"><h1>${h(p.name)}</h1>
      <div class="meta">${p.birthDate ? `<span>생년월일 ${fmtBirth(p.birthDate)}</span>` : `<span class="pill warn">생년월일 미입력</span>`}${p.firstVisit ? `<span>첫 내원 ${h(p.firstVisit)}</span>` : ""}
        ${p.userId ? `<span class="pill ok">앱 가입${member && member !== p.name ? ` · ${h(member)}` : ""}</span>` : `<span>초대 코드 <b class="mono">${h(p.invite ?? "")}</b> <button class="btn sm" data-act="copy-invite">복사</button> <button class="btn sm ghost" data-act="reissue">새 코드</button></span>`}</div></div></div>
    <details class="pinfo" ${p.birthDate ? "" : "open"}><summary class="small">기본 정보 수정</summary>
      <form id="f-pinfo" class="formgrid" style="margin-top:.5rem">
        <div class="field"><label class="label" for="pi-name">이름</label><input type="text" id="pi-name" required value="${h(p.name)}"></div>
        <div class="field"><label class="label" for="pi-birth">생년월일</label><input type="date" id="pi-birth" required min="1900-01-01" max="${localDate()}" value="${p.birthDate ?? ""}"></div>
        <div class="field"><label class="label" for="pi-visit">첫 내원일</label><input type="date" id="pi-visit" value="${p.firstVisit ?? ""}"></div>
        <div class="wide"><button class="btn primary sm" type="submit">저장</button></div>
      </form></details>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-act="tab" data-tab="${k}" aria-selected="${state.tab === k}">${l}</button>`).join("")}</div>
    ${{ overview: tOverview, schedule: tSchedule, visits: tVisits, soap: tSoap, history: tHistory, home: tHome, msg: tMsg }[state.tab](p)}`;
}

function newPatientHtml() {
  return `<section class="panel" style="max-width:34rem">
    <h2>환자 등록</h2>
    <p class="small muted">이름, 생년월일, 첫 내원일만 입력해 환자를 추가합니다. 진단이나 병력 같은 의료 정보는 여기서 받지 않습니다. 등록하면 초대 코드가 만들어지고, 환자나 보호자에게 알려 주면 앱에 가입할 수 있습니다.</p>
    <form id="f-patient" class="formgrid">
      <div class="field"><label class="label" for="np-name">이름</label><input type="text" id="np-name" required autocomplete="off"></div>
      <div class="field"><label class="label" for="np-birth">생년월일</label><input type="date" id="np-birth" required min="1900-01-01" max="${localDate()}"></div>
      <div class="field"><label class="label" for="np-visit">첫 내원일</label><input type="date" id="np-visit" value="${localDate()}" required></div>
      <div class="toolbar wide"><button class="btn primary" type="submit">등록</button>${cache.patients.length ? `<button class="btn ghost" type="button" data-act="t-dashboard">취소</button>` : ""}</div>
    </form></section>`;
}

function tOverview(p) {
  const ctx = view.ctx(p.id);
  const al = AI.screen(p, ctx);
  const st = AI.homeStats(ctx.programs, ctx.sessions);
  const tools = [...new Set(p.scores.map((x) => x.tool))];
  const chartTool = tools.includes("K-MBI") ? "K-MBI" : tools[0];
  const series = p.scores.filter((x) => x.tool === chartTool).sort((a, b) => a.date.localeCompare(b.date));
  const next = view.nextAppointment(p.id);
  const goalRow = (g) => `<li><span class="tag">${g.type}</span><span>${h(g.text)}${g.status !== "active" ? ` <span class="pill ${g.status === "met" ? "ok" : "plain"}">${{ met: "달성", revised: "수정됨", discontinued: "중단" }[g.status]}</span>` : ""}</span>
    <span class="toolbar" style="gap:.3rem;justify-content:end">${g.due ? `<span class="pill ${g.status !== "active" ? "plain" : g.due < localDate() ? "danger" : "plain"}">~${fmtDate(g.due)}</span>` : ""}${g.status === "active" ? `<button class="btn sm" data-act="goal-met" data-id="${g.id}">달성</button>` : ""}</span></li>`;
  return `<div class="grid2">
    <section class="panel"><div class="toolbar" style="justify-content:space-between"><h2>AI 검진 결과</h2><span class="pill info">자동</span></div>
      <div class="alerts">${al.length ? al.map((x) => `<div class="alert ${x.level}"><span class="dot"></span><span>${h(x.text)}</span></div>`).join("") : `<p class="muted">확인할 위험 신호가 없습니다.</p>`}</div>
      <p class="small muted">가정 운동, 카메라 측정값, 컨디션 기록, 결석, 목표 기한, 기록 공백을 확인합니다. 판단과 조치는 치료사가 합니다.</p>
      <p class="small">다음 치료: ${next ? `<b class="mono">${fmtDay(next.startsAt)} ${fmtTime(next.startsAt)}</b> ${KIND[next.kind]}` : `<span class="muted">없음</span> <button class="linklike" data-act="tab" data-tab="schedule">일정 추가</button>`}</p>
    </section>
    <section class="panel"><h2>목표</h2>
      ${p.goals.length ? `<ul class="goals">${p.goals.map(goalRow).join("")}</ul>` : `<p class="muted small">아직 목표가 없습니다. COAST 형식(누가·어떤 작업을·도움 수준·조건·기한)으로 추가하세요.</p>`}
      <details><summary class="small">목표 추가</summary>
        <form id="f-goal" class="formgrid" style="margin-top:.6rem">
          <div class="field"><label class="label" for="g-type">종류</label><select id="g-type"><option>STG</option><option>LTG</option></select></div>
          <div class="field"><label class="label" for="g-due">기한</label><input type="date" id="g-due"></div>
          <div class="field wide"><label class="label" for="g-text">목표 문장</label><textarea id="g-text" rows="2" required placeholder="변형 숟가락을 사용하여 식사를 2주 이내에 수정된 독립(Mod I) 수준으로 수행한다."></textarea></div>
          <div class="wide"><button class="btn primary" type="submit">추가</button></div>
        </form></details>
    </section>
    <section class="panel chart"><h2>${h(chartTool ?? "평가 점수")} 추이</h2>
      ${series.length ? lineChart(series, { label: `${chartTool} 추이` }) : `<p class="muted small">평가 점수를 입력하면 추이를 그립니다.</p>`}
      ${tools.length ? `<div class="tablewrap"><table><thead><tr><th>도구</th><th class="num">최근</th><th class="num">이전</th><th>측정일</th></tr></thead><tbody>${AI.latestScores(p.scores).map((x) => `<tr><td>${h(x.tool)}</td><td class="num">${x.value}${x.max ? "/" + x.max : ""}</td><td class="num">${x.prev ?? "–"}</td><td class="mono">${fmtDate(x.date)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <details><summary class="small">평가 점수 입력</summary>
        <form id="f-score" class="formgrid" style="margin-top:.6rem">
          <div class="field"><label class="label" for="sc-tool">평가 도구</label><input type="text" id="sc-tool" list="tools" required value="K-MBI"><datalist id="tools"><option>K-MBI</option><option>FIM</option><option>K-MMSE</option><option>BBT(Rt)</option><option>BBT(Lt)</option><option>MFT</option><option>FMA-UE</option><option>COPM 수행</option><option>COPM 만족</option></datalist></div>
          <div class="field"><label class="label" for="sc-value">점수</label><input type="text" id="sc-value" inputmode="decimal" required></div>
          <div class="field"><label class="label" for="sc-max">만점</label><input type="text" id="sc-max" inputmode="decimal" value="100"></div>
          <div class="field"><label class="label" for="sc-date">측정일</label><input type="date" id="sc-date" value="${localDate()}" required></div>
          <div class="wide"><button class="btn primary" type="submit">저장</button></div>
        </form></details>
    </section>
    <section class="panel"><h2>최근 7일 가정 운동</h2>
      <div class="bigcount"><div><span class="small muted">수행률</span><strong>${st.adherence ?? "–"}${st.adherence != null ? "%" : ""}</strong></div><div><span class="small muted">완료</span><strong>${st.done}/${st.expected}</strong></div><div><span class="small muted">최대 통증</span><strong>${st.maxPain}/10</strong></div></div>
      ${st.cam.length ? `<p class="small">카메라 측정 어깨 굽힘 최대각: ${st.cam.map((x) => `<span class="mono">${x.maxAngle}°</span>`).join(" → ")}</p>` : `<p class="small muted">카메라 측정 기록 없음</p>`}
    </section>
  </div>`;
}

function tSchedule(p) {
  const appts = view.appointments(p.id);
  const now = new Date().toISOString();
  const upcoming = appts.filter((a) => a.startsAt >= now || a.date === localDate());
  const past = appts.filter((a) => !upcoming.includes(a)).reverse().slice(0, 10);
  const sym = view.symptoms(p.id);
  const row = (a) => `<li class="appt"><span class="mono appt-time">${fmtDay(a.startsAt)} ${fmtTime(a.startsAt)}</span>
    <span class="appt-who">${KIND[a.kind]} · ${a.duration}분${a.note ? ` <span class="small muted">· ${h(a.note)}</span>` : ""}</span>
    <span class="appt-act">${a.status === "scheduled"
      ? `<button class="btn sm" data-act="appt-status" data-id="${a.id}" data-status="done">완료</button><button class="btn sm ghost" data-act="appt-status" data-id="${a.id}" data-status="no_show">결석</button><button class="btn sm ghost" data-act="appt-status" data-id="${a.id}" data-status="cancelled">취소</button>`
      : `<span class="pill ${STATUS_PILL[a.status]}">${STATUS[a.status]}</span>`}
      ${a.status === "done" || (a.status === "scheduled" && a.date <= localDate()) ? visitLinked(a) ? `<span class="pill ok">내원기록</span>` : `<button class="btn sm" data-act="write-visit" data-id="${a.patientId}" data-appt="${a.id}">내원기록</button>` : ""}</span></li>`;
  return `<div class="grid2">
    <section class="panel"><h2>치료 일정</h2>
      ${upcoming.length ? `<ul class="appts">${upcoming.map(row).join("")}</ul>` : `<p class="muted small">예정된 치료가 없습니다.</p>`}
      <details open><summary class="small">일정 추가</summary>${apptForm(p.id)}</details>
      ${past.length ? `<h3>지난 일정</h3><ul class="appts">${past.map(row).join("")}</ul>` : ""}
    </section>
    <section class="panel chart"><h2>컨디션 기록</h2>
      ${sym.length ? lineChart(sym.slice(-30).map((x) => ({ date: x.date, value: x.pain })), { max: 10, unit: "", label: "통증 추이", invert: true }) + `<p class="small muted">통증 0(없음)–10(매우 심함), 환자가 매일 입력</p>`
        : `<p class="muted small">${p.userId ? "환자가 아직 컨디션을 기록하지 않았습니다." : "환자가 앱에 가입하면 매일 통증·피로·기분을 기록할 수 있습니다."}</p>`}
      ${sym.length ? `<div class="tablewrap"><table><thead><tr><th>날짜</th><th class="num">통증</th><th class="num">피로</th><th class="num">기분</th><th class="num">수면</th><th>메모</th></tr></thead><tbody>
        ${sym.slice(-10).reverse().map((x) => `<tr><td class="mono">${fmtDate(x.date)}</td><td class="num">${x.pain}</td><td class="num">${x.fatigue ?? "–"}</td><td class="num">${x.mood ?? "–"}/5</td><td class="num">${x.sleep ?? "–"}/5</td><td>${h(x.note ?? "")}</td></tr>`).join("")}
      </tbody></table></div>` : ""}
    </section>
  </div>`;
}

/* ================= 내원기록 ================= */
const visitLinked = (a) => cache.visits.some((v) => v.appointmentId === a.id);

/** 치료 항목 하나: 체크하면 아래 세부 칸이 열린다 (CSS :has) */
function treatmentRow(t, prev) {
  const on = Boolean(prev);
  const fld = (f) => {
    const name = `${t.code}.${f}`, val = prev?.[f] ?? "";
    const label = f === "level" ? levelLabelOf(t) : FIELDS[f].label;
    const opts = f === "level" ? levelsOf(t) : FIELDS[f].options;
    const input = FIELDS[f].type === "select"
      ? `<select name="${name}"><option value="">–</option>${opts.map(([k, l]) => `<option value="${k}" ${String(val) === k ? "selected" : ""}>${l}</option>`).join("")}</select>`
      : `<input type="number" name="${name}" min="0" max="${FIELDS[f].max}" step="${FIELDS[f].step}" inputmode="decimal" value="${val}">`;
    return `<label class="vi-f"><span class="small muted">${label}</span>${input}</label>`;
  };
  return `<div class="vi" data-code="${t.code}" data-search="${h(`${t.label} ${t.code}`.toLowerCase())}">
    <label class="chk"><input type="checkbox" class="vi-on" name="t" value="${t.code}" ${on ? "checked" : ""}><span>${h(t.label)}</span></label>
    <div class="vi-detail">${[...t.fields, "response"].map(fld).join("")}
      <label class="vi-f vi-how"><span class="small muted">방법·메모</span><input type="text" name="${t.code}.how" maxlength="200" value="${h(prev?.how ?? "")}" placeholder="예: 팔꿈치 90도 유지, 테이블 지지"></label></div>
  </div>`;
}

/** 내가 자주 기록한 치료 (최근 내원기록 기준 상위 8개) */
function favoriteCodes() {
  const me = cache.profile.id, n = {};
  for (const v of cache.visits) if (v.therapistId === me) for (const it of v.items) n[it.code] = (n[it.code] ?? 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c).filter(treatment);
}

/** 같은 날 함께 기록할 수 있는 다른 환자 (그 날 일정이 있는 환자 먼저) */
function groupCandidates(p, date) {
  const hasAppt = (x) => cache.appointments.some((a) => a.patientId === x.id && a.date === date && a.status !== "cancelled");
  return cache.patients.filter((x) => x.id !== p.id).sort((a, b) => hasAppt(b) - hasAppt(a) || a.name.localeCompare(b.name, "ko")).map((x) => ({ ...x, today: hasAppt(x) }));
}

function visitForm(p) {
  const editing = state.visitEdit ? cache.visits.find((v) => v.id === state.visitEdit) : null;
  const prefill = editing ?? (state.visitPrefill ? cache.visits.find((v) => v.id === state.visitPrefill) : null);
  const byCode = Object.fromEntries((prefill?.items ?? []).map((it) => [it.code, it]));
  const appts = view.appointments(p.id).filter((a) => (a.id === editing?.appointmentId) || (a.date <= localDate() && a.date >= localDate(new Date(Date.now() - 30 * DAY)) && a.status !== "cancelled" && !visitLinked(a))).reverse();
  const pick = editing ? editing.appointmentId ?? "" : state.visitAppt && appts.some((a) => a.id === state.visitAppt) ? state.visitAppt : appts.find((a) => a.date === localDate())?.id ?? "";
  const picked = appts.find((a) => a.id === pick);
  const date = editing?.date ?? picked?.date ?? localDate();
  const last = view.visits(p.id)[0];
  const favs = favoriteCodes();
  const mates = editing ? [] : groupCandidates(p, date);
  return `<form id="f-visit" class="panel visitform">
    <div class="toolbar" style="justify-content:space-between"><h2>${editing ? `${fmtDate(editing.date)} 내원기록 수정` : "내원기록 작성"}</h2>
      ${editing ? `<button type="button" class="btn sm ghost" data-act="visit-cancel-edit">수정 취소</button>`
        : last ? `<button type="button" class="btn sm ghost" data-act="visit-copy" data-id="${last.id}">지난 기록(${fmtDate(last.date)}) 불러오기</button>` : ""}</div>
    ${prefill && !editing ? `<p class="small muted">${fmtDate(prefill.date)} 기록의 치료 항목과 값을 불러왔습니다. 오늘 한 대로 고쳐 저장하세요. <button type="button" class="linklike" data-act="visit-clear">비우기</button></p>` : ""}
    <div class="formgrid">
      <div class="field"><label class="label" for="vs-date">내원일</label><input type="date" id="vs-date" value="${date}" max="${localDate()}" required></div>
      <div class="field"><label class="label" for="vs-appt">연결할 일정</label><select id="vs-appt"><option value="">연결 안 함</option>${appts.map((a) => `<option value="${a.id}" ${a.id === pick ? "selected" : ""}>${fmtDay(a.startsAt)} ${fmtTime(a.startsAt)} ${KIND[a.kind]}${a.status === "scheduled" ? " (저장하면 완료 처리)" : ""}</option>`).join("")}</select></div>
      <div class="field"><label class="label" for="vs-dur">치료 시간(분)</label><input type="number" id="vs-dur" min="1" max="480" inputmode="numeric" value="${prefill?.duration ?? picked?.duration ?? 30}"></div>
    </div>
    <fieldset class="vgroup"><legend>한 치료 <span class="small muted" id="vi-count"></span></legend>
      <div class="vtools">
        <input type="search" id="vi-search" placeholder="치료 검색 (예: 덤벨, 식사, 퍼티)" autocomplete="off" aria-label="치료 검색">
        ${favs.length ? `<div class="favs"><span class="small muted">자주 쓰는 치료</span>${favs.map((c) => `<button type="button" class="chip" data-act="vi-fav" data-code="${c}" aria-pressed="${Boolean(byCode[c])}">${h(treatment(c).label)}</button>`).join("")}</div>` : ""}
      </div>
      <p class="small muted">체크하면 무게·세트·횟수·도움 수준 같은 세부 칸이 열립니다.</p>
      ${GROUPS.map(([g, label]) => `<div class="vcat"><h3>${label}</h3>${TREATMENTS.filter((t) => t.group === g).map((t) => treatmentRow(t, byCode[t.code])).join("")}</div>`).join("")}
      <p class="small muted vi-empty" hidden>검색한 치료가 없습니다. 메모 칸에 적어 주세요.</p>
    </fieldset>
    <fieldset class="vgroup"><legend>관찰·특이사항</legend>
      <div class="chkgrid">${OBSERVATIONS.map(([k, l]) => `<label class="chk"><input type="checkbox" name="obs" value="${k}" ${prefill?.observations.includes(k) ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>
    </fieldset>
    <div class="field"><label class="label" for="vs-note">메모 (선택)</label><textarea id="vs-note" rows="2" maxlength="2000" placeholder="체크리스트에 없는 치료나 특이사항. 환자·보호자 앱에도 보입니다.">${h(prefill?.note ?? "")}</textarea></div>
    ${mates.length ? `<details class="vgroup mates"><summary><b>그룹 치료</b> <span class="small muted">같은 내용을 다른 환자에게도 함께 저장</span></summary>
      <div class="chkgrid">${mates.map((x) => `<label class="chk"><input type="checkbox" name="mate" value="${x.id}"><span>${h(x.name)}${x.today ? ` <span class="pill plain">${fmtDate(date)} 일정</span>` : ""}</span></label>`).join("")}</div>
      <p class="small muted">함께 고른 환자에게도 같은 치료·관찰·메모가 저장되고, 그 날 일정이 있으면 연결되어 완료 처리됩니다.</p></details>` : ""}
    <div class="toolbar visit-actions">
      ${editing ? `<button class="btn primary" type="submit" data-next="stay">수정 저장</button>`
        : `<button class="btn primary" type="submit" data-next="soap">저장하고 SOAP 쓰기</button><button class="btn" type="submit" data-next="stay">저장만</button>`}
      <span class="small muted">저장한 기록은 SOAP 초안의 O(객관적) 칸에 자동으로 들어갑니다.</span></div>
  </form>`;
}

/** 치료별 변화: 같은 치료의 첫 기록과 최근 기록 비교 */
function progressTable(vs) {
  const rows = new Map();
  for (const v of [...vs].reverse()) for (const it of v.items) {
    const r = rows.get(it.code) ?? { n: 0, first: null, last: null };
    r.n++; r.first ??= { ...it, date: v.date }; r.last = { ...it, date: v.date };
    rows.set(it.code, r);
  }
  if (!rows.size) return "";
  const dose = (it) => itemSummary({ ...it, how: undefined }, "soap").split(" — ")[1] ?? "–";
  return `<section class="panel"><h2>치료별 변화</h2><div class="tablewrap"><table><thead><tr><th>치료</th><th class="num">횟수</th><th>처음</th><th>최근</th></tr></thead><tbody>
    ${[...rows].sort((a, b) => b[1].n - a[1].n).map(([code, r]) => `<tr><td>${h(treatment(code)?.label ?? code)}</td><td class="num">${r.n}</td><td class="small"><span class="mono">${fmtDate(r.first.date)}</span> ${h(dose(r.first))}</td><td class="small"><span class="mono">${fmtDate(r.last.date)}</span> ${h(dose(r.last))}</td></tr>`).join("")}
  </tbody></table></div></section>`;
}

function tVisits(p) {
  const vs = view.visits(p.id);
  const appt = (id) => cache.appointments.find((a) => a.id === id);
  return `${visitForm(p)}
  <div class="grid2">
    <section class="panel"><h2>내원기록 ${vs.length}건</h2>
      ${vs.length ? vs.map((v) => `<article class="visit">
        <div class="toolbar" style="justify-content:space-between"><strong class="mono">${h(v.date)}</strong>
          <span class="toolbar" style="gap:.3rem">${v.duration ? `<span class="pill plain">${v.duration}분</span>` : ""}${appt(v.appointmentId) ? `<span class="pill plain">${KIND[appt(v.appointmentId).kind]}</span>` : ""}${v.groupId ? `<span class="pill info">그룹 ${cache.visits.filter((x) => x.groupId === v.groupId).length}명</span>` : ""}<button class="btn sm ghost" data-act="edit-visit" data-id="${v.id}">수정</button><button class="btn sm ghost" data-act="del-visit" data-id="${v.id}">삭제</button></span></div>
        <ul class="vitems">${v.items.map((it) => `<li>${h(itemSummary(it))}</li>`).join("")}</ul>
        ${v.observations.length ? `<div class="flags">${v.observations.map((k) => `<span class="pill ${["fall_risk", "dizzy", "skin", "pain", "early_stop"].includes(k) ? "warn" : "plain"}">${h(observation(k))}</span>`).join("")}</div>` : ""}
        ${v.note ? `<p class="small">${h(v.note)}</p>` : ""}
      </article>`).join("") : `<p class="muted small">아직 내원기록이 없습니다. 위에서 오늘 한 치료를 체크해 저장하세요.</p>`}
    </section>
    ${progressTable(vs) || `<section class="panel"><h2>치료별 변화</h2><p class="muted small">내원기록이 쌓이면 치료마다 무게·횟수·도움 수준이 어떻게 바뀌었는지 보여 줍니다.</p></section>`}
  </div>`;
}

/** SOAP 작성 화면을 열 때: 같은 날짜의 임시 저장본이 있으면 이어 쓰고, 없으면 빈 초안 */
export function openDraft(pid, date = localDate()) {
  const d = view.draft(pid, date) ?? (date === localDate() ? view.draft(pid) : null);
  state.draft = d ? { id: d.id, patientId: pid, date: d.date, s: d.s, o: d.o, a: d.a, p: d.p } : { patientId: pid, date, s: "", o: "", a: "", p: "" };
  state.draftUsedAI = false; state.draftSavedAt = d ? d.createdAt : null;
  return state.draft;
}
/** 점검 비교 대상: 정정 기록이면 비교하지 않음 (원본과 비슷한 게 정상) */
export const compareNote = (d) => (d.amends ? null : view.notes(d.patientId).find((n) => n.id !== d.id) ?? null);

function tSoap(p) {
  if (!state.draft || state.draft.patientId !== p.id) openDraft(p.id);
  const d = state.draft;
  const prev = compareNote(d);
  const orig = d.amends ? cache.notes.find((n) => n.id === d.amends) : null;
  const row = (k, full, hint) => `<div class="soap-row"><div class="soap-key">${k.toUpperCase()}<small>${full}</small></div>
    <div class="field"><label class="small muted" for="soap-${k}">${hint}</label><textarea id="soap-${k}" data-soap="${k}" rows="4">${h(d[k])}</textarea></div></div>`;
  const saved = state.draftSavedAt ? new Date(state.draftSavedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "";
  return `<div class="soapgrid">
    <section class="panel">
      ${orig ? `<div class="amend-banner"><b>${fmtDate(orig.date)} 기록 정정</b><span class="small">원본은 그대로 남고, 정정 기록이 새로 서명되어 함께 보관됩니다. 환자에게는 정정된 평가가 보입니다.</span>
        <div class="field"><label class="label" for="soap-reason">정정 사유 (필수)</label><input type="text" id="soap-reason" maxlength="500" value="${h(d.reason ?? "")}" placeholder="예: K-MBI 점수 오기 수정 (52 → 55)"></div>
        <button class="btn sm ghost" data-act="cancel-amend">정정 취소</button></div>` : ""}
      <div class="toolbar" style="justify-content:space-between"><h2>기록 · <input type="date" id="soap-date" value="${d.date}" style="width:auto;display:inline-block;padding:.2rem .4rem" ${orig ? "disabled" : ""}></h2>
        <div class="toolbar">${orig ? "" : `<button class="btn" data-act="ai-draft">AI 초안 만들기</button><button class="btn" data-act="save-draft">임시 저장</button>`}<button class="btn primary" data-act="sign">${orig ? "정정 기록 서명" : "서명하고 저장"}</button></div></div>
      ${orig ? "" : `<p class="small muted draft-status" id="draft-status">${d.id ? `임시 저장됨${saved ? ` · ${saved}` : ""} · 입력을 멈추면 자동으로 저장됩니다 <button class="linklike" data-act="del-draft">초안 삭제</button>` : "입력을 멈추면 자동으로 임시 저장됩니다."}</p>`}
      <div class="soap">
        ${row("s", "주관적", "환자·보호자가 말한 것 (직접 인용)")}
        ${row("o", "객관적", "측정·관찰한 사실: 점수, 각도, 도움 수준, 시간")}
        ${row("a", "평가", "S와 O에 근거한 해석, 목표 대비 진전, 원인, 예후")}
        ${row("p", "계획", "다음에 할 일: 중재, 빈도, 가정 프로그램, 재평가일")}
      </div>
      <p class="small muted">서명한 기록은 수정하거나 지울 수 없습니다 (의무기록 무결성). 고칠 내용은 "기록 이력"에서 정정 기록으로 남깁니다.</p>
    </section>
    <aside class="panel" style="align-self:start">
      <div class="toolbar" style="justify-content:space-between"><h2>AI 기록 점검</h2><span class="num" id="chk-score"></span></div>
      <div class="meter"><i id="chk-meter" style="width:0"></i></div>
      <div class="checks" id="chk-list"></div>
      <p class="small muted">입력할 때마다 다시 점검합니다. 비교 대상: ${prev ? `${fmtDate(prev.date)} 기록` : orig ? "정정 기록은 비교하지 않음" : "없음"}</p>
    </aside>
  </div>`;
}

export function updateChecks() {
  if (!state.draft) return;
  const { items, score } = AI.checkNote(state.draft, compareNote(state.draft));
  const el = document.getElementById("chk-list"); if (!el) return;
  document.getElementById("chk-score").textContent = `${score}/100`;
  document.getElementById("chk-meter").style.width = score + "%";
  el.innerHTML = items.length ? items.map((x) => `<div class="check"><span class="pill ${x.level}">${x.sec} ${x.level === "danger" ? "필수" : x.level === "warn" ? "주의" : "제안"}</span><span>${h(x.text)}</span></div>`).join("")
    : `<p class="pill ok" style="justify-self:start">형식 점검을 모두 통과했습니다</p>`;
}

function tHistory(p) {
  const all = view.notes(p.id);
  const originals = all.filter((n) => !n.amendsId);
  const amendsOf = (id) => all.filter((n) => n.amendsId === id).sort((a, b) => (a.signedAt ?? "").localeCompare(b.signedAt ?? ""));
  const body = (n) => `<dl><dt>S</dt><dd>${h(n.s)}</dd><dt>O</dt><dd>${h(n.o)}</dd><dt>A</dt><dd>${h(n.a)}</dd><dt>P</dt><dd>${h(n.p)}</dd></dl>`;
  const when = (n) => n.signedAt ? new Date(n.signedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const drafts = cache.notes.filter((n) => n.patientId === p.id && n.status === "draft");
  return `<section class="panel"><h2>SOAP 기록 ${originals.length}건</h2>
    ${drafts.length ? `<p class="small">임시 저장한 초안 ${drafts.length}건: ${drafts.map((n) => `<button class="linklike" data-act="open-draft" data-date="${n.date}">${fmtDate(n.date)} 이어 쓰기</button>`).join(" · ")}</p>` : ""}
    ${originals.map((n) => { const am = amendsOf(n.id); return `<article class="note">
    <div class="toolbar" style="justify-content:space-between"><strong class="mono">${h(n.date)}</strong>
      <span class="toolbar" style="gap:.3rem">${am.length ? `<span class="pill warn">정정 ${am.length}회</span>` : ""}<span class="pill ok">서명 · ${h(cache.names[n.author] ?? "")} · ${when(n)}</span><button class="btn sm ghost" data-act="amend" data-id="${n.id}">정정 기록 쓰기</button></span></div>
    ${am.length ? `${am.map((x) => `<div class="amend"><div class="small"><b>정정 기록</b> · ${when(x)} · ${h(cache.names[x.author] ?? "")} · 사유: ${h(x.amendReason)}</div>${body(x)}</div>`).join("")}
      <details><summary class="small">원본 보기</summary>${body(n)}</details>` : body(n)}
  </article>`; }).join("") || `<p class="muted">아직 기록이 없습니다. "SOAP 작성" 탭에서 첫 기록을 남기세요.</p>`}</section>`;
}

function tHome(p) {
  const progs = view.programs(p.id);
  const ss = view.sessions(p.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
  const title = (id) => cache.programs.find((y) => y.id === id)?.title ?? "(중단된 운동)";
  return `<div class="grid2">
  <section class="panel"><h2>처방한 가정 프로그램</h2>
    ${progs.map((x) => `<div class="task"><div style="min-width:0"><strong>${h(x.title)}</strong> ${x.camera ? `<span class="pill info">카메라 측정</span>` : ""}<p class="small muted">${h(x.detail)}</p><span class="mono small">${x.target}${h(x.unit)} · 하루 ${x.perDay}회</span></div><button class="btn sm ghost" data-act="stop-prog" data-id="${x.id}">중단</button></div>`).join("") || `<p class="muted small">처방한 운동이 없습니다.</p>`}
    <form id="f-prog" class="panel" style="background:var(--paper)">
      <h3>새 프로그램 처방</h3>
      <div class="field"><label class="label" for="pg-title">운동 이름</label><input type="text" id="pg-title" required placeholder="예: 어깨 앞으로 들어올리기"></div>
      <div class="field"><label class="label" for="pg-detail">환자에게 보일 설명</label><textarea id="pg-detail" rows="2" required placeholder="자세, 속도, 멈춰야 할 때를 쉬운 말로 적어 주세요."></textarea></div>
      <div class="formgrid">
        <div class="field"><label class="label" for="pg-target">목표 횟수</label><input type="text" id="pg-target" inputmode="numeric" value="10"></div>
        <div class="field"><label class="label" for="pg-perday">하루 횟수</label><input type="text" id="pg-perday" inputmode="numeric" value="1"></div>
        <div class="field"><label class="label" for="pg-camera">카메라 측정</label><select id="pg-camera"><option value="">사용 안 함</option><option value="shoulder_flexion">어깨 굽힘 각도·횟수</option></select></div>
        <div class="field"><label class="label" for="pg-angle">목표 각도(°)</label><input type="text" id="pg-angle" inputmode="numeric" value="90"></div>
      </div>
      <button class="btn primary" type="submit">처방 보내기</button>
    </form>
  </section>
  <section class="panel"><h2>환자 수행 기록</h2>${ss.length ? `<div class="tablewrap"><table><thead><tr><th>날짜</th><th>운동</th><th class="num">횟수</th><th class="num">최대각</th><th class="num">통증</th><th>방법</th></tr></thead><tbody>
    ${ss.map((x) => `<tr><td class="mono">${fmtDate(x.at)}</td><td>${h(title(x.programId))}${x.comment ? `<div class="small muted">“${h(x.comment)}”</div>` : ""}</td><td class="num">${x.reps ?? "–"}</td><td class="num">${x.maxAngle != null ? x.maxAngle + "°" : "–"}</td><td class="num">${x.pain ?? "–"}</td><td>${x.source === "camera" ? `<span class="pill info">카메라</span>` : `<span class="pill plain">직접</span>`}</td></tr>`).join("")}
  </tbody></table></div>` : `<p class="muted small">${p.userId ? "아직 수행 기록이 없습니다." : "환자가 앱에 가입하면 수행 기록이 여기에 쌓입니다."}</p>`}</section></div>`;
}

export function threadHtml(pid) {
  const me = cache.profile.id;
  const ms = view.messages(pid);
  return `<div class="thread" data-pid="${pid}">${ms.length ? ms.map((m) => {
    if (m.from === "ai") return `<div class="msg ai">${h(m.text)}</div>`;
    const who = m.senderId === me ? "" : `<span class="small muted">${h(cache.names[m.senderId] ?? "")}</span>`;
    return `<div class="msg ${m.senderId === me ? "me" : "them"}">${who}<span>${m.triage === "danger" ? `<span class="pill danger">확인 필요</span> ` : m.triage === "warn" ? `<span class="pill warn">통증</span> ` : ""}${h(m.text)}</span><time>${new Date(m.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>`;
  }).join("") : `<p class="muted small" style="text-align:center">아직 대화가 없습니다.</p>`}</div>`;
}
export function composer() {
  return `<form class="composer" id="f-msg"><input type="text" id="msg-text" placeholder="메시지 입력" autocomplete="off" required maxlength="4000"><button class="btn primary">보내기</button></form>`;
}
function tMsg(p) {
  return `<section class="panel"><div class="toolbar" style="justify-content:space-between"><h2>${h(p.name)}님과 대화</h2>
    <button class="btn sm" data-act="ai-reply">AI 답장 초안</button></div>
    ${p.userId ? threadHtml(p.id) + composer() : `<p class="muted small">환자가 초대 코드로 앱에 가입하면 대화할 수 있습니다.</p>`}</section>`;
}
