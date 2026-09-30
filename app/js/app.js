/* SOAPO 앱: 로그인 상태에 따라 화면을 고르고, 사용자 동작을 처리한다
   화면 조각: landing.js(홈·가입), therapist.js(치료사), patient.js(환자·보호자)
   데이터: data.js(Supabase) / AI 보조: ai.js / 카메라: camera.js */

import * as D from "./data.js";
import * as AI from "./ai.js";
import { openCamera } from "./camera.js";
import { toast, localDate } from "./util.js";
import { state, intent } from "./state.js";
import { landingHtml, authHtml, onboardHtml, setupHtml, errorHtml, resetHtml } from "./landing.js";
import { therapistHtml, railHtml, updateChecks, threadHtml } from "./therapist.js";
import { patientHtml, MOOD, SLEEP } from "./patient.js";

const { cache, view } = D;
const app = document.getElementById("app");
let unsubscribe = null;

/* ================= 시작 & 로그인 상태 ================= */
function boot() {
  if (!D.configured) { state.phase = "setup"; return render(); }
  // ?start=patient|therapist|login 으로 바로 가입·로그인 화면을 열 수 있다
  const start = new URLSearchParams(location.search).get("start");
  if (["patient", "therapist", "login"].includes(start)) goAuth(start, false);
  // 메일 링크가 만료되었거나 잘못된 경우 Supabase가 주소 뒤에 오류를 붙여 돌려보낸다
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.get("error_description")) {
    toast(hp.get("error_code") === "otp_expired" ? "인증 링크가 만료되었습니다. 새 메일을 요청하거나 메일 속 코드를 입력해 주세요." : hp.get("error_description"), "error");
    history.replaceState(null, "", location.pathname);
  }
  if (D.arrivedForRecovery) state.recovery = true;
  D.sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") state.recovery = true;
    // 콜백 안에서 바로 Supabase를 다시 부르면 멈출 수 있어 다음 틱으로 넘긴다
    setTimeout(() => onSession(session), 0);
  });
}

function goAuth(mode, doRender = true) {
  Object.assign(state, { phase: "auth", authMode: mode, authStep: "form" });
  if (mode !== "login") intent.set({ role: mode === "therapist" ? "therapist" : "patient" });
  if (doRender) render();
}

async function onSession(session) {
  const uid = session?.user?.id ?? null;
  if (!uid) {
    unsubscribe?.(); unsubscribe = null; D.clearCache();
    Object.assign(state, { phase: state.phase === "auth" ? "auth" : "landing", userId: null, selected: null, draft: null, tView: "dashboard", ptab: "home" });
    return render();
  }
  if (uid === state.userId && state.phase !== "error") return; // 토큰 갱신 등
  state.userId = uid; state.email = session.user.email ?? "";
  // 비밀번호 재설정 링크로 들어온 경우: 먼저 새 비밀번호를 정한다
  if (state.recovery) { state.phase = "reset"; return render(); }
  state.phase = "loading"; render();
  try {
    const profile = await D.loadProfile(uid);
    if (!profile) {
      const want = intent.get();
      state.role = want?.role ?? (state.authMode === "therapist" ? "therapist" : "patient");
      state.phase = "onboard"; return render();
    }
    await enter();
  } catch (e) { state.phase = "error"; state.error = D.explain(e); render(); }
}

async function enter() {
  await D.loadAll();
  intent.clear();
  unsubscribe?.();
  unsubscribe = D.subscribeMessages(onNewMessage);
  state.phase = "ready";
  if (location.hash.includes("access_token") || location.search) history.replaceState(null, "", location.pathname);
  render();
}

function onNewMessage(row) {
  const th = app.querySelector(".thread");
  if (th && th.dataset.pid === row.patient_id) { th.outerHTML = threadHtml(row.patient_id); scrollThread(); D.markRead(row.patient_id).catch(() => {}); return; }
  if (cache.profile.role === "therapist") {
    toast(`${view.patient(row.patient_id)?.name ?? "환자"}님의 새 메시지`);
    const r = app.querySelector(".rail"); if (r) r.innerHTML = railHtml();
  } else toast("치료사에게서 새 메시지가 왔어요");
}

/* ================= 그리기 ================= */
function render() {
  const r = { loading: () => `<div class="loading">불러오는 중…</div>`, setup: setupHtml, landing: landingHtml, auth: authHtml, reset: resetHtml, onboard: onboardHtml, error: errorHtml,
    ready: () => (cache.profile.role === "therapist" ? therapistHtml() : patientHtml()) }[state.phase];
  app.innerHTML = r();
  scrollThread();
  if (state.phase === "ready" && cache.profile.role === "therapist" && state.tView === "patient" && state.tab === "soap") updateChecks();
}
function scrollThread() { const th = app.querySelector(".thread"); if (th) th.scrollTop = th.scrollHeight; }

