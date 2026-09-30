/* SOAPO 앱: 로그인 상태에 따라 화면을 고르고, 사용자 동작을 처리한다
   화면 조각: landing.js(홈·가입), therapist.js(치료사), patient.js(환자·보호자)
   데이터: data.js(Supabase) / AI 보조: ai.js / 카메라: camera.js */

import * as D from "./data.js";
import * as AI from "./ai.js";
import { openCamera } from "./camera.js";
import { toast, localDate } from "./util.js";
import { state, intent } from "./state.js";
import { landingHtml, authHtml, onboardHtml, setupHtml, errorHtml, resetHtml } from "./landing.js";
import { therapistHtml, railHtml, updateChecks, threadHtml, openDraft, compareNote } from "./therapist.js";
import { patientHtml, MOOD, SLEEP } from "./patient.js";
import * as R from "./reach.js";
import { KMBI, MMSE, MMT_MUSCLES, ROM_MOTIONS, SIDE_TAG, gradeToNum } from "./assessments.js";

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
  // 알림을 눌러 들어온 경우 대화 화면으로
  if (new URLSearchParams(location.search).get("open") === "msg" && cache.profile.role === "patient") state.ptab = "msg";
  if (location.hash.includes("access_token") || location.search) history.replaceState(null, "", location.pathname);
  render();
}

function onNewMessage(row) {
  R.tabNotify(cache.profile.role === "therapist" ? "환자·보호자에게서 새 메시지가 왔어요" : "치료사에게서 새 메시지가 왔어요");
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
  if (document.getElementById("push-card")) R.fillPushCard();
  if (state.phase === "ready" && cache.profile.role === "therapist" && state.tView === "patient") {
    if (state.tab === "soap") updateChecks();
    if (state.tab === "visits") syncVisitForm();
  }
}

/* ---------- SOAP 자동 임시 저장 ---------- */
let saveTimer = null, saving = null;
const hasText = (d) => ["s", "o", "a", "p"].some((k) => (d[k] ?? "").trim());
function draftStatus(d, failed) {
  const el = document.getElementById("draft-status");
  if (!el || state.draft !== d) return;
  el.innerHTML = failed ? `<span style="color:var(--danger)">자동 저장에 실패했습니다. 인터넷 연결을 확인하고 "임시 저장"을 눌러 주세요.</span>`
    : `임시 저장됨 · ${new Date(state.draftSavedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} · 입력을 멈추면 자동으로 저장됩니다 <button class="linklike" data-act="del-draft">초안 삭제</button>`;
}
/** 바뀐 내용이 있을 때만 저장 (d.dirty) */
async function saveDraftNow(d = state.draft, { quiet = false } = {}) {
  clearTimeout(saveTimer);
  if (!d || d.amends || !hasText(d) || (d.id && !d.dirty)) return;
  while (saving) await saving.catch(() => {});   // 첫 저장이 끝나야 id가 생겨 같은 초안을 덮어쓴다
  d.dirty = false;
  saving = D.saveDraft(d, state.draftUsedAI)
    .then((id) => { d.id = id; state.draftSavedAt = new Date().toISOString(); draftStatus(d); })
    .catch((e) => { d.dirty = true; if (!quiet) { console.error(e); draftStatus(d, true); } throw e; })
    .finally(() => { saving = null; });
  return saving;
}
function scheduleAutosave() {
  const d = state.draft;
  if (d) d.dirty = true;
  clearTimeout(saveTimer);
  if (d && !d.amends) saveTimer = setTimeout(() => saveDraftNow(d).catch(() => {}), 2000);
}
/** 비어 있는 칸만 AI 초안으로 채운다. 전부 비어 있었는지 돌려준다 */
function fillAIDraft(p) {
  const dr = AI.draftNote(p, { ...view.ctx(p.id), date: state.draft.date });
  const empty = !hasText(state.draft);
  for (const k of ["s", "o", "a", "p"]) if (!state.draft[k].trim()) state.draft[k] = dr[k];
  state.draftUsedAI = true;
  return empty;
}

