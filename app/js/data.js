/* Supabase 데이터 계층
   - DB 행(snake_case)을 화면에서 쓰는 모양(camelCase)으로 바꿔 cache에 담는다.
   - 권한은 DB의 RLS가 보장한다. 여기서 select('*')를 해도 볼 수 있는 행만 돌아온다. */

import { DAY, localDate } from "./util.js";

const cfg = window.SOAPO_CONFIG ?? {};
export const configured = Boolean(cfg.supabaseUrl && cfg.supabaseKey);
// supabase-js는 vendor/ 폴더에 고정 버전으로 들어 있다 (index.html에서 먼저 로드 → window.supabase)
export const sb = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;

const empty = () => ({ profile: null, patients: [], notes: [], programs: [], sessions: [], messages: [], appointments: [], symptoms: [], reads: {}, names: {}, myLatest: null });
export const cache = empty();
export function clearCache() { Object.assign(cache, empty()); }

/** Supabase 오류를 사람이 읽을 수 있는 한국어로 */
export function explain(err) {
  const m = err?.message ?? String(err);
  if (/rate limit|security purposes|only request this after/i.test(m)) return "메일을 너무 자주 요청했습니다. 1분쯤 뒤에 다시 시도해 주세요.";
  if (/expired|invalid/i.test(m) && /otp|token/i.test(m)) return "코드가 틀렸거나 만료되었습니다. 메일의 최신 코드를 확인하거나 새로 요청해 주세요.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.";
  if (/row-level security|permission denied/i.test(m)) return "이 작업을 할 권한이 없습니다.";
  if (/duplicate key.*profiles_pkey/i.test(m)) return "이미 가입된 계정입니다. 새로고침해 주세요.";
  return m;
}
const must = ({ data, error }) => { if (error) throw error; return data; };

/* ---------- 행 → 화면 모델 ---------- */
const mapGoal = (g) => ({ id: g.id, patientId: g.patient_id, type: g.type, text: g.text, due: g.due_date, status: g.status });
const mapScore = (x) => ({ id: x.id, patientId: x.patient_id, date: x.measured_on, tool: x.tool, value: +x.value, max: x.max_value == null ? null : +x.max_value });
const mapNote = (n) => ({ id: n.id, patientId: n.patient_id, date: n.session_date, author: n.author_id, status: n.status, s: n.s, o: n.o, a: n.a, p: n.p, signedAt: n.signed_at });
const mapProgram = (x) => ({ id: x.id, patientId: x.patient_id, title: x.title, detail: x.instructions, target: x.target_count, unit: x.unit, perDay: x.per_day, camera: x.camera_metric, targetAngle: x.target_angle ?? 90 });
const mapSession = (x) => ({ id: x.id, patientId: x.patient_id, programId: x.program_id, at: x.performed_at, date: localDate(new Date(x.performed_at)), reps: x.reps, maxAngle: x.max_angle, pain: x.pain, comment: x.comment, source: x.source });
const mapAppt = (x) => ({ id: x.id, patientId: x.patient_id, therapistId: x.therapist_id, startsAt: x.starts_at, date: localDate(new Date(x.starts_at)), duration: x.duration_min, kind: x.kind, status: x.status, note: x.note });
const mapSymptom = (x) => ({ id: x.id, patientId: x.patient_id, date: x.logged_on, pain: x.pain, fatigue: x.fatigue, mood: x.mood, sleep: x.sleep, note: x.note });
function mapPatient(x) {
  return { id: x.id, name: x.name, age: x.birth_year ? new Date().getFullYear() - x.birth_year : null, birthYear: x.birth_year, sex: x.sex, diagnosis: x.diagnosis, onset: x.onset_date,
    therapistId: x.therapist_id, userId: x.user_id, invite: x.invite_code, affectedSide: x.affected_side, goals: [], scores: [] };
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
  notes: (pid) => cache.notes.filter((n) => n.patientId === pid).sort((a, b) => b.date.localeCompare(a.date) || (b.signedAt ?? "").localeCompare(a.signedAt ?? "")),
  programs: (pid) => cache.programs.filter((x) => x.patientId === pid),
  sessions: (pid) => cache.sessions.filter((x) => x.patientId === pid),
  messages: (pid) => cache.messages.filter((m) => m.patientId === pid),
  appointments: (pid) => cache.appointments.filter((x) => x.patientId === pid).sort(byTime),
  symptoms: (pid) => cache.symptoms.filter((x) => x.patientId === pid).sort((a, b) => a.date.localeCompare(b.date)),
  /** 다음 예정된 치료 (지금 이후, 예정 상태) */
  nextAppointment(pid) { const now = new Date().toISOString(); return this.appointments(pid).find((x) => x.status === "scheduled" && x.startsAt >= now) ?? null; },
  /** 내가 마지막으로 읽은 뒤 상대방이 보낸 메시지 수 */
  unread(pid) {
    const since = cache.reads[pid] ?? "";
    return this.messages(pid).filter((m) => m.senderId !== cache.profile?.id && m.at > since).length;
  },
  ctx(pid) { return { programs: this.programs(pid), sessions: this.sessions(pid), notes: this.notes(pid), messages: this.messages(pid), appointments: this.appointments(pid), symptoms: this.symptoms(pid) }; },
};

