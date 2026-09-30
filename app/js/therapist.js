/* 치료사 화면: 대시보드 + 환자별 상세 (요약, 일정·컨디션, SOAP, 이력, 가정 프로그램, 메시지) */
import { cache, view } from "./data.js";
import * as AI from "./ai.js";
import { state } from "./state.js";
import { h, localDate, fmtDate, DAY } from "./util.js";
import { lineChart, spark } from "./charts.js";
import { topbar, KIND, STATUS, STATUS_PILL, fmtTime, fmtDay, dday, fmtBirth } from "./layout.js";

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
  const week = cache.appointments.filter((a) => a.date > today && a.date <= plusDays(7) && a.status === "scheduled").sort(byTime);
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

      <section class="panel">
        <h2>다가오는 기한 (2주)</h2>
        ${deadlines.length ? `<ul class="deadlines">${deadlines.map((d) => `<li><span class="pill ${d.date < today ? "danger" : d.date <= plusDays(3) ? "warn" : "plain"}">${dday(d.date)}</span><span><button class="linklike" data-act="pick" data-id="${d.p?.id}"><b>${h(d.p?.name ?? "")}</b></button> ${h(d.text)}<br><span class="small muted">${h(d.sub)}</span></span></li>`).join("")}</ul>` : `<p class="muted small">2주 안에 끝나는 목표나 재평가가 없습니다.</p>`}
      </section>

      <section class="panel">
        <h2>이번 주 일정</h2>
        ${week.length ? `<ul class="appts">${week.map((a) => apptRow(a, true)).join("")}</ul>` : `<p class="muted small">앞으로 7일간 예정된 치료가 없습니다.</p>`}
      </section>
    </div>

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

function apptForm(patientId) {
  const opts = cache.patients.map((p) => `<option value="${p.id}" ${p.id === patientId ? "selected" : ""}>${h(p.name)}</option>`).join("");
  return `<form id="f-appt" class="formgrid" style="margin-top:.6rem">
    ${patientId ? `<input type="hidden" id="ap-patient" value="${patientId}">` : `<div class="field wide"><label class="label" for="ap-patient">환자</label><select id="ap-patient" required>${opts}</select></div>`}
    <div class="field"><label class="label" for="ap-date">날짜</label><input type="date" id="ap-date" value="${localDate()}" required></div>
    <div class="field"><label class="label" for="ap-time">시간</label><input type="time" id="ap-time" value="10:00" required></div>
    <div class="field"><label class="label" for="ap-kind">종류</label><select id="ap-kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
    <div class="field"><label class="label" for="ap-dur">시간(분)</label><input type="text" id="ap-dur" inputmode="numeric" value="30"></div>
    <div class="field wide"><label class="label" for="ap-note">메모 (선택)</label><input type="text" id="ap-note" maxlength="200" placeholder="예: 보호자 동반, K-MBI 재평가"></div>
    <div class="wide"><button class="btn primary" type="submit">일정 추가</button></div>
  </form>`;
}

/* ================= 환자 상세 ================= */
function patientDetailHtml(p) {
  const un = view.unread(p.id);
  const tabs = [["overview", "요약·AI 검진"], ["schedule", "일정·컨디션"], ["soap", "SOAP 작성"], ["history", "기록 이력"], ["home", "가정 프로그램"], ["msg", `메시지${un ? ` (${un})` : ""}`]];
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
    ${{ overview: tOverview, schedule: tSchedule, soap: tSoap, history: tHistory, home: tHome, msg: tMsg }[state.tab](p)}`;
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
      : `<span class="pill ${STATUS_PILL[a.status]}">${STATUS[a.status]}</span>`}</span></li>`;
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

function tSoap(p) {
  const prev = view.notes(p.id)[0];
  if (!state.draft || state.draft.patientId !== p.id) { state.draft = { patientId: p.id, date: localDate(), s: "", o: "", a: "", p: "" }; state.draftUsedAI = false; }
  const d = state.draft;
  const row = (k, full, hint) => `<div class="soap-row"><div class="soap-key">${k.toUpperCase()}<small>${full}</small></div>
    <div class="field"><label class="small muted" for="soap-${k}">${hint}</label><textarea id="soap-${k}" data-soap="${k}" rows="4">${h(d[k])}</textarea></div></div>`;
  return `<div class="soapgrid">
    <section class="panel">
      <div class="toolbar" style="justify-content:space-between"><h2>기록 · <input type="date" id="soap-date" value="${d.date}" style="width:auto;display:inline-block;padding:.2rem .4rem"></h2>
        <div class="toolbar"><button class="btn" data-act="ai-draft">AI 초안 만들기</button><button class="btn primary" data-act="sign">서명하고 저장</button></div></div>
      <div class="soap">
        ${row("s", "주관적", "환자·보호자가 말한 것 (직접 인용)")}
        ${row("o", "객관적", "측정·관찰한 사실: 점수, 각도, 도움 수준, 시간")}
        ${row("a", "평가", "S와 O에 근거한 해석, 목표 대비 진전, 원인, 예후")}
        ${row("p", "계획", "다음에 할 일: 중재, 빈도, 가정 프로그램, 재평가일")}
      </div>
      <p class="small muted">서명한 기록은 수정하거나 지울 수 없습니다 (의무기록 무결성).</p>
    </section>
    <aside class="panel" style="align-self:start">
      <div class="toolbar" style="justify-content:space-between"><h2>AI 기록 점검</h2><span class="num" id="chk-score"></span></div>
      <div class="meter"><i id="chk-meter" style="width:0"></i></div>
      <div class="checks" id="chk-list"></div>
      <p class="small muted">입력할 때마다 다시 점검합니다. 비교 대상: ${prev ? `${fmtDate(prev.date)} 기록` : "없음"}</p>
    </aside>
  </div>`;
}

export function updateChecks() {
  if (!state.draft) return;
  const prev = view.notes(state.selected)[0];
  const { items, score } = AI.checkNote(state.draft, prev);
  const el = document.getElementById("chk-list"); if (!el) return;
  document.getElementById("chk-score").textContent = `${score}/100`;
  document.getElementById("chk-meter").style.width = score + "%";
  el.innerHTML = items.length ? items.map((x) => `<div class="check"><span class="pill ${x.level}">${x.sec} ${x.level === "danger" ? "필수" : x.level === "warn" ? "주의" : "제안"}</span><span>${h(x.text)}</span></div>`).join("")
    : `<p class="pill ok" style="justify-self:start">형식 점검을 모두 통과했습니다</p>`;
}

function tHistory(p) {
  const ns = view.notes(p.id);
  return `<section class="panel"><h2>SOAP 기록 ${ns.length}건</h2>${ns.map((n) => `<article class="note">
    <div class="toolbar" style="justify-content:space-between"><strong class="mono">${h(n.date)}</strong><span class="pill ${n.status === "signed" ? "ok" : "plain"}">${n.status === "signed" ? `서명 · ${h(cache.names[n.author] ?? "")}` : "임시 저장"}</span></div>
    <dl><dt>S</dt><dd>${h(n.s)}</dd><dt>O</dt><dd>${h(n.o)}</dd><dt>A</dt><dd>${h(n.a)}</dd><dt>P</dt><dd>${h(n.p)}</dd></dl></article>`).join("") || `<p class="muted">아직 기록이 없습니다. "SOAP 작성" 탭에서 첫 기록을 남기세요.</p>`}</section>`;
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