/* ---------- 평가 입력: 합계 미리 보기, 저장할 행 만들기 ---------- */
const round1 = (x) => Math.round(x * 10) / 10;
const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
function fieldNum(f, name) { const x = f.elements[name]?.value?.trim(); return x ? Number(x) : null; }
function copmRows(f) {
  return [0, 1, 2, 3, 4].map((i) => ({ problem: f.elements[`copm.${i}.problem`].value.trim(), imp: fieldNum(f, `copm.${i}.imp`), perf: fieldNum(f, `copm.${i}.perf`), sat: fieldNum(f, `copm.${i}.sat`) }))
    .filter((x) => x.problem && x.perf != null && x.sat != null);
}
function assessTotal() {
  const f = document.getElementById("f-assess"), out = document.getElementById("as-total"); if (!f || !out) return;
  const kind = f.querySelector("#as-kind").value;
  const sumOf = (items, pre) => { const vals = items.map(([k]) => fieldNum(f, `${pre}.${k}`)).filter((x) => x != null); return [vals.reduce((t, x) => t + x, 0), vals.length]; };
  if (kind === "kmbi") { const [t, n] = sumOf(KMBI, "kmbi"); out.textContent = `합계 ${t}/100 · ${n}/${KMBI.length}항목`; }
  else if (kind === "mmse") { const [t, n] = sumOf(MMSE, "mmse"); out.textContent = `합계 ${t}/30 · ${n}/${MMSE.length}항목`; }
  else if (kind === "copm") { const r = copmRows(f); out.textContent = r.length ? `수행 평균 ${round1(mean(r.map((x) => x.perf)))} · 만족 평균 ${round1(mean(r.map((x) => x.sat)))} (${r.length}개 문제)` : ""; }
  else out.textContent = "";
}
/** 평가 양식 → 저장할 행 목록. 문제가 있으면 오류 문장을 던진다 */
function assessRows(f) {
  const kind = f.querySelector("#as-kind").value, date = f.querySelector("#as-date").value || localDate();
  const fail = (m) => { throw new Error(m); };
  const itemized = (items, pre, tool, max) => {
    const out = {};
    for (const [k, label, m] of items) { const x = fieldNum(f, `${pre}.${k}`); if (x == null) fail(`${tool}의 "${label}" 항목을 입력해 주세요.`); if (x < 0 || x > m) fail(`"${label}"은 0~${m}점입니다.`); out[k] = x; }
    return [{ tool, value: Object.values(out).reduce((t, x) => t + x, 0), max, date, details: { items: out } }];
  };
  switch (kind) {
    case "kmbi": return itemized(KMBI, "kmbi", "K-MBI", 100);
    case "mmse": return itemized(MMSE, "mmse", "K-MMSE", 30);
    case "copm": {
      const r = copmRows(f); if (!r.length) fail("작업 문제와 수행·만족 점수를 하나 이상 적어 주세요.");
      if (r.some((x) => [x.imp, x.perf, x.sat].some((v) => v != null && (v < 1 || v > 10)))) fail("COPM 점수는 1~10점입니다.");
      const details = { problems: r };
      return [{ tool: "COPM 수행", value: round1(mean(r.map((x) => x.perf))), max: 10, date, details }, { tool: "COPM 만족", value: round1(mean(r.map((x) => x.sat))), max: 10, date, details }];
    }
    case "grip": return ["R", "L"].flatMap((sd) => {
      const trials = [0, 1, 2].map((i) => fieldNum(f, `grip.${sd}.${i}`)).filter((x) => x != null);
      return trials.length ? [{ tool: `악력(${SIDE_TAG[sd]})`, value: round1(mean(trials)), max: null, date, details: { trials } }] : [];
    });
    case "mmt": return MMT_MUSCLES.flatMap(([k, l]) => ["R", "L"].flatMap((sd) => {
      const g = f.elements[`mmt.${k}.${sd}`].value;
      return g ? [{ tool: `MMT ${l}(${SIDE_TAG[sd]})`, value: gradeToNum(g), max: 5, date }] : [];
    }));
    case "rom": {
      const type = f.querySelector("input[name=romtype]:checked").value;
      return ROM_MOTIONS.flatMap(([k, l, n]) => ["R", "L"].flatMap((sd) => {
        const x = fieldNum(f, `rom.${k}.${sd}`);
        return x != null ? [{ tool: `${type} ${l}(${SIDE_TAG[sd]})`, value: x, max: n, date }] : [];
      }));
    }
    default: {
      const value = parseFloat(f.querySelector("#sc-value").value), max = f.querySelector("#sc-max").value ? parseFloat(f.querySelector("#sc-max").value) : null;
      if (Number.isNaN(value)) fail("점수는 숫자로 입력해 주세요.");
      return [{ tool: f.querySelector("#sc-tool").value.trim(), value, max, date }];
    }
  }
}

