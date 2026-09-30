/* 환자·보호자 화면: 홈(대시보드) / 운동 / 내 기록 / 치료사와 대화 */
import { cache, view } from "./data.js";
import * as AI from "./ai.js";
import { state } from "./state.js";
import { h, localDate, fmtDate, DAY } from "./util.js";
import { lineChart, ring } from "./charts.js";
import { topbar, KIND, STATUS, STATUS_PILL, fmtTime, fmtDay, dday } from "./layout.js";
import { threadHtml, composer } from "./therapist.js";

export const MOOD = ["", "매우 나쁨", "나쁨", "보통", "좋음", "매우 좋음"];
export const SLEEP = ["", "거의 못 잠", "자주 깸", "보통", "잘 잠", "푹 잠"];

export function patientHtml() {
  const p = cache.patients[0];
  if (!p) return `${topbar()}<main class="papp"><div class="empty">연결된 치료 기록을 찾을 수 없습니다. 담당 작업치료사에게 문의해 주세요.</div></main>`;
  const un = view.unread(p.id);
  const tabs = [["home", "홈"], ["exercise", "오늘 운동"], ["records", "내 기록"], ["msg", `치료사와 대화${un ? ` (${un})` : ""}`]];
  const guardian = cache.profile.relation === "guardian";
  const hello = guardian
    ? `<h1>${h(cache.profile.name)} 보호자님, 반가워요</h1><p class="muted">${h(p.name)}님의 재활을 함께하고 계세요.</p>`
    : `<h1>${h(cache.profile.name)}님, 오늘도 한 걸음</h1>`;
  const views = { home: homeHtml, exercise: exerciseHtml, records: recordsHtml, msg: msgHtml };
  return `${topbar()}<main class="papp">
    <div class="hello"><span class="label">${new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })}</span>${hello}</div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-act="ptab" data-tab="${k}" aria-selected="${state.ptab === k}">${l}</button>`).join("")}</div>
    ${views[state.ptab](p)}
  </main>`;
}

function todayProgress(p) {
  const ctx = view.ctx(p.id);
  const today = ctx.sessions.filter((x) => x.date === localDate());
  const need = ctx.programs.reduce((t, x) => t + x.perDay, 0);
  const done = ctx.programs.reduce((t, x) => t + Math.min(x.perDay, today.filter((s) => s.programId === x.id).length), 0);
  return { ctx, today, need, done };
}

function homeHtml(p) {
  const { ctx, need, done } = todayProgress(p);
  const next = view.nextAppointment(p.id);
  const streak = AI.streakDays(ctx.sessions);
  const st = AI.homeStats(ctx.programs, ctx.sessions);
  const todayLog = ctx.symptoms.find((x) => x.date === localDate());
  const un = view.unread(p.id);
  const goals = p.goals.filter((g) => g.status === "active");
  const met = p.goals.filter((g) => g.status === "met").length;

  return `${un ? `<button class="banner" data-act="ptab" data-tab="msg"><b>치료사에게서 새 메시지 ${un}개</b><span>눌러서 확인하기</span></button>` : ""}
    <div class="pcards">
      <section class="panel pcard">
        <span class="label">다음 치료</span>
        ${next ? `<strong class="big">${fmtDay(next.startsAt)} ${fmtTime(next.startsAt)}</strong><span>${KIND[next.kind]} · ${next.duration}분 <span class="pill info">${dday(next.date)}</span></span>${next.note ? `<span class="small muted">${h(next.note)}</span>` : ""}`
          : `<strong class="big muted">예정 없음</strong><span class="small muted">치료사가 일정을 잡으면 여기에 보여요.</span>`}
      </section>
      <section class="panel pcard pcard-ring">
        ${ring(done, need)}
        <div><span class="label">오늘 운동</span><strong>${need ? (done >= need ? "모두 했어요" : `${need - done}개 남았어요`) : "처방된 운동 없음"}</strong>
          ${need && done < need ? `<button class="btn primary sm" data-act="ptab" data-tab="exercise">운동하러 가기</button>` : ""}</div>
      </section>
      <section class="panel pcard">
        <span class="label">꾸준함</span>
        <strong class="big">${streak}일 연속</strong>
        <span class="small muted">이번 주 수행률 ${st.adherence ?? "–"}${st.adherence != null ? "%" : ""}</span>
      </section>
    </div>

    <section class="panel">
      <div class="toolbar" style="justify-content:space-between"><h2>오늘 컨디션</h2>${todayLog && !state.editSymptom ? `<button class="btn sm" data-act="edit-symptom">수정</button>` : ""}</div>
      ${todayLog && !state.editSymptom ? `<div class="symptoms">
          <span class="pill ${todayLog.pain >= 6 ? "danger" : todayLog.pain >= 4 ? "warn" : "ok"}">통증 ${todayLog.pain}/10</span>
          ${todayLog.fatigue != null ? `<span class="pill plain">피로 ${todayLog.fatigue}/10</span>` : ""}
          ${todayLog.mood ? `<span class="pill plain">기분 ${MOOD[todayLog.mood]}</span>` : ""}
          ${todayLog.sleep ? `<span class="pill plain">수면 ${SLEEP[todayLog.sleep]}</span>` : ""}
        </div>${todayLog.note ? `<p class="small">“${h(todayLog.note)}”</p>` : ""}<p class="small muted">기록한 내용은 담당 치료사가 봅니다.</p>`
        : symptomForm(todayLog)}
    </section>

    <section class="panel plain-summary">
      <div class="toolbar" style="justify-content:space-between"><h2>지금 목표</h2>${met ? `<span class="pill ok">달성 ${met}개</span>` : ""}</div>
      ${goals.length ? `<ul>${goals.map((g) => `<li>${h(AI.plainGoal(g.text))}${g.due ? ` <span class="small muted">(${fmtDate(g.due)}까지)</span>` : ""}</li>`).join("")}</ul>` : `<p class="muted small">치료사가 목표를 정하면 여기에 보여요.</p>`}
      <p class="small muted">목표 문장은 AI가 쉬운 말로 바꾼 것입니다.</p>
    </section>`;
}

function symptomForm(prev) {
  const v = prev ?? { pain: 0, fatigue: 0, mood: 3, sleep: 3, note: "" };
  const slider = (id, label, min, max, val, names) => `<div class="field"><label class="label" for="${id}">${label}: <span class="mono" data-out="${id}">${names ? names[val] : val}</span></label>
    <input type="range" id="${id}" min="${min}" max="${max}" value="${val}" ${names ? `data-names="${names.join("|")}"` : ""}></div>`;
  return `<form id="f-symptom" class="symptom-form">
    ${slider("sy-pain", "통증 (0 없음 – 10 매우 심함)", 0, 10, v.pain)}
    ${slider("sy-fatigue", "피로 (0 – 10)", 0, 10, v.fatigue ?? 0)}
    ${slider("sy-mood", "기분", 1, 5, v.mood ?? 3, MOOD)}
    ${slider("sy-sleep", "어젯밤 잠", 1, 5, v.sleep ?? 3, SLEEP)}
    <div class="field"><label class="label" for="sy-note">치료사에게 남길 말 (선택)</label><input type="text" id="sy-note" maxlength="300" value="${h(v.note ?? "")}" placeholder="예: 오른쪽 어깨가 아침에 뻣뻣해요"></div>
    <div class="toolbar"><button class="btn primary" type="submit">오늘 컨디션 저장</button>${prev ? `<button class="btn ghost" type="button" data-act="cancel-symptom">취소</button>` : ""}</div>
  </form>`;
}

function exerciseHtml(p) {
  const { ctx, today, need } = todayProgress(p);
  const days = [...Array(7)].map((_, i) => localDate(new Date(Date.now() - (6 - i) * DAY)));
  const streak = days.map((d) => { const n = ctx.sessions.filter((x) => x.date === d).length; return { d, n, cls: need && n >= need ? "full" : n ? "part" : "" }; });
  return `<section class="panel"><div class="toolbar" style="justify-content:space-between"><h2>오늘의 재활 운동</h2><span class="muted small">${today.length}/${need} 완료</span></div>
      ${ctx.programs.map((x) => { const done = today.filter((s) => s.programId === x.id).length >= x.perDay;
        return `<div class="task"><div style="min-width:0"><strong>${h(x.title)}</strong> <span class="mono small muted">${x.target}${h(x.unit)}${x.perDay > 1 ? ` · 하루 ${x.perDay}번` : ""}</span><p class="small muted">${h(x.detail)}</p></div>
        ${done ? `<span class="done">완료</span>` : x.camera ? `<button class="btn primary" data-act="cam" data-id="${x.id}">카메라로 시작</button>` : `<button class="btn" data-act="manual" data-id="${x.id}">했어요</button>`}</div>`; }).join("") || `<p class="muted small">치료사가 운동을 처방하면 여기에 나타나요.</p>`}
      <p class="small muted">운동 중 통증이 5 이상이면 멈추고 치료사에게 알려 주세요. 카메라 영상은 이 기기 밖으로 나가지 않습니다.</p>
    </section>
    <section class="panel"><h2>지난 7일</h2><div class="streak">${streak.map((x) => `<div><b class="${x.cls}">${x.n}</b>${fmtDate(x.d)}</div>`).join("")}</div></section>`;
}

function recordsHtml(p) {
  const ctx = view.ctx(p.id);
  const k = AI.latestScores(p.scores).find((x) => x.tool === "K-MBI");
  const kSeries = p.scores.filter((x) => x.tool === "K-MBI").sort((a, b) => a.date.localeCompare(b.date));
  const pains = ctx.symptoms.slice(-30).map((x) => ({ date: x.date, value: x.pain }));
  const past = ctx.appointments.filter((a) => a.startsAt < new Date().toISOString()).reverse().slice(0, 8);
  return `<section class="panel plain-summary"><h2>내 회복 상황을 쉽게 정리했어요</h2>
      ${k ? `<p>일상생활 점수(K-MBI)는 지금 <b class="mono">${k.value}점</b>이에요${k.prev != null ? ` (이전 ${k.prev}점에서 ${k.value >= k.prev ? "올랐어요" : "조금 내려갔어요"})` : ""}. 100점 만점이에요.</p>` : `<p class="muted small">치료사가 평가 점수를 입력하면 여기에 보여요.</p>`}
      ${cache.myLatest ? `<div><h3>${fmtDate(cache.myLatest.date)} 치료사 평가</h3><p class="small">${h(cache.myLatest.a)}</p></div>` : ""}
    </section>
    ${kSeries.length ? `<section class="panel chart"><h2>일상생활 점수 변화</h2>${lineChart(kSeries, { max: 100, label: "K-MBI 추이" })}</section>` : ""}
    <section class="panel chart"><h2>통증 기록</h2>${pains.length ? lineChart(pains, { max: 10, unit: "", label: "통증 추이", invert: true }) : `<p class="muted small">홈에서 매일 컨디션을 기록하면 그래프가 그려져요.</p>`}</section>
    ${past.length ? `<section class="panel"><h2>지난 치료</h2><ul class="appts">${past.map((a) => `<li class="appt"><span class="mono appt-time">${fmtDay(a.startsAt)}</span><span class="appt-who">${KIND[a.kind]}</span><span class="appt-act"><span class="pill ${STATUS_PILL[a.status]}">${STATUS[a.status]}</span></span></li>`).join("")}</ul></section>` : ""}`;
}

function msgHtml(p) {
  return `<section class="panel"><h2>${h(cache.names[p.therapistId] ?? "")} 치료사</h2>${threadHtml(p.id)}${composer()}
    <p class="small muted">통증, 붓기, 저림 같은 증상을 쓰면 치료사에게 먼저 알려요. 응급 상황은 119에 연락하세요.</p></section>`;
}
