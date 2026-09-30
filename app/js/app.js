/* SOAPO 앱: 화면 그리기와 사용자 동작 처리
   데이터는 data.js(Supabase), AI 보조는 ai.js, 카메라는 camera.js */

import * as D from "./data.js";
import * as AI from "./ai.js";
import { openCamera } from "./camera.js";
import { h, toast, localDate, fmtDate } from "./util.js";

const { cache, view } = D;
const app = document.getElementById("app");

const state = {
  phase: "loading",          // loading | setup | auth | onboard | ready | error
  userId: null, email: "", authStep: "email", role: "patient", error: "",
  selected: null, tab: "overview", ptab: "today", newPatient: false,
  draft: null, draftUsedAI: false,
};
let unsubscribe = null;

/* ================= 시작 & 로그인 상태 ================= */
function boot() {
  if (!D.configured) { state.phase = "setup"; return render(); }
  // 메일 링크가 만료되었거나 잘못된 경우 Supabase가 주소 뒤에 오류를 붙여 돌려보낸다
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.get("error_description")) {
    toast(hp.get("error_code") === "otp_expired" ? "로그인 링크가 만료되었습니다. 새 링크를 요청해 주세요." : hp.get("error_description"), "error");
    history.replaceState(null, "", location.pathname);
  }
  D.sb.auth.onAuthStateChange((event, session) => {
    // 콜백 안에서 바로 Supabase를 다시 부르면 멈출 수 있어 다음 틱으로 넘긴다
    setTimeout(() => onSession(session), 0);
  });
}

async function onSession(session) {
  const uid = session?.user?.id ?? null;
  if (!uid) {
    unsubscribe?.(); unsubscribe = null; D.clearCache();
    Object.assign(state, { phase: "auth", userId: null, authStep: "email", selected: null, draft: null });
    return render();
  }
  if (uid === state.userId && state.phase !== "error") return; // 토큰 갱신 등
  state.userId = uid; state.email = session.user.email ?? "";
  state.phase = "loading"; render();
  try {
    const profile = await D.loadProfile(uid);
    if (!profile) { state.phase = "onboard"; return render(); }
    await enter();
  } catch (e) { state.phase = "error"; state.error = D.explain(e); render(); }
}

async function enter() {
  await D.loadAll();
  unsubscribe?.();
  unsubscribe = D.subscribeMessages(onNewMessage);
  state.phase = "ready";
  if (location.hash.includes("access_token")) history.replaceState(null, "", location.pathname);
  render();
}

function onNewMessage(row) {
  const th = app.querySelector(".thread");
  if (th && th.dataset.pid === row.patient_id) { th.outerHTML = threadHtml(row.patient_id); scrollThread(); return; }
  if (cache.profile.role === "therapist") {
    const p = view.patient(row.patient_id);
    toast(`${p?.name ?? "환자"}님의 새 메시지`);
    renderRailOnly();
  } else toast("치료사에게서 새 메시지가 왔어요");
}

/* ================= 공통 ================= */
function render() {
  const r = { loading: () => `<div class="loading">불러오는 중…</div>`, setup: setupHtml, auth: authHtml, onboard: onboardHtml, error: errorHtml, ready: readyHtml }[state.phase];
  app.innerHTML = r();
  scrollThread();
  if (state.phase === "ready" && cache.profile.role === "therapist" && state.tab === "soap") updateChecks();
}
function readyHtml() { return cache.profile.role === "therapist" ? therapistHtml() : patientHtml(); }
function scrollThread() { const th = app.querySelector(".thread"); if (th) th.scrollTop = th.scrollHeight; }

/** 버튼을 잠그고 비동기 작업을 실행, 실패하면 이유를 보여 준다 */
async function run(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); }
  catch (e) { console.error(e); toast(D.explain(e), "error"); throw e; }
  finally { if (btn?.isConnected) btn.disabled = false; }
}

function topbar() {
  const p = cache.profile;
  return `<header class="topbar">
    <div class="brand"><span class="mark">SOAP·O</span><span>재활노트</span><span class="sub">${p.role === "therapist" ? "치료사용" : "환자용"}</span></div>
    <div class="spacer"></div>
    <div class="userchip"><span>${h(p.name)}<span class="email"> · ${h(state.email)}</span></span><button class="btn sm" data-act="logout">로그아웃</button></div>
  </header>`;
}