/* ---------- 내원기록 폼: 검색·자주 쓰는 치료·선택 수 ---------- */
function syncVisitForm() {
  const f = document.getElementById("f-visit"); if (!f) return;
  const checked = [...f.querySelectorAll(".vi-on:checked")].map((c) => c.value);
  const cnt = document.getElementById("vi-count"); if (cnt) cnt.textContent = checked.length ? `${checked.length}개 선택` : "";
  f.querySelectorAll(".chip[data-code]").forEach((c) => c.setAttribute("aria-pressed", String(checked.includes(c.dataset.code))));
}
function filterTreatments(q) {
  const f = document.getElementById("f-visit"); if (!f) return;
  q = q.trim().toLowerCase();
  let shown = 0;
  f.querySelectorAll(".vcat").forEach((cat) => {
    let n = 0;
    cat.querySelectorAll(".vi").forEach((row) => {
      const ok = !q || row.dataset.search.includes(q) || row.querySelector(".vi-on").checked;
      row.hidden = !ok; if (ok) n++;
    });
    cat.hidden = !n; shown += n;
  });
  f.querySelector(".vi-empty").hidden = shown > 0;
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
      case "t-settings": Object.assign(state, { tView: "settings", selected: null }); window.scrollTo({ top: 0 }); return render();
      case "toggle-discharged": state.showDischarged = !state.showDischarged; return render();
      case "reactivate":
        await run(b, () => D.updatePatient(p.id, { status: "active", dischargedOn: null, dischargeReason: null }));
        toast("치료를 다시 시작했습니다"); return render();
      case "pick":
        if (state.selected !== b.dataset.id) { saveDraftNow().catch(() => {}); Object.assign(state, { draft: null, tab: "overview", visitAppt: null, visitPrefill: null, visitEdit: null }); }
        Object.assign(state, { tView: "patient", selected: b.dataset.id });
        if (state.tab === "msg") openThread(b.dataset.id);
        window.scrollTo({ top: 0 });
        return render();
      case "tab": state.tab = b.dataset.tab; Object.assign(state, { visitPrefill: null, visitEdit: null }); saveDraftNow().catch(() => {}); if (state.tab === "msg") openThread(state.selected); return render();
      case "write-soap":
        Object.assign(state, { tView: "patient", selected: b.dataset.id, tab: "soap" });
        openDraft(b.dataset.id, b.dataset.date);
        return render();
      case "open-draft": openDraft(p.id, b.dataset.date); state.tab = "soap"; return render();
      case "save-draft":
        if (!hasText(state.draft)) return toast("저장할 내용이 없습니다", "error");
        await run(b, () => saveDraftNow()); return toast("임시 저장했습니다");
      case "del-draft": {
        if (!confirm("임시 저장한 초안을 지울까요?")) return;
        const d = state.draft; clearTimeout(saveTimer); while (saving) await saving.catch(() => {});
        if (d.id) await run(b, () => D.deleteDraft(d.id));
        state.draft = { patientId: p.id, date: d.date, s: "", o: "", a: "", p: "" }; state.draftSavedAt = null; state.draftUsedAI = false;
        toast("초안을 지웠습니다"); return render();
      }
      case "amend": {
        const n = cache.notes.find((x) => x.id === b.dataset.id);
        const latest = view.notes(p.id).filter((x) => x.amendsId === n.id).sort((a, c) => (c.signedAt ?? "").localeCompare(a.signedAt ?? ""))[0] ?? n;
        await saveDraftNow().catch(() => {});
        Object.assign(state, { tab: "soap", draftUsedAI: false, draft: { patientId: p.id, date: n.date, s: latest.s, o: latest.o, a: latest.a, p: latest.p, amends: n.id, reason: "" } });
        window.scrollTo({ top: 0 }); return render();
      }
      case "cancel-amend": openDraft(p.id); return render();
      case "week": state.weekOffset = b.dataset.dir === "0" ? 0 : state.weekOffset + Number(b.dataset.dir); return render();
      case "vi-fav": {
        const box = document.querySelector(`#f-visit .vi-on[value="${b.dataset.code}"]`); if (!box) return;
        box.checked = !box.checked;
        const row = box.closest(".vi"); row.hidden = false; row.closest(".vcat").hidden = false;
        if (box.checked) row.scrollIntoView({ block: "center", behavior: "smooth" });
        return syncVisitForm();
      }
      case "edit-visit": Object.assign(state, { visitEdit: b.dataset.id, visitPrefill: null }); window.scrollTo({ top: 0 }); return render();
      case "visit-cancel-edit": state.visitEdit = null; return render();
      case "write-visit":
        Object.assign(state, { tView: "patient", selected: b.dataset.id, tab: "visits", visitAppt: b.dataset.appt ?? null, visitPrefill: null });
        window.scrollTo({ top: 0 }); return render();
      case "visit-copy": state.visitPrefill = b.dataset.id; return render();
      case "visit-clear": state.visitPrefill = null; return render();
      case "del-visit":
        if (!confirm("이 내원기록을 삭제할까요? 되돌릴 수 없습니다.")) return;
        await run(b, () => D.deleteVisit(b.dataset.id)); toast("내원기록을 삭제했습니다"); return render();
      case "appt-status": {
        await run(b, () => D.setAppointmentStatus(b.dataset.id, b.dataset.status));
        toast({ done: "완료로 표시했습니다", no_show: "결석으로 표시했습니다", cancelled: "취소했습니다" }[b.dataset.status]); return render();
      }
      case "share-invite":
        try { const how = await R.shareInvite(p.name, p.invite); if (how === "copied") toast("초대 문구를 복사했습니다. 카카오톡 등에 붙여 넣어 보내세요"); }
        catch (err) { if (err?.name !== "AbortError") toast(`초대 코드: ${p.invite}`); }
        return;
      case "push-on":
        await run(b, () => R.enablePush()); toast("새 메시지 알림을 켰습니다"); return R.fillPushCard();
      case "push-off":
        await run(b, () => R.disablePush()); toast("이 기기 알림을 껐습니다"); return R.fillPushCard();
      case "copy-invite":
        try { await navigator.clipboard.writeText(p.invite); toast("초대 코드를 복사했습니다"); } catch { toast(`초대 코드: ${p.invite}`); }
        return;
      case "reissue": await run(b, () => D.reissueInvite(p.id)); toast("새 초대 코드를 만들었습니다. 이전 코드는 더 이상 쓸 수 없습니다"); return render();
      case "goal-met": await run(b, () => D.setGoalStatus(p.id, b.dataset.id, "met")); toast("목표를 달성으로 표시했습니다"); return render();
      case "stop-prog": await run(b, () => D.stopProgram(b.dataset.id)); toast("환자 앱에서 이 운동을 내렸습니다"); return render();
      case "ai-draft": {
        const empty = fillAIDraft(p);
        toast(empty ? "초안을 채웠습니다. [ ] 부분을 직접 확인해 채워 주세요" : "비어 있는 칸만 초안으로 채웠습니다");
        render(); return scheduleAutosave();
      }
      case "sign": {
        const d = state.draft;
        if (d.amends && !d.reason?.trim()) return toast("정정 사유를 적어 주세요", "error");
        const check = AI.checkNote(d, compareNote(d));
        const blockers = check.items.filter((x) => x.level === "danger");
        if (blockers.length) return toast(`필수 항목 ${blockers.length}개를 먼저 해결해 주세요`, "error");
        clearTimeout(saveTimer); while (saving) await saving.catch(() => {});
        await run(b, () => D.signNote(d, check, state.draftUsedAI));
        state.draft = null; state.draftSavedAt = null; state.tab = "history"; toast(d.amends ? "정정 기록을 서명하고 저장했습니다" : "서명하고 저장했습니다"); return render();
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
            const m = await run(null, () => D.sendMessage(p.id, `자동 알림: ${prog.title} ${r.reps}회, 최대 ${r.maxAngle}°, 통증 ${r.pain}/10${r.comment ? ` · “${r.comment}”` : ""}`, "ai_alert", r.pain >= 5 ? "warn" : null));
            if (r.pain >= 5) D.notifyMessage(m.id);
          }
          toast("운동 기록을 저장했습니다"); render();
        });
      }
    }
  } catch { /* run()이 이미 알림을 띄움 */ }
});

