/* Supabase 데이터 계층
   - DB 행(snake_case)을 화면에서 쓰는 모양(camelCase)으로 바꿔 cache에 담는다.
   - 권한은 DB의 RLS가 보장한다. 여기서 select('*')를 해도 볼 수 있는 행만 돌아온다. */

import { DAY, localDate } from "./util.js";
import { setAssistScale } from "./catalog.js";

const cfg = window.SOAPO_CONFIG ?? {};
/** 비밀번호 재설정 메일 링크로 들어왔는지 (Supabase가 주소를 지우기 전에 기억) */
export const arrivedForRecovery = /type=recovery/.test(location.hash);
export const configured = Boolean(cfg.supabaseUrl && cfg.supabaseKey);
// supabase-js는 vendor/ 폴더에 고정 버전으로 들어 있다 (index.html에서 먼저 로드 → window.supabase)
export const sb = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;

const empty = () => ({ profile: null, patients: [], notes: [], programs: [], sessions: [], messages: [], appointments: [], symptoms: [], visits: [], prefsById: {}, reads: {}, names: {}, myLatest: null });
export const cache = empty();
export function clearCache() { Object.assign(cache, empty()); }

/** Supabase 오류를 사람이 읽을 수 있는 한국어로 */
export function explain(err) {
  const m = err?.message ?? String(err);
  if (/rate limit|security purposes|only request this after/i.test(m)) return "메일을 너무 자주 요청했습니다. 1분쯤 뒤에 다시 시도해 주세요.";
  if (/invalid login credentials/i.test(m)) return "이메일 또는 비밀번호가 맞지 않습니다.";
  if (/email not confirmed/i.test(m)) return "이메일 인증이 아직 끝나지 않았습니다. 가입할 때 받은 메일의 링크를 누르거나 코드를 입력해 주세요.";
  if (/already registered|already been registered/i.test(m)) return "이미 가입된 이메일입니다. 로그인하거나 비밀번호 찾기를 이용해 주세요.";
  if (/password should be|weak password|password.*(short|characters)/i.test(m)) return "비밀번호가 너무 짧거나 쉽습니다. 8자 이상으로, 영문과 숫자를 섞어 주세요.";
  if (/same password|different from the old/i.test(m)) return "새 비밀번호는 이전 비밀번호와 달라야 합니다.";
  if (/expired|invalid/i.test(m) && /otp|token/i.test(m)) return "코드가 틀렸거나 만료되었습니다. 메일의 최신 코드를 확인하거나 새로 요청해 주세요.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.";
  if (/row-level security|permission denied/i.test(m)) return "이 작업을 할 권한이 없습니다.";
  if (/duplicate key.*profiles_pkey/i.test(m)) return "이미 가입된 계정입니다. 새로고침해 주세요.";
  if (/patients_chart_no/i.test(m)) return "같은 차트번호의 환자가 이미 있습니다.";
  return m;
}
const must = ({ data, error }) => { if (error) throw error; return data; };