/* ================= 설정 안내 / 오류 ================= */
function setupHtml() {
  return `<main class="auth"><div class="card"><h2>Supabase 연결이 필요합니다</h2>
    <p class="small">아직 Supabase가 연결되지 않았습니다. README의 "실제 서비스로 올리기"를 따라 설정하면 이 화면이 로그인 화면으로 바뀝니다.</p>
    <p class="small">그동안 <a href="demo/">데모</a>에서 가짜 데이터로 기능을 체험할 수 있습니다.</p></div></main>`;
}
function errorHtml() {
  return `<main class="auth"><div class="card"><h2>불러오지 못했습니다</h2><p class="small">${h(state.error)}</p>
    <div class="toolbar"><button class="btn primary" data-act="retry">다시 시도</button><button class="btn ghost" data-act="logout">로그아웃</button></div></div></main>`;
}

/* ================= 로그인 (이메일 매직링크 + 6자리 코드) ================= */
function authHtml() {
  const body = state.authStep === "email"
    ? `<form class="card" id="f-email">
        <div class="field"><label class="label" for="email">이메일</label>
          <input type="email" id="email" required placeholder="you@hospital.kr" value="${h(state.email)}" autocomplete="email"></div>
        <button class="btn primary" type="submit">로그인 메일 받기</button>
        <p class="small muted">비밀번호 없이 메일로 받은 링크나 코드로 로그인합니다. 처음이면 자동으로 가입됩니다.</p>
      </form>`
    : `<div class="card">
        <h2>메일을 확인하세요</h2>
        <p><span class="mono">${h(state.email)}</span>로 로그인 메일을 보냈습니다.</p>
        <p class="small muted">메일의 링크를 이 기기에서 누르면 바로 로그인됩니다. 다른 기기에서 메일을 열었다면 메일 속 6자리 코드를 아래에 입력하세요.</p>
        <form id="f-code" class="field" style="gap:.6rem">
          <label class="label" for="otp">6자리 코드</label>
          <input type="text" id="otp" class="code-input" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required>
          <button class="btn primary" type="submit">코드로 로그인</button>
        </form>
        <div class="toolbar"><button class="btn ghost" data-act="resend">메일 다시 보내기</button><button class="btn ghost" data-act="auth-back">다른 이메일</button></div>
      </div>`;
  return `<main class="auth">
    <div class="brand" style="font-size:1.4rem"><span class="mark">SOAP·O</span><span>재활노트</span></div>
    <p class="muted">작업치료사의 SOAP 기록과 환자의 가정 재활을 한곳에서 잇습니다.</p>
    ${body}</main>`;
}

/* ================= 첫 로그인: 역할 선택 ================= */
function onboardHtml() {
  const pt = state.role === "patient";
  return `<main class="auth"><form class="card" id="f-onboard">
    <h2>처음 오셨네요</h2><p class="small muted mono">${h(state.email)}</p>
    <div class="seg" role="group" aria-label="역할">
      <button type="button" data-act="role" data-role="patient" aria-pressed="${pt}">환자·보호자</button>
      <button type="button" data-act="role" data-role="therapist" aria-pressed="${!pt}">작업치료사</button>
    </div>
    <div class="field"><label class="label" for="ob-name">이름</label><input type="text" id="ob-name" required autocomplete="name"></div>
    ${pt ? `<div class="field"><label class="label" for="ob-invite">치료사에게 받은 초대 코드</label><input type="text" id="ob-invite" required placeholder="SOAP-XXXXXX" autocapitalize="characters"></div>`
         : `<div class="field"><label class="label" for="ob-license">작업치료사 면허 번호</label><input type="text" id="ob-license" required></div>`}
    <label class="small" style="display:flex;gap:.5rem;align-items:start"><input type="checkbox" id="ob-consent" required> 건강정보(민감정보)를 재활 치료 목적으로 수집·이용하는 데 동의합니다.</label>
    <div class="toolbar"><button class="btn primary" type="submit">시작하기</button><button class="btn ghost" type="button" data-act="logout">로그아웃</button></div>
  </form></main>`;
}