document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.soap && state.draft) { state.draft[t.dataset.soap] = t.value; updateChecks(); scheduleAutosave(); }
  if (t.id === "soap-date" && state.draft) { state.draft.date = t.value || localDate(); scheduleAutosave(); }
  if (t.id === "soap-reason" && state.draft) state.draft.reason = t.value;
  if (t.id === "vi-search") filterTreatments(t.value);
  if (t.closest?.("#f-assess")) assessTotal();
  if (t.id === "rail-search") {
    const q = t.value.trim().toLowerCase(); let n = 0;
    document.querySelectorAll(".plist .pitem").forEach((el) => { const ok = !q || el.dataset.search.includes(q); el.hidden = !ok; if (ok) n++; });
    const empty = document.querySelector(".rail-empty"); if (empty) empty.hidden = n > 0;
  }
  if (t.type === "range") {
    const out = document.querySelector(`[data-out="${t.id}"]`);
    if (out) out.textContent = t.dataset.names ? t.dataset.names.split("|")[t.value] : t.value;
  }
});

document.addEventListener("change", (e) => {
  if (e.target.matches?.("#f-visit .vi-on")) syncVisitForm();
  if (e.target.id === "as-kind") { state.assessKind = e.target.value; render(); }
  if (e.target.closest?.("#f-assess")) assessTotal();
});
// 검색 칸에서 Enter를 눌러도 양식이 저장되지 않게
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && ["vi-search", "rail-search"].includes(e.target.id)) e.preventDefault(); });
// 탭을 닫거나 새로고침하기 전에 SOAP 초안 저장 시도
window.addEventListener("pagehide", () => { saveDraftNow(state.draft, { quiet: true }).catch(() => {}); });