export async function loadProfile(userId) {
  const rows = must(await sb.from("profiles").select("*").eq("id", userId));
  cache.profile = rows[0] ?? null;
  return cache.profile;
}

export async function loadAll() {
  const since = new Date(Date.now() - 60 * DAY).toISOString();
  const apptFrom = new Date(Date.now() - 30 * DAY).toISOString();
  const apptTo = new Date(Date.now() + 90 * DAY).toISOString();
  const isT = cache.profile.role === "therapist";
  const [pa, go, as, no, pr, se, me, pf, latest, ap, sy, rd] = await Promise.all([
    sb.from("patients").select("*").order("created_at"),
    sb.from("goals").select("*").order("created_at"),
    sb.from("assessments").select("*").order("measured_on"),
    isT ? sb.from("soap_notes").select("*").order("session_date", { ascending: false }) : Promise.resolve({ data: [] }),
    sb.from("home_programs").select("*").eq("active", true).order("created_at"),
    sb.from("home_sessions").select("*").gte("performed_at", since).order("performed_at"),
    sb.from("messages").select("*").order("created_at", { ascending: false }).limit(500),
    sb.from("profiles").select("id,name,role,relation"),
    isT ? Promise.resolve({ data: [] }) : sb.rpc("my_latest_assessment"),
    sb.from("appointments").select("*").gte("starts_at", apptFrom).lte("starts_at", apptTo).order("starts_at"),
    sb.from("symptom_logs").select("*").gte("logged_on", localDate(new Date(Date.now() - 60 * DAY))).order("logged_on"),
    sb.from("thread_reads").select("*"),
  ]);
  cache.patients = must(pa).map(mapPatient);
  for (const g of must(go)) view.patient(g.patient_id)?.goals.push(mapGoal(g));
  for (const s of must(as)) view.patient(s.patient_id)?.scores.push(mapScore(s));
  cache.notes = must(no).map(mapNote);
  cache.programs = must(pr).map(mapProgram);
  cache.sessions = must(se).map(mapSession);
  cache.messages = must(me).reverse().map(mapMessage);
  cache.names = Object.fromEntries(must(pf).map((x) => [x.id, x.name]));
  const l = must(latest)?.[0];
  cache.myLatest = l ? { date: l.session_date, a: l.a } : null;
  cache.appointments = must(ap).map(mapAppt);
  cache.symptoms = must(sy).map(mapSymptom);
  cache.reads = Object.fromEntries(must(rd).map((x) => [x.patient_id, x.last_read_at]));
}

/* ---------- 로그인 ---------- */
export const auth = {
  sendLink: (email) => sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } }).then(must),
  verifyCode: (email, token) => sb.auth.verifyOtp({ email, token, type: "email" }).then(must),
  signOut: () => sb.auth.signOut(),
  registerTherapist: (name, license) => sb.rpc("register_therapist", { p_name: name, p_license: license }).then(must),
  redeemInvite: (code, name, relation) => sb.rpc("redeem_invite", { p_code: code, p_name: name, p_relation: relation }).then(must),
};

/* ---------- 쓰기 ---------- */
export async function createPatient(f) {
  const row = must(await sb.from("patients").insert({ therapist_id: cache.profile.id, name: f.name, birth_year: f.birthYear || null, sex: f.sex || null, diagnosis: f.diagnosis || null, onset_date: f.onset || null, affected_side: f.affectedSide }).select().single());
  const p = mapPatient(row); cache.patients.push(p); return p;
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
export async function addScore(pid, s) {
  const row = must(await sb.from("assessments").insert({ patient_id: pid, tool: s.tool, value: s.value, max_value: s.max ?? null, measured_on: s.date }).select().single());
  view.patient(pid).scores.push(mapScore(row));
}
export async function signNote(note, aiCheck, aiDraftUsed) {
  const row = must(await sb.from("soap_notes").insert({ patient_id: note.patientId, session_date: note.date, s: note.s, o: note.o, a: note.a, p: note.p, status: "signed", ai_check: aiCheck, ai_draft_used: aiDraftUsed }).select().single());
  cache.notes.push(mapNote(row));
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
export async function addAppointment(a) {
  const row = must(await sb.from("appointments").insert({ patient_id: a.patientId, starts_at: a.startsAt, duration_min: a.duration, kind: a.kind, note: a.note || null }).select().single());
  cache.appointments.push(mapAppt(row));
}
export async function setAppointmentStatus(id, status) {
  must(await sb.from("appointments").update({ status }).eq("id", id));
  const a = cache.appointments.find((x) => x.id === id); if (a) a.status = status;
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
}
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