/* ---------- 행 → 화면 모델 ---------- */
const mapGoal = (g) => ({ id: g.id, patientId: g.patient_id, type: g.type, text: g.text, due: g.due_date, status: g.status });
const mapScore = (x) => ({ id: x.id, patientId: x.patient_id, date: x.measured_on, tool: x.tool, value: +x.value, max: x.max_value == null ? null : +x.max_value, details: x.details ?? null, createdAt: x.created_at });
const mapNote = (n) => ({ id: n.id, patientId: n.patient_id, date: n.session_date, author: n.author_id, status: n.status, s: n.s, o: n.o, a: n.a, p: n.p, signedAt: n.signed_at, amendsId: n.amends_id, amendReason: n.amend_reason, createdAt: n.created_at });
const mapProgram = (x) => ({ id: x.id, patientId: x.patient_id, title: x.title, detail: x.instructions, target: x.target_count, unit: x.unit, perDay: x.per_day, camera: x.camera_metric, targetAngle: x.target_angle ?? 90 });
const mapSession = (x) => ({ id: x.id, patientId: x.patient_id, programId: x.program_id, at: x.performed_at, date: localDate(new Date(x.performed_at)), reps: x.reps, maxAngle: x.max_angle, pain: x.pain, comment: x.comment, source: x.source });
const mapAppt = (x) => ({ id: x.id, patientId: x.patient_id, therapistId: x.therapist_id, startsAt: x.starts_at, date: localDate(new Date(x.starts_at)), duration: x.duration_min, kind: x.kind, status: x.status, note: x.note });
const mapVisit = (x) => ({ id: x.id, groupId: x.group_id, goalIds: x.goal_ids ?? [], patientId: x.patient_id, therapistId: x.therapist_id, appointmentId: x.appointment_id, date: x.visited_on, duration: x.duration_min, items: x.items ?? [], observations: [], staffNote: null, note: x.note, createdAt: x.created_at });
const mapSymptom = (x) => ({ id: x.id, patientId: x.patient_id, date: x.logged_on, pain: x.pain, fatigue: x.fatigue, mood: x.mood, sleep: x.sleep, note: x.note });
function mapPatient(x) {
  return { id: x.id, name: x.name, age: x.birth_year ? new Date().getFullYear() - x.birth_year : null, birthYear: x.birth_year, sex: x.sex, diagnosis: x.diagnosis, onset: x.onset_date,
    therapistId: x.therapist_id, userId: x.user_id, invite: x.invite_code, affectedSide: x.affected_side, firstVisit: x.first_visit_on, birthDate: x.birth_date,
    chartNo: x.chart_no, precautions: x.precautions ?? [], precautionNote: x.precaution_note, weightBearing: x.weight_bearing, dietFood: x.diet_food, dietDrink: x.diet_drink,
    status: x.status ?? "active", dischargedOn: x.discharged_on, dischargeReason: x.discharge_reason, goals: [], scores: [] };
}
function mapMessage(m) {
  const p = cache.patients.find((x) => x.id === m.patient_id);
  const from = m.kind === "ai_alert" ? "ai" : p && m.sender_id === p.userId ? "patient" : "therapist";
  return { id: m.id, patientId: m.patient_id, from, senderId: m.sender_id, text: m.body, at: m.created_at, triage: m.triage };
}