/* ================= 치료사 화면 ================= */
function railHtml() {
  const pts = cache.patients;
  return `<div class="toolbar" style="justify-content:space-between"><span class="label">담당 환자 ${pts.length}명</span><button class="btn sm" data-act="new-patient">+ 환자 등록</button></div>
  <div class="plist">${pts.map((x) => {
    const al = AI.screen(x, view.ctx(x.id));
    const d = al.filter((y) => y.level === "danger").length, w = al.filter((y) => y.level === "warn").length;
    return `<button class="pitem" data-act="pick" data-id="${x.id}" aria-current="${x.id === state.selected && !state.newPatient}">
      <div class="row"><strong>${h(x.name)}</strong><span class="small muted">${x.age ? x.age + "세" : ""} ${h(x.sex ?? "")}</span></div>
      <span class="small muted">${h(x.diagnosis ?? "")}</span>
      <div class="flags">${d ? `<span class="pill danger">위험 ${d}</span>` : ""}${w ? `<span class="pill warn">주의 ${w}</span>` : ""}${!d && !w ? `<span class="pill ok">양호</span>` : ""}${x.userId ? "" : `<span class="pill plain">앱 미가입</span>`}</div>
    </button>`; }).join("")}</div>`;
}
function renderRailOnly() { const r = app.querySelector(".rail"); if (r) r.innerHTML = railHtml(); }