// 서비스 워커: 알림을 눌렀을 때 열려 있던 앱을 대화 화면으로
navigator.serviceWorker?.addEventListener("message", (e) => {
  if (e.data?.type !== "open-messages" || state.phase !== "ready") return;
  if (cache.profile.role === "patient") { state.ptab = "msg"; D.markRead(cache.patients[0]?.id).catch(() => {}); }
  else Object.assign(state, { tView: "dashboard", selected: null });
  render();
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
        const np = await run(btn, () => D.createPatient({ name: v("np-name"), birthDate: v("np-birth"), firstVisit: v("np-visit"), chartNo: v("np-chart") }));
        Object.assign(state, { selected: np.id, tView: "patient", tab: "overview" });
        toast(`등록했습니다. 초대 코드: ${np.invite}`); return render();
      }
      case "f-pinfo": {
        await run(btn, () => D.updatePatient(p.id, { name: v("pi-name"), birthDate: v("pi-birth"), firstVisit: v("pi-visit"), chartNo: v("pi-chart") }));
        toast("기본 정보를 저장했습니다"); return render();
      }
      case "f-safety": {
        const body = { diagnosis: v("sf-dx"), onset: v("sf-onset"), weightBearing: v("sf-wb"), dietFood: v("sf-food"), dietDrink: v("sf-drink"), precautionNote: v("sf-note"),
          precautions: [...f.querySelectorAll("input[name=prec]:checked")].map((c) => c.value) };
        if (v("sf-side")) body.affectedSide = v("sf-side");   // 마비측은 비워 둘 수 없는 칸이라 고른 경우에만 바꾼다
        await run(btn, () => D.updatePatient(p.id, body));
        state.safetyOpen = false; toast("안전 정보를 저장했습니다"); return render();
      }
      case "f-discharge": {
        if (!v("dc-reason")) return toast("종결 사유를 골라 주세요", "error");
        await run(btn, () => D.updatePatient(p.id, { status: "discharged", dischargedOn: v("dc-date"), dischargeReason: v("dc-reason") }));
        toast("치료를 종결했습니다. 왼쪽 목록 아래 '종결 환자 보기'에서 다시 찾을 수 있습니다"); return render();
      }
      case "f-settings": {
        const packs = [...f.querySelectorAll("input[name=pack]:checked")].map((c) => c.value);
        if (!packs.length) return toast("치료 분야를 하나 이상 골라 주세요", "error");
        const assistScale = f.querySelector("input[name=scale]:checked")?.value ?? "ot";
        const office = { on: f.querySelector("#of-on").checked, days: [...f.querySelectorAll("input[name=of-day]:checked")].map((c) => +c.value), start: v("of-start") || "09:00", end: v("of-end") || "18:00", message: v("of-msg") };
        if (office.on && (!office.days.length || office.start >= office.end)) return toast("응답 요일을 고르고, 끝 시간이 시작보다 늦게 해 주세요", "error");
        await run(btn, () => D.savePrefs({ ...(cache.profile.prefs ?? {}), assistScale, packs, office }));
        toast("설정을 저장했습니다"); return render();
      }
      case "f-assess": {
        let rows;
        try { rows = assessRows(f); } catch (err) { return toast(err.message, "error"); }
        if (!rows.length) return toast("입력한 값이 없습니다", "error");
        const n = await run(btn, () => D.addScores(p.id, rows));
        toast(`평가를 저장했습니다 (${n}건)`); return render();
      }
      case "f-appt": {
        const startsAt = new Date(`${v("ap-date")}T${v("ap-time")}`);
        if (Number.isNaN(startsAt.getTime())) return toast("날짜와 시간을 확인해 주세요", "error");
        const base = { patientId: v("ap-patient"), duration: parseInt(v("ap-dur")) || 30, kind: v("ap-kind"), note: v("ap-note") };
        const starts = [startsAt];
        if (v("ap-repeat") === "weekly") {
          const picked = [...f.querySelectorAll("input[name=ap-dow]:checked")].map((c) => +c.value);
          const dows = picked.length ? picked : [startsAt.getDay()];
          starts.length = 0;
          for (let i = 0; i < (parseInt(v("ap-weeks")) || 4) * 7; i++) {
            const d = new Date(startsAt); d.setDate(startsAt.getDate() + i);
            if (dows.includes(d.getDay())) starts.push(d);
          }
        }
        if (!starts.length) return toast("반복할 날짜가 없습니다", "error");
        if (starts.length > 100) return toast("한 번에 100건까지 추가할 수 있습니다", "error");
        const n = await run(btn, () => D.addAppointments(starts.map((d) => ({ ...base, startsAt: d.toISOString() }))));
        toast(n > 1 ? `일정 ${n}건을 추가했습니다` : "일정을 추가했습니다"); return render();
      }
      case "f-visit": {
        const num = (name) => { const x = f.elements[name]?.value.trim(); if (!x) return undefined; const n = Number(x); return Number.isFinite(n) && n >= 0 ? n : undefined; };
        const str = (name) => f.elements[name]?.value.trim() || undefined;
        const items = [...f.querySelectorAll("input[name=t]:checked")].map((c) => {
          const code = c.value;
          return JSON.parse(JSON.stringify({ code, side: str(`${code}.side`), level: str(`${code}.level`), weight: num(`${code}.weight`), sets: num(`${code}.sets`), reps: num(`${code}.reps`), minutes: num(`${code}.minutes`), assist: str(`${code}.assist`), response: str(`${code}.response`), how: str(`${code}.how`) })); // undefined 칸은 빼고 저장
        });
        const observations = [...f.querySelectorAll("input[name=obs]:checked")].map((c) => c.value);
        const note = v("vs-note"), staffNote = v("vs-staff");
        if (!items.length && !note && !staffNote) return toast("한 치료를 하나 이상 체크하거나 메모를 적어 주세요", "error");
        const date = v("vs-date") || localDate();
        const base = { date, duration: num("vs-dur") || null, items, observations, note, staffNote };
        if (state.visitEdit) {
          await run(btn, () => D.updateVisit(state.visitEdit, { ...base, goalIds: [...f.querySelectorAll("input[name=goal]:checked")].map((c) => c.value), appointmentId: v("vs-appt") }));
          state.visitEdit = null; window.scrollTo({ top: 0 });
          toast("내원기록을 수정했습니다"); return render();
        }
        // 그룹 치료: 함께 고른 환자는 그 날 아직 기록 없는 일정에 연결
        const freeAppt = (pid) => cache.appointments.find((a) => a.patientId === pid && a.date === date && a.status !== "cancelled" && !cache.visits.some((x) => x.appointmentId === a.id))?.id ?? null;
        const mates = [...f.querySelectorAll("input[name=mate]:checked")].map((c) => c.value);
        const goalIds = [...f.querySelectorAll("input[name=goal]:checked")].map((c) => c.value);
        const list = [{ ...base, goalIds, patientId: p.id, appointmentId: v("vs-appt") }, ...mates.map((pid) => ({ ...base, patientId: pid, appointmentId: freeAppt(pid) }))];
        await run(btn, () => D.addVisits(list));
        Object.assign(state, { visitAppt: null, visitPrefill: null });
        window.scrollTo({ top: 0 });
        const who = mates.length ? ` · 그룹 ${list.length}명` : "";
        if (btn?.dataset.next === "soap") {
          state.tab = "soap"; openDraft(p.id, date);
          const filled = fillAIDraft(p);
          toast(filled ? `내원기록을 저장하고 SOAP 초안을 채웠습니다${who}. [ ] 부분을 확인해 주세요` : `내원기록을 저장했습니다${who}. 이어 쓰던 초안을 열었습니다`);
          render(); return scheduleAutosave();
        }
        toast(`내원기록을 저장했습니다 (치료 ${items.length}가지${who})`); return render();
      }
      case "f-goal": {
        await run(btn, () => D.addGoal(p.id, { type: v("g-type"), text: v("g-text"), due: v("g-due") }));
        toast("목표를 추가했습니다"); return render();
      }
      case "f-prog": {
        await run(btn, () => D.addProgram(p.id, { title: v("pg-title"), detail: v("pg-detail"), target: parseInt(v("pg-target")) || 10, perDay: parseInt(v("pg-perday")) || 1, camera: v("pg-camera") || null, targetAngle: parseInt(v("pg-angle")) || 90 }));
        toast("환자 앱에 처방을 보냈습니다"); return render();
      }
      case "f-symptom": {
        const s = { patientId: p.id, date: localDate(), pain: +v("sy-pain"), fatigue: +v("sy-fatigue"), mood: +v("sy-mood"), sleep: +v("sy-sleep"), note: v("sy-note") };
        await run(btn, () => D.saveSymptom(s));
        if (s.pain >= 6) await run(null, () => D.sendMessage(p.id, `자동 알림: 오늘 컨디션 통증 ${s.pain}/10, 기분 ${MOOD[s.mood]}, 수면 ${SLEEP[s.sleep]}${s.note ? ` · “${s.note}”` : ""}`, "ai_alert", "warn")).then((m) => D.notifyMessage(m.id)).catch(() => {});
        state.editSymptom = false;
        toast(s.pain >= 6 ? "저장했습니다. 통증이 높아 치료사에게 알렸어요" : "오늘 컨디션을 저장했습니다"); return render();
      }
      case "f-msg": {
        const text = v("msg-text"); if (!text) return;
        const t = cache.profile.role === "patient" ? AI.triage(text) : null;
        const sent = await run(btn, () => D.sendMessage(p.id, text, "text", t?.level ?? null));
        D.notifyMessage(sent.id);
        if (t) await run(null, () => D.sendMessage(p.id, t.text, "ai_alert"));
        // 치료사 응답 시간 밖이면 자동 안내 (3시간에 한 번)
        if (cache.profile.role === "patient") {
          const o = R.officeOf(cache.prefsById[p.therapistId]);
          const recent = view.messages(p.id).some((m) => m.from === "ai" && m.text.startsWith("자동 안내:") && Date.now() - new Date(m.at) < 3 * 3600e3);
          if (!R.isOpen(o) && !recent) await run(null, () => D.sendMessage(p.id, R.autoReplyText(o), "ai_alert")).catch(() => {});
        }
        D.markRead(p.id).catch(() => {});
        const th = app.querySelector(".thread"); if (th) th.outerHTML = threadHtml(p.id);
        f.reset(); scrollThread(); return;
      }
    }
  } catch { /* run()이 이미 알림을 띄움 */ }
});

boot();