/* ---------- 조회 ---------- */
const byTime = (a, b) => a.startsAt.localeCompare(b.startsAt);
export const view = {
  patient: (id) => cache.patients.find((p) => p.id === id),
  /** 치료 중인 환자 (종결 제외) */
  active: () => cache.patients.filter((p) => p.status !== "discharged"),
  /** 서명된 기록 (정정 기록 포함, 임시 저장 제외) */
  notes: (pid) => cache.notes.filter((n) => n.patientId === pid && n.status !== "draft").sort((a, b) => b.date.localeCompare(a.date) || (b.signedAt ?? "").localeCompare(a.signedAt ?? "")),
  /** 임시 저장한 SOAP 초안 (날짜를 주면 그 날짜 것만) */
  draft: (pid, date) => cache.notes.filter((n) => n.patientId === pid && n.status === "draft" && (!date || n.date === date)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
  programs: (pid) => cache.programs.filter((x) => x.patientId === pid),
  sessions: (pid) => cache.sessions.filter((x) => x.patientId === pid),
  messages: (pid) => cache.messages.filter((m) => m.patientId === pid),
  appointments: (pid) => cache.appointments.filter((x) => x.patientId === pid).sort(byTime),
  visits: (pid) => cache.visits.filter((x) => x.patientId === pid).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
  symptoms: (pid) => cache.symptoms.filter((x) => x.patientId === pid).sort((a, b) => a.date.localeCompare(b.date)),
  /** 다음 예정된 치료 (지금 이후, 예정 상태) */
  nextAppointment(pid) { const now = new Date().toISOString(); return this.appointments(pid).find((x) => x.status === "scheduled" && x.startsAt >= now) ?? null; },
  /** 내가 마지막으로 읽은 뒤 상대방이 보낸 메시지 수 */
  unread(pid) {
    const since = cache.reads[pid] ?? "";
    return this.messages(pid).filter((m) => m.senderId !== cache.profile?.id && m.at > since).length;
  },
  ctx(pid) { return { programs: this.programs(pid), sessions: this.sessions(pid), notes: this.notes(pid), messages: this.messages(pid), appointments: this.appointments(pid), symptoms: this.symptoms(pid), visits: this.visits(pid) }; },
};

export async function loadProfile(userId) {
  const rows = must(await sb.from("profiles").select("*").eq("id", userId));
  cache.profile = rows[0] ?? null;
  if (cache.profile) { cache.profile.prefs ??= {}; setAssistScale(cache.profile.prefs.assistScale); }
  return cache.profile;
}

export async function loadAll() {
  const since = new Date(Date.now() - 60 * DAY).toISOString();
  const apptFrom = new Date(Date.now() - 30 * DAY).toISOString();
  const apptTo = new Date(Date.now() + 90 * DAY).toISOString();
  const isT = cache.profile.role === "therapist";
  const [pa, go, as, no, pr, se, me, pf, latest, ap, sy, rd, vi, vp] = await Promise.all([
    sb.from("patients").select("*").order("created_at"),
    sb.from("goals").select("*").order("created_at"),
    sb.from("assessments").select("*").order("measured_on"),
    isT ? sb.from("soap_notes").select("*").order("session_date", { ascending: false }) : Promise.resolve({ data: [] }),
    sb.from("home_programs").select("*").eq("active", true).order("created_at"),
    sb.from("home_sessions").select("*").gte("performed_at", since).order("performed_at"),
    sb.from("messages").select("*").order("created_at", { ascending: false }).limit(500),
    sb.from("profiles").select("id,name,role,relation,prefs"),
    isT ? Promise.resolve({ data: [] }) : sb.rpc("my_latest_assessment"),
    sb.from("appointments").select("*").gte("starts_at", apptFrom).lte("starts_at", apptTo).order("starts_at"),
    sb.from("symptom_logs").select("*").gte("logged_on", localDate(new Date(Date.now() - 60 * DAY))).order("logged_on"),
    sb.from("thread_reads").select("*"),
    sb.from("visits").select("*").order("visited_on", { ascending: false }).limit(300),
    isT ? sb.from("visit_private").select("*") : Promise.resolve({ data: [] }),
  ]);
  cache.patients = must(pa).map(mapPatient);
  for (const g of must(go)) view.patient(g.patient_id)?.goals.push(mapGoal(g));
  for (const s of must(as)) view.patient(s.patient_id)?.scores.push(mapScore(s));
  cache.notes = must(no).map(mapNote);
  cache.programs = must(pr).map(mapProgram);
  cache.sessions = must(se).map(mapSession);
  cache.messages = must(me).reverse().map(mapMessage);
  cache.names = Object.fromEntries(must(pf).map((x) => [x.id, x.name]));
  cache.prefsById = Object.fromEntries(must(pf).map((x) => [x.id, x.prefs ?? {}]));   // 환자 앱: 담당 치료사 응답 시간
  const l = must(latest)?.[0];
  cache.myLatest = l ? { date: l.session_date, a: l.a } : null;
  cache.appointments = must(ap).map(mapAppt);
  cache.symptoms = must(sy).map(mapSymptom);
  cache.reads = Object.fromEntries(must(rd).map((x) => [x.patient_id, x.last_read_at]));
  cache.visits = must(vi).map(mapVisit);
  const priv = Object.fromEntries(must(vp).map((x) => [x.visit_id, x]));
  for (const v of cache.visits) applyPrivate(v, priv[v.id]);
}
/** 치료사 전용 관찰·메모 (환자는 이 테이블을 읽을 수 없다) */
function applyPrivate(v, x) { v.observations = x?.observations ?? []; v.staffNote = x?.staff_note ?? null; }

/* ---------- 로그인 ---------- */
const redirectTo = () => location.origin + location.pathname;
export const auth = {
  /** 이메일·비밀번호로 가입. 인증 메일 확인이 필요하면 session 없이 돌아온다 */
  async signUp(email, password) {
    const data = must(await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } }));
    // 이미 가입된 이메일이면 Supabase는 오류 대신 빈 계정을 돌려준다 (가입 여부 노출 방지)
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error("already registered");
    return data;
  },
  signIn: (email, password) => sb.auth.signInWithPassword({ email, password }).then(must),
  resendSignup: (email) => sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo() } }).then(must),
  verifySignup: (email, token) => sb.auth.verifyOtp({ email, token, type: "signup" }).then(must),
  sendReset: (email) => sb.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() }).then(must),
  setPassword: (password) => sb.auth.updateUser({ password }).then(must),
  sendLink: (email) => sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo(), shouldCreateUser: false } }).then(must),
  verifyCode: (email, token) => sb.auth.verifyOtp({ email, token, type: "email" }).then(must),
  signOut: () => sb.auth.signOut(),
  registerTherapist: (name, license) => sb.rpc("register_therapist", { p_name: name, p_license: license }).then(must),
  redeemInvite: (code, name, relation) => sb.rpc("redeem_invite", { p_code: code, p_name: name, p_relation: relation }).then(must),
};