function therapistHtml() {
  if (!state.selected || !view.patient(state.selected)) state.selected = cache.patients[0]?.id ?? null;
  const p = view.patient(state.selected);
  const showNew = state.newPatient || !p;
  const tabs = [["overview", "요약·AI 검진"], ["soap", "SOAP 작성"], ["history", "기록 이력"], ["home", "가정 프로그램"], ["msg", "메시지"]];
  const main = showNew ? newPatientHtml() : `
    <div class="phead"><div style="display:grid;gap:.25rem;min-width:0"><h1>${h(p.name)}</h1>
      <div class="meta">${p.age ? `<span>${p.age}세 ${h(p.sex ?? "")}</span>` : ""}${p.diagnosis ? `<span>${h(p.diagnosis)}</span>` : ""}${p.onset ? `<span>발병 ${h(p.onset)}</span>` : ""}
        ${p.userId ? `<span class="pill ok">환자 앱 가입 완료</span>` : `<span>초대 코드 <b class="mono">${h(p.invite ?? "")}</b> <button class="btn sm" data-act="copy-invite">복사</button> <button class="btn sm ghost" data-act="reissue">새 코드</button></span>`}</div></div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-act="tab" data-tab="${k}" aria-selected="${state.tab === k}">${l}</button>`).join("")}</div>
    ${{ overview: tOverview, soap: tSoap, history: tHistory, home: tHome, msg: tMsg }[state.tab](p)}`;
  return `${topbar()}<div class="work"><aside class="rail">${railHtml()}</aside><main class="main">${main}</main></div>`;
}

function newPatientHtml() {
  return `<section class="panel" style="max-width:40rem">
    <h2>환자 등록</h2>
    <p class="small muted">등록하면 초대 코드가 만들어집니다. 환자에게 코드를 알려 주면 환자가 앱에 가입해 가정 운동과 메시지를 사용할 수 있습니다.</p>
    <form id="f-patient" class="formgrid">
      <div class="field"><label class="label" for="np-name">이름</label><input type="text" id="np-name" required></div>
      <div class="field"><label class="label" for="np-birth">출생 연도</label><input type="text" id="np-birth" inputmode="numeric" placeholder="1958"></div>
      <div class="field"><label class="label" for="np-sex">성별</label><select id="np-sex"><option value="">선택 안 함</option><option>남</option><option>여</option></select></div>
      <div class="field"><label class="label" for="np-side">마비·손상 측</label><select id="np-side"><option value="right">오른쪽</option><option value="left">왼쪽</option><option value="both">양쪽</option></select></div>
      <div class="field wide"><label class="label" for="np-dx">진단</label><input type="text" id="np-dx" placeholder="예: 뇌경색 (좌측 MCA) · 우측 편마비"></div>
      <div class="field"><label class="label" for="np-onset">발병일</label><input type="date" id="np-onset"></div>
      <div class="toolbar wide"><button class="btn primary" type="submit">등록</button>${cache.patients.length ? `<button class="btn ghost" type="button" data-act="cancel-new">취소</button>` : ""}</div>
    </form></section>`;
}

function tOverview(p) {
  const ctx = view.ctx(p.id);
  const al = AI.screen(p, ctx);
  const st = AI.homeStats(ctx.programs, ctx.sessions);
  const tools = [...new Set(p.scores.map((x) => x.tool))];
  const chartTool = tools.includes("K-MBI") ? "K-MBI" : tools[0];
  const series = p.scores.filter((x) => x.tool === chartTool).sort((a, b) => a.date.localeCompare(b.date));
  const goalRow = (g) => `<li><span class="tag">${g.type}</span><span>${h(g.text)}${g.status !== "active" ? ` <span class="pill ${g.status === "met" ? "ok" : "plain"}">${{ met: "달성", revised: "수정됨", discontinued: "중단" }[g.status]}</span>` : ""}</span>
    <span class="toolbar" style="gap:.3rem;justify-content:end">${g.due ? `<span class="pill ${g.status !== "active" ? "plain" : g.due < localDate() ? "danger" : "plain"}">~${fmtDate(g.due)}</span>` : ""}${g.status === "active" ? `<button class="btn sm" data-act="goal-met" data-id="${g.id}">달성</button>` : ""}</span></li>`;
  return `<div class="grid2">
    <section class="panel"><div class="toolbar" style="justify-content:space-between"><h2>AI 검진 결과</h2><span class="pill info">자동</span></div>
      <div class="alerts">${al.length ? al.map((x) => `<div class="alert ${x.level}"><span class="dot"></span><span>${h(x.text)}</span></div>`).join("") : `<p class="muted">확인할 위험 신호가 없습니다.</p>`}</div>
      <p class="small muted">가정 훈련 기록, 카메라 측정값, 목표 기한, 기록 공백을 확인합니다. 판단과 조치는 치료사가 합니다.</p>
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
    <section class="panel chart"><div class="toolbar" style="justify-content:space-between"><h2>${h(chartTool ?? "평가 점수")} 추이</h2></div>
      ${series.length ? lineChart(series) : `<p class="muted small">평가 점수를 입력하면 추이를 그립니다.</p>`}
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
    <section class="panel"><h2>최근 7일 가정 훈련</h2>
      <div class="bigcount"><div><span class="small muted">수행률</span><strong>${st.adherence ?? "–"}${st.adherence != null ? "%" : ""}</strong></div><div><span class="small muted">완료</span><strong>${st.done}/${st.expected}</strong></div><div><span class="small muted">최대 통증</span><strong>${st.maxPain}/10</strong></div></div>
      ${st.cam.length ? `<p class="small">카메라 측정 어깨 굽힘 최대각: ${st.cam.map((x) => `<span class="mono">${x.maxAngle}°</span>`).join(" → ")}</p>` : `<p class="small muted">카메라 측정 기록 없음</p>`}
    </section>
  </div>`;
}

function lineChart(pts) {
  if (pts.length < 2) return `<p class="muted small">점수가 2회 이상 쌓이면 추이를 그립니다. (현재 ${pts[0].value}점)</p>`;
  const top = Math.max(...pts.map((x) => x.max ?? x.value), ...pts.map((x) => x.value));
  const W = 520, H = 200, L = 34, R = 14, T = 14, B = 26;
  const xs = (i) => L + (i * (W - L - R)) / (pts.length - 1);
  const ys = (v) => T + (1 - v / top) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const grid = ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${ys(v) + 4}" text-anchor="end">${v}</text>`).join("");
  const line = pts.map((x, i) => `${i ? "L" : "M"}${xs(i)},${ys(x.value)}`).join("");
  const area = `${line}L${xs(pts.length - 1)},${ys(0)}L${xs(0)},${ys(0)}Z`;
  const every = Math.ceil(pts.length / 8);
  const dots = pts.map((x, i) => `<circle cx="${xs(i)}" cy="${ys(x.value)}" r="${i === pts.length - 1 ? 5 : 3}" fill="var(--accent)"/>${i % every === 0 || i === pts.length - 1 ? `<text x="${xs(i)}" y="${H - 8}" text-anchor="middle">${fmtDate(x.date)}</text>` : ""}`).join("");
  const last = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="점수 추이">${grid}
    <path d="${area}" fill="var(--accent-soft)" opacity=".7"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>${dots}
    <text x="${xs(pts.length - 1) - 8}" y="${ys(last.value) - 10}" text-anchor="end" style="fill:var(--ink);font-weight:500">${last.value}점</text></svg>`;
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
function updateChecks() {
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

function threadHtml(pid) {
  const me = cache.profile.role;
  const ms = view.messages(pid);
  return `<div class="thread" data-pid="${pid}">${ms.length ? ms.map((m) => {
    if (m.from === "ai") return `<div class="msg ai">${h(m.text)}</div>`;
    return `<div class="msg ${m.from === me ? "me" : "them"}"><span>${m.triage === "danger" ? `<span class="pill danger">확인 필요</span> ` : m.triage === "warn" ? `<span class="pill warn">통증</span> ` : ""}${h(m.text)}</span><time>${new Date(m.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>`;
  }).join("") : `<p class="muted small" style="text-align:center">아직 대화가 없습니다.</p>`}</div>`;
}
function composer() {
  return `<form class="composer" id="f-msg"><input type="text" id="msg-text" placeholder="메시지 입력" autocomplete="off" required maxlength="4000"><button class="btn primary">보내기</button></form>`;
}
function tMsg(p) {
  return `<section class="panel"><div class="toolbar" style="justify-content:space-between"><h2>${h(p.name)}님과 대화</h2>
    <button class="btn sm" data-act="ai-reply">AI 답장 초안</button></div>
    ${p.userId ? threadHtml(p.id) + composer() : `<p class="muted small">환자가 초대 코드로 앱에 가입하면 대화할 수 있습니다.</p>`}</section>`;
}

/* ================= 환자 화면 ================= */
function patientHtml() {
  const p = cache.patients[0];
  if (!p) return `${topbar()}<main class="papp"><div class="empty">연결된 치료 기록을 찾을 수 없습니다. 치료사에게 문의해 주세요.</div></main>`;
  const ctx = view.ctx(p.id);
  const today = ctx.sessions.filter((x) => x.date === localDate());
  const tabs = [["today", "오늘 할 일"], ["progress", "내 회복 기록"], ["msg", "치료사와 대화"]];
  const days = [...Array(7)].map((_, i) => localDate(new Date(Date.now() - (6 - i) * 864e5)));
  const need = ctx.programs.reduce((t, x) => t + x.perDay, 0);
  const streak = days.map((d) => { const n = ctx.sessions.filter((x) => x.date === d).length; return { d, n, cls: need && n >= need ? "full" : n ? "part" : "" }; });
  const k = AI.latestScores(p.scores).find((x) => x.tool === "K-MBI");
  const goals = p.goals.filter((g) => g.status === "active");

  const views = {
    today: `<section class="panel"><div class="toolbar" style="justify-content:space-between"><h2>오늘의 재활 운동</h2><span class="muted small">${today.length}/${need} 완료</span></div>
      ${ctx.programs.map((x) => { const done = today.filter((s) => s.programId === x.id).length >= x.perDay;
        return `<div class="task"><div style="min-width:0"><strong>${h(x.title)}</strong> <span class="mono small muted">${x.target}${h(x.unit)}</span><p class="small muted">${h(x.detail)}</p></div>
        ${done ? `<span class="done">완료</span>` : x.camera ? `<button class="btn primary" data-act="cam" data-id="${x.id}">카메라로 시작</button>` : `<button class="btn" data-act="manual" data-id="${x.id}">했어요</button>`}</div>`; }).join("") || `<p class="muted small">치료사가 운동을 처방하면 여기에 나타나요.</p>`}
    </section>
    <section class="panel"><h2>지난 7일</h2><div class="streak">${streak.map((x) => `<div><b class="${x.cls}">${x.n}</b>${fmtDate(x.d)}</div>`).join("")}</div></section>`,
    progress: `<section class="panel plain-summary"><h2>내 회복 상황을 쉽게 정리했어요</h2>
      ${k ? `<p>일상생활 점수(K-MBI)는 지금 <b class="mono">${k.value}점</b>이에요${k.prev != null ? ` (이전 ${k.prev}점에서 ${k.value >= k.prev ? "올랐어요" : "조금 내려갔어요"})` : ""}. 100점 만점이에요.</p>` : ""}
      <div><h3>지금 목표</h3>${goals.length ? `<ul>${goals.map((g) => `<li>${h(AI.plainGoal(g.text))}</li>`).join("")}</ul>` : `<p class="muted small">치료사가 목표를 정하면 여기에 보여요.</p>`}</div>
      ${cache.myLatest ? `<div><h3>${fmtDate(cache.myLatest.date)} 치료사 평가</h3><p class="small muted">${h(cache.myLatest.a)}</p></div>` : ""}
      <p class="small muted">목표 문장은 AI가 쉬운 말로 바꾼 것입니다. 궁금한 점은 치료사에게 물어보세요.</p>
    </section>
    ${p.scores.some((x) => x.tool === "K-MBI") ? `<section class="panel chart"><h2>일상생활 점수 변화</h2>${lineChart(p.scores.filter((x) => x.tool === "K-MBI").sort((a, b) => a.date.localeCompare(b.date)))}</section>` : ""}`,
    msg: `<section class="panel"><h2>${h(cache.names[p.therapistId] ?? "")} 치료사</h2>${threadHtml(p.id)}${composer()}
      <p class="small muted">통증, 붓기, 저림 같은 증상을 쓰면 치료사에게 먼저 알려요. 응급 상황은 119에 연락하세요.</p></section>`,
  };
  return `${topbar()}<main class="papp">
    <div class="hello"><span class="label">${new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })}</span><h1>${h(cache.profile.name)}님, 오늘도 한 걸음</h1></div>
    <div class="tabs" role="tablist">${tabs.map(([k2, l]) => `<button role="tab" data-act="ptab" data-tab="${k2}" aria-selected="${state.ptab === k2}">${l}</button>`).join("")}</div>
    ${views[state.ptab]}
  </main>`;
}

/* ================= 클릭 ================= */
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act;
  const p = state.phase === "ready" ? (cache.profile.role === "therapist" ? view.patient(state.selected) : cache.patients[0]) : null;
  try {
    switch (act) {
      case "logout": await D.auth.signOut(); return;
      case "retry": state.userId = null; return onSession((await D.sb.auth.getSession()).data.session);
      case "auth-back": state.authStep = "email"; return render();
      case "resend": await run(b, () => D.auth.sendLink(state.email)); return toast("메일을 다시 보냈습니다");
      case "role": state.role = b.dataset.role; return render();
      case "new-patient": state.newPatient = true; return render();
      case "cancel-new": state.newPatient = false; return render();
      case "pick": state.selected = b.dataset.id; state.newPatient = false; state.draft = null; return render();
      case "tab": state.tab = b.dataset.tab; return render();
      case "ptab": state.ptab = b.dataset.tab; return render();
      case "copy-invite":
        try { await navigator.clipboard.writeText(p.invite); toast("초대 코드를 복사했습니다"); } catch { toast(`초대 코드: ${p.invite}`); }
        return;
      case "reissue": await run(b, () => D.reissueInvite(p.id)); toast("새 초대 코드를 만들었습니다. 이전 코드는 더 이상 쓸 수 없습니다"); return render();
      case "goal-met": await run(b, () => D.setGoalStatus(p.id, b.dataset.id, "met")); toast("목표를 달성으로 표시했습니다"); return render();
      case "stop-prog": await run(b, () => D.stopProgram(b.dataset.id)); toast("환자 앱에서 이 운동을 내렸습니다"); return render();
      case "ai-draft": {
        const dr = AI.draftNote(p, view.ctx(p.id));
        const empty = ["s", "o", "a", "p"].every((k) => !state.draft[k].trim());
        for (const k of ["s", "o", "a", "p"]) if (!state.draft[k].trim()) state.draft[k] = dr[k];
        state.draftUsedAI = true;
        toast(empty ? "초안을 채웠습니다. [ ] 부분을 직접 확인해 채워 주세요" : "비어 있는 칸만 초안으로 채웠습니다");
        return render();
      }
      case "sign": {
        const check = AI.checkNote(state.draft, view.notes(p.id)[0]);
        const blockers = check.items.filter((x) => x.level === "danger");
        if (blockers.length) return toast(`필수 항목 ${blockers.length}개를 먼저 해결해 주세요`, "error");
        await run(b, () => D.signNote(state.draft, check, state.draftUsedAI));
        state.draft = null; state.tab = "history"; toast("서명하고 저장했습니다"); return render();
      }
      case "ai-reply": {
        const input = document.getElementById("msg-text"); if (!input) return;
        input.value = AI.replyDraft(p, view.ctx(p.id)); input.focus();
        return toast("초안을 입력창에 넣었습니다. 확인 후 보내세요");
      }
      case "manual": {
        const prog = cache.programs.find((x) => x.id === b.dataset.id);
        await run(b, () => D.addSession({ patientId: p.id, programId: prog.id, reps: prog.target, pain: 0, source: "manual" }));
        toast("기록했습니다"); return render();
      }
      case "cam": {
        const prog = cache.programs.find((x) => x.id === b.dataset.id);
        return openCamera(prog, p.affectedSide, async (r) => {
          await run(null, () => D.addSession({ ...r, patientId: p.id }));
          if (r.pain >= 5 || r.comment) {
            await run(null, () => D.sendMessage(p.id, `자동 알림: ${prog.title} ${r.reps}회, 최대 ${r.maxAngle}°, 통증 ${r.pain}/10${r.comment ? ` · “${r.comment}”` : ""}`, "ai_alert", r.pain >= 5 ? "warn" : null));
          }
          toast("운동 기록을 저장했습니다"); render();
        });
      }
    }
  } catch { /* run()이 이미 알림을 띄움 */ }
});

document.addEventListener("input", (e) => {
  if (e.target.dataset.soap && state.draft) { state.draft[e.target.dataset.soap] = e.target.value; updateChecks(); }
  if (e.target.id === "soap-date" && state.draft) state.draft.date = e.target.value || localDate();
});

/* ================= 폼 제출 ================= */
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target; const btn = e.submitter ?? f.querySelector("button[type=submit], button:not([type])");
  const v = (id) => f.querySelector("#" + id)?.value.trim() ?? "";
  const p = state.phase === "ready" ? (cache.profile.role === "therapist" ? view.patient(state.selected) : cache.patients[0]) : null;
  try {
    switch (f.id) {
      case "f-email": {
        state.email = v("email").toLowerCase();
        await run(btn, () => D.auth.sendLink(state.email));
        state.authStep = "sent"; return render();
      }
      case "f-code": {
        await run(btn, () => D.auth.verifyCode(state.email, v("otp")));
        return; // onAuthStateChange가 이어서 처리
      }
      case "f-onboard": {
        const name = v("ob-name");
        await run(btn, () => state.role === "patient" ? D.auth.redeemInvite(v("ob-invite"), name) : D.auth.registerTherapist(name, v("ob-license")));
        await D.loadProfile(state.userId);
        state.phase = "loading"; render();
        await enter().catch((err) => { state.phase = "error"; state.error = D.explain(err); render(); });
        return;
      }
      case "f-patient": {
        const birth = +v("np-birth");
        const np = await run(btn, () => D.createPatient({ name: v("np-name"), birthYear: birth > 1900 ? birth : null, sex: v("np-sex"), diagnosis: v("np-dx"), onset: v("np-onset"), affectedSide: v("np-side") }));
        state.selected = np.id; state.newPatient = false; state.tab = "overview";
        toast(`등록했습니다. 초대 코드: ${np.invite}`); return render();
      }
      case "f-goal": {
        await run(btn, () => D.addGoal(p.id, { type: v("g-type"), text: v("g-text"), due: v("g-due") }));
        toast("목표를 추가했습니다"); return render();
      }
      case "f-score": {
        const value = parseFloat(v("sc-value")), max = v("sc-max") ? parseFloat(v("sc-max")) : null;
        if (Number.isNaN(value)) return toast("점수는 숫자로 입력해 주세요", "error");
        await run(btn, () => D.addScore(p.id, { tool: v("sc-tool"), value, max, date: v("sc-date") }));
        toast("점수를 저장했습니다"); return render();
      }
      case "f-prog": {
        await run(btn, () => D.addProgram(p.id, { title: v("pg-title"), detail: v("pg-detail"), target: parseInt(v("pg-target")) || 10, perDay: parseInt(v("pg-perday")) || 1, camera: v("pg-camera") || null, targetAngle: parseInt(v("pg-angle")) || 90 }));
        toast("환자 앱에 처방을 보냈습니다"); return render();
      }
      case "f-msg": {
        const text = v("msg-text"); if (!text) return;
        const isPatient = cache.profile.role === "patient";
        const t = isPatient ? AI.triage(text) : null;
        await run(btn, () => D.sendMessage(p.id, text, "text", t?.level ?? null));
        if (t) await run(null, () => D.sendMessage(p.id, t.text, "ai_alert"));
        const th = app.querySelector(".thread"); if (th) th.outerHTML = threadHtml(p.id);
        f.reset(); scrollThread(); return;
      }
    }
  } catch { /* run()이 이미 알림을 띄움 */ }
});

boot();