/** 버튼을 잠그고 비동기 작업을 실행, 실패하면 이유를 보여 준다 */
async function run(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); }
  catch (e) { console.error(e); toast(D.explain(e), "error"); throw e; }
  finally { if (btn?.isConnected) btn.disabled = false; }
}

const currentPatient = () => (state.phase !== "ready" ? null : cache.profile.role === "therapist" ? view.patient(state.selected) : cache.patients[0]);
const openThread = (pid) => { D.markRead(pid).catch(() => {}); };

/** 비밀번호 규칙: 8자 이상, 영문과 숫자 포함, 확인 칸과 같아야 함 */
function checkPassword(pw, again) {
  if (pw.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "비밀번호에 영문과 숫자를 모두 넣어 주세요.";
  if (pw !== again) return "비밀번호 확인이 일치하지 않습니다.";
  return null;
}

/* ================= 클릭 ================= */
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act;
  const p = currentPatient();
  try {
    switch (act) {
      case "go-auth": return goAuth(b.dataset.mode);
      case "go-home": state.phase = "landing"; return render();
      case "logout": await D.auth.signOut(); state.phase = "landing"; return render();
      case "retry": state.userId = null; return onSession((await D.sb.auth.getSession()).data.session);
      case "auth-step": state.authStep = b.dataset.step; return render();
      case "resend-signup": await run(b, () => D.auth.resendSignup(state.email)); return toast("인증 메일을 다시 보냈습니다");
      case "resend": await run(b, () => D.auth.sendLink(state.email)); return toast("메일을 다시 보냈습니다");
      case "role": state.role = b.dataset.role; return render();
      case "relation": state.relation = b.dataset.relation; return render();
      /* 치료사 */
      case "t-dashboard": Object.assign(state, { tView: "dashboard", selected: null }); return render();
      case "new-patient": state.tView = "new"; return render();
      case "pick":
        if (state.selected !== b.dataset.id) { state.draft = null; state.tab = "overview"; }
        Object.assign(state, { tView: "patient", selected: b.dataset.id });
        if (state.tab === "msg") openThread(b.dataset.id);
        window.scrollTo({ top: 0 });
        return render();
      case "tab": state.tab = b.dataset.tab; if (state.tab === "msg") openThread(state.selected); return render();
      case "write-soap":
        Object.assign(state, { tView: "patient", selected: b.dataset.id, tab: "soap", draft: { patientId: b.dataset.id, date: b.dataset.date, s: "", o: "", a: "", p: "" }, draftUsedAI: false });
        return render();
      case "appt-status": {
        await run(b, () => D.setAppointmentStatus(b.dataset.id, b.dataset.status));
        toast({ done: "완료로 표시했습니다", no_show: "결석으로 표시했습니다", cancelled: "취소했습니다" }[b.dataset.status]); return render();
      }
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
      /* 환자 */
      case "ptab": state.ptab = b.dataset.tab; state.editSymptom = false; if (state.ptab === "msg") openThread(p.id); window.scrollTo({ top: 0 }); return render();
      case "edit-symptom": state.editSymptom = true; return render();
      case "cancel-symptom": state.editSymptom = false; return render();
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
  const t = e.target;
  if (t.dataset.soap && state.draft) { state.draft[t.dataset.soap] = t.value; updateChecks(); }
  if (t.id === "soap-date" && state.draft) state.draft.date = t.value || localDate();
  if (t.type === "range") {
    const out = document.querySelector(`[data-out="${t.id}"]`);
    if (out) out.textContent = t.dataset.names ? t.dataset.names.split("|")[t.value] : t.value;
  }
});

/* ================= 폼 제출 ================= */
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target; const btn = e.submitter ?? f.querySelector("button[type=submit], button:not([type])");
  const v = (id) => f.querySelector("#" + id)?.value.trim() ?? "";
  const p = currentPatient();
  try {
    switch (f.id) {
      case "f-signup": {
        state.email = v("email").toLowerCase();
        const pw = f.querySelector("#password").value, bad = checkPassword(pw, f.querySelector("#password2").value);
        if (bad) return toast(bad, "error");
        const data = await run(btn, () => D.auth.signUp(state.email, pw));
        if (!data.session) { state.authStep = "confirm"; render(); }
        return; // 인증 없이 바로 로그인되는 설정이면 onAuthStateChange가 이어서 처리
      }
      case "f-signup-code": {
        await run(btn, () => D.auth.verifySignup(state.email, v("otp").replace(/\s+/g, "")));
        return;
      }
      case "f-login": {
        state.email = v("email").toLowerCase();
        try { await run(btn, () => D.auth.signIn(state.email, f.querySelector("#password").value)); }
        catch (err) { if (/email not confirmed/i.test(err?.message ?? "")) { state.authStep = "confirm"; render(); } }
        return;
      }
      case "f-forgot": {
        state.email = v("email").toLowerCase();
        await run(btn, () => D.auth.sendReset(state.email));
        state.authStep = "forgot-sent"; return render();
      }
      case "f-newpw": {
        const pw = f.querySelector("#newpw").value, bad = checkPassword(pw, f.querySelector("#newpw2").value);
        if (bad) return toast(bad, "error");
        await run(btn, () => D.auth.setPassword(pw));
        state.recovery = false; state.userId = null;
        toast("새 비밀번호를 저장했습니다");
        return onSession((await D.sb.auth.getSession()).data.session);
      }
      case "f-code-email": {
        state.email = v("email").toLowerCase();
        await run(btn, () => D.auth.sendLink(state.email));
        state.authStep = "code-sent"; return render();
      }
      case "f-code": {
        await run(btn, () => D.auth.verifyCode(state.email, v("otp").replace(/\s+/g, "")));
        return; // onAuthStateChange가 이어서 처리
      }
      case "f-onboard": {
        const name = v("ob-name");
        await run(btn, () => state.role === "patient" ? D.auth.redeemInvite(v("ob-invite"), name, state.relation) : D.auth.registerTherapist(name, v("ob-license")));
        await D.loadProfile(state.userId);
        state.phase = "loading"; render();
        await enter().catch((err) => { state.phase = "error"; state.error = D.explain(err); render(); });
        toast("가입을 마쳤습니다");
        return;
      }
      case "f-patient": {
        const np = await run(btn, () => D.createPatient({ name: v("np-name"), birthDate: v("np-birth"), firstVisit: v("np-visit") }));
        Object.assign(state, { selected: np.id, tView: "patient", tab: "overview" });
        toast(`등록했습니다. 초대 코드: ${np.invite}`); return render();
      }
      case "f-pinfo": {
        await run(btn, () => D.updatePatient(p.id, { name: v("pi-name"), birthDate: v("pi-birth"), firstVisit: v("pi-visit") }));
        toast("기본 정보를 저장했습니다"); return render();
      }
      case "f-appt": {
        const startsAt = new Date(`${v("ap-date")}T${v("ap-time")}`);
        if (Number.isNaN(startsAt.getTime())) return toast("날짜와 시간을 확인해 주세요", "error");
        await run(btn, () => D.addAppointment({ patientId: v("ap-patient"), startsAt: startsAt.toISOString(), duration: parseInt(v("ap-dur")) || 30, kind: v("ap-kind"), note: v("ap-note") }));
        toast("일정을 추가했습니다"); return render();
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
      case "f-symptom": {
        const s = { patientId: p.id, date: localDate(), pain: +v("sy-pain"), fatigue: +v("sy-fatigue"), mood: +v("sy-mood"), sleep: +v("sy-sleep"), note: v("sy-note") };
        await run(btn, () => D.saveSymptom(s));
        if (s.pain >= 6) await run(null, () => D.sendMessage(p.id, `자동 알림: 오늘 컨디션 통증 ${s.pain}/10, 기분 ${MOOD[s.mood]}, 수면 ${SLEEP[s.sleep]}${s.note ? ` · “${s.note}”` : ""}`, "ai_alert", "warn")).catch(() => {});
        state.editSymptom = false;
        toast(s.pain >= 6 ? "저장했습니다. 통증이 높아 치료사에게 알렸어요" : "오늘 컨디션을 저장했습니다"); return render();
      }
      case "f-msg": {
        const text = v("msg-text"); if (!text) return;
        const t = cache.profile.role === "patient" ? AI.triage(text) : null;
        await run(btn, () => D.sendMessage(p.id, text, "text", t?.level ?? null));
        if (t) await run(null, () => D.sendMessage(p.id, t.text, "ai_alert"));
        D.markRead(p.id).catch(() => {});
        const th = app.querySelector(".thread"); if (th) th.outerHTML = threadHtml(p.id);
        f.reset(); scrollThread(); return;
      }
    }
  } catch { /* run()이 이미 알림을 띄움 */ }
});

boot();