/* ---------- 쓰기 ---------- */
export async function createPatient(f) {
  const row = must(await sb.from("patients").insert({ therapist_id: cache.profile.id, name: f.name, birth_date: f.birthDate || null, first_visit_on: f.firstVisit || null, chart_no: f.chartNo || null }).select().single());
  const p = mapPatient(row); cache.patients.push(p); return p;
}
/** 환자 정보 수정. 화면 이름(camelCase) → DB 열 이름 */
const PATIENT_COLS = { name: "name", birthDate: "birth_date", firstVisit: "first_visit_on", chartNo: "chart_no", diagnosis: "diagnosis", onset: "onset_date", affectedSide: "affected_side",
  precautions: "precautions", precautionNote: "precaution_note", weightBearing: "weight_bearing", dietFood: "diet_food", dietDrink: "diet_drink",
  status: "status", dischargedOn: "discharged_on", dischargeReason: "discharge_reason" };
export async function updatePatient(pid, f) {
  const body = {};
  for (const [k, v] of Object.entries(f)) if (PATIENT_COLS[k]) body[PATIENT_COLS[k]] = v === "" ? null : v;
  const row = must(await sb.from("patients").update(body).eq("id", pid).select().single());
  const p = view.patient(pid), fresh = mapPatient(row);
  Object.assign(p, { ...fresh, goals: p.goals, scores: p.scores });
}
/** 치료사 설정 저장 (도움 수준 표기, 치료 분야) */
export async function savePrefs(prefs) {
  const row = must(await sb.from("profiles").update({ prefs }).eq("id", cache.profile.id).select("prefs").single());
  cache.profile.prefs = row.prefs; setAssistScale(row.prefs.assistScale);
}
export async function reissueInvite(pid) {
  const code = must(await sb.rpc("reissue_invite", { p_patient: pid }));
  view.patient(pid).invite = code; return code;
}
export async function addGoal(pid, g) {
  const row = must(await sb.from("goals").insert({ patient_id: pid, type: g.type, text: g.text, due_date: g.due || null }).select().single());
  view.patient(pid).goals.push(mapGoal(row));
}
export async function setGoalStatus(pid, gid, status) {
  must(await sb.from("goals").update({ status }).eq("id", gid));
  const g = view.patient(pid).goals.find((x) => x.id === gid); if (g) g.status = status;
}
/** 평가 점수 여러 개를 한 번에 저장 (세부 평가는 부위·항목마다 한 행) */
export async function addScores(pid, list) {
  const rows = must(await sb.from("assessments").insert(list.map((s) => ({ patient_id: pid, tool: s.tool, value: s.value, max_value: s.max ?? null, measured_on: s.date, details: s.details ?? null }))).select());
  view.patient(pid).scores.push(...rows.map(mapScore));
  return rows.length;
}
const putNote = (row) => { cache.notes = cache.notes.filter((n) => n.id !== row.id); cache.notes.push(mapNote(row)); return row.id; };
/** SOAP 임시 저장: 처음이면 새 초안, 이미 있으면 덮어쓴다. 초안 id를 돌려준다 */
export async function saveDraft(note, aiDraftUsed) {
  const body = { session_date: note.date, s: note.s, o: note.o, a: note.a, p: note.p, ai_draft_used: aiDraftUsed };
  const row = note.id
    ? must(await sb.from("soap_notes").update(body).eq("id", note.id).select().single())
    : must(await sb.from("soap_notes").insert({ ...body, patient_id: note.patientId, status: "draft" }).select().single());
  return putNote(row);
}
export async function deleteDraft(id) {
  must(await sb.from("soap_notes").delete().eq("id", id));
  cache.notes = cache.notes.filter((n) => n.id !== id);
}
/** 서명: 임시 저장한 초안이면 그 행을 서명 상태로, 아니면 새로 저장. 정정 기록은 원본 id와 사유를 함께 */
export async function signNote(note, aiCheck, aiDraftUsed) {
  const body = { session_date: note.date, s: note.s, o: note.o, a: note.a, p: note.p, status: "signed", ai_check: aiCheck, ai_draft_used: aiDraftUsed };
  const row = note.id
    ? must(await sb.from("soap_notes").update(body).eq("id", note.id).select().single())
    : must(await sb.from("soap_notes").insert({ ...body, patient_id: note.patientId, amends_id: note.amends ?? null, amend_reason: note.amends ? note.reason : null }).select().single());
  putNote(row);
}
export async function addProgram(pid, x) {
  const row = must(await sb.from("home_programs").insert({ patient_id: pid, title: x.title, instructions: x.detail, target_count: x.target, unit: x.unit ?? "회", per_day: x.perDay ?? 1, camera_metric: x.camera, target_angle: x.targetAngle ?? 90 }).select().single());
  cache.programs.push(mapProgram(row));
}
export async function stopProgram(id) {
  must(await sb.from("home_programs").update({ active: false }).eq("id", id));
  cache.programs = cache.programs.filter((x) => x.id !== id);
}
export async function addSession(s) {
  const row = must(await sb.from("home_sessions").insert({ patient_id: s.patientId, program_id: s.programId, reps: s.reps, max_angle: s.maxAngle ?? null, pain: s.pain ?? 0, comment: s.comment || null, source: s.source }).select().single());
  cache.sessions.push(mapSession(row));
}
/** 일정 여러 개를 한 번에 추가 (반복 일정) */
export async function addAppointments(list) {
  const rows = must(await sb.from("appointments").insert(list.map((a) => ({ patient_id: a.patientId, starts_at: a.startsAt, duration_min: a.duration, kind: a.kind, note: a.note || null }))).select());
  cache.appointments.push(...rows.map(mapAppt));
  return rows.length;
}
export async function setAppointmentStatus(id, status) {
  must(await sb.from("appointments").update({ status }).eq("id", id));
  const a = cache.appointments.find((x) => x.id === id); if (a) a.status = status;
}
const visitBody = (v) => ({ goal_ids: v.goalIds ?? [], appointment_id: v.appointmentId || null, visited_on: v.date, duration_min: v.duration ?? null, items: v.items, note: v.note || null });
/** 치료사 전용 부분 저장. force면 비어 있어도 저장 (수정할 때 지운 내용 반영) */
async function savePrivate(pairs, force = false) {
  const rows = pairs.filter(([, v]) => force || v.observations?.length || v.staffNote)
    .map(([visit, v]) => ({ visit_id: visit.id, patient_id: visit.patientId, observations: v.observations ?? [], staff_note: v.staffNote || null }));
  if (rows.length) must(await sb.from("visit_private").upsert(rows, { onConflict: "visit_id" }));
  for (const [visit, v] of pairs) { visit.observations = v.observations ?? []; visit.staffNote = v.staffNote || null; }
}
async function completeAppointments(ids) {
  const todo = cache.appointments.filter((a) => ids.includes(a.id) && a.status === "scheduled");
  if (!todo.length) return;
  must(await sb.from("appointments").update({ status: "done" }).in("id", todo.map((a) => a.id)));
  for (const a of todo) a.status = "done";
}
/** 내원기록 저장 (그룹 치료면 여러 환자에게 같은 내용으로). 연결한 일정이 '예정'이면 '완료'로 바꾼다 */
export async function addVisits(list) {
  const groupId = list.length > 1 ? crypto.randomUUID() : null;
  const rows = must(await sb.from("visits").insert(list.map((v) => ({ ...visitBody(v), patient_id: v.patientId, group_id: groupId }))).select());
  const visits = rows.map(mapVisit);
  cache.visits.push(...visits);
  await savePrivate(visits.map((x) => [x, list.find((v) => v.patientId === x.patientId)]));
  await completeAppointments(list.map((v) => v.appointmentId).filter(Boolean));
}
export async function updateVisit(id, v) {
  const row = must(await sb.from("visits").update(visitBody(v)).eq("id", id).select().single());
  const fresh = mapVisit(row);
  cache.visits = cache.visits.map((x) => (x.id === id ? fresh : x));
  await savePrivate([[fresh, v]], true);
  await completeAppointments([v.appointmentId].filter(Boolean));
}
export async function deleteVisit(id) {
  must(await sb.from("visits").delete().eq("id", id));
  cache.visits = cache.visits.filter((x) => x.id !== id);
}
export async function saveSymptom(s) {
  const row = must(await sb.from("symptom_logs").upsert({ patient_id: s.patientId, logged_on: s.date, pain: s.pain, fatigue: s.fatigue, mood: s.mood, sleep: s.sleep, note: s.note || null }, { onConflict: "patient_id,logged_on" }).select().single());
  cache.symptoms = cache.symptoms.filter((x) => !(x.patientId === s.patientId && x.date === s.date));
  cache.symptoms.push(mapSymptom(row));
}
/** 대화를 열었을 때 읽음 표시 (실패해도 화면에는 영향 없음) */
export async function markRead(pid) {
  const now = new Date().toISOString();
  cache.reads[pid] = now;
  await sb.from("thread_reads").upsert({ patient_id: pid, last_read_at: now }, { onConflict: "user_id,patient_id" });
}
export async function sendMessage(pid, body, kind = "text", triage = null) {
  const row = must(await sb.from("messages").insert({ patient_id: pid, body, kind, triage }).select().single());
  addMessageRow(row);
  return row;
}
/** 상대방 기기로 알림 보내기 (서버 함수). 실패해도 메시지 전송에는 영향 없음 */
export function notifyMessage(messageId) {
  if (!cfg.vapidPublicKey) return Promise.resolve();
  return sb.functions.invoke("notify", { body: { message_id: messageId } }).catch(() => {});
}
/** 이 기기의 알림 구독을 서버에 저장 */
export const savePushSubscription = (sub) => {
  const j = sub.toJSON();
  return sb.rpc("save_push_subscription", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth }).then(must);
};
export const vapidPublicKey = cfg.vapidPublicKey ?? "";
/** 새 메시지 행을 캐시에 넣는다 (내가 보낸 것과 실시간으로 받은 것이 겹치지 않게) */
export function addMessageRow(row) {
  if (cache.messages.some((m) => m.id === row.id)) return false;
  cache.messages.push(mapMessage(row)); return true;
}

/** 새 메시지 실시간 구독. RLS 때문에 볼 수 있는 메시지만 온다. */
export function subscribeMessages(onNew) {
  const ch = sb.channel("messages-feed")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => { if (addMessageRow(payload.new)) onNew(payload.new); })
    .subscribe();
  return () => sb.removeChannel(ch);
}
