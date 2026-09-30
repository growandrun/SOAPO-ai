/* AI 보조 기능 (현재: 규칙 기반)
   모든 함수는 순수 함수: 데이터를 받아 결과를 돌려준다.
   나중에 서버 LLM 호출로 바꿀 때도 입출력 형태를 유지하면 화면 코드는 그대로 쓸 수 있다. */

import { DAY, localDate, fmtDate } from "./util.js";

export const ASSIST = [["I", "독립"], ["Mod I", "수정된 독립"], ["S", "감독"], ["Min A", "최소 도움"], ["Mod A", "중등도 도움"], ["Max A", "최대 도움"], ["Dep", "전적 도움"]];
const VAGUE = ["많이", "조금", "좋아", "나빠", "괜찮", "잘 함", "잘함", "못 함", "대체로", "어느 정도"];
const PLAIN_ASSIST = { "수정된 독립": "도구를 쓰면 혼자서", "최소 도움": "조금만 도움을 받아", "중등도 도움": "절반 정도 도움을 받아", "최대 도움": "많은 도움을 받아", "감독": "옆에서 지켜보는 가운데", "독립": "혼자서" };

function bigrams(s) { const t = s.replace(/\s+/g, ""); const out = new Set(); for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2)); return out; }
function similarity(a, b) { const A = bigrams(a), B = bigrams(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach((x) => B.has(x) && n++); return n / (A.size + B.size - n); }

/** SOAP 품질 검사: 흔한 기록 실수를 찾는다. level: danger(서명 불가) | warn | info */
export function checkNote(note, prev) {
  const r = [];
  const add = (sec, level, text) => r.push({ sec, level, text });
  const { s = "", o = "", a = "", p = "" } = note;
  for (const k of ["s", "o", "a", "p"]) if (/\[[^\]]*\]|""/.test(note[k] ?? "")) add(k.toUpperCase(), "danger", `${k.toUpperCase()}에 AI 초안의 빈칸([ ] 또는 "")이 남아 있습니다. 직접 확인해 채워 주세요.`);
  if (!s.trim()) add("S", "danger", "S가 비어 있습니다. 환자나 보호자가 한 말을 적어 주세요.");
  else if (!/["“”']|보고|호소/.test(s)) add("S", "info", "환자의 말을 따옴표로 직접 인용하면 기록 신뢰도가 올라갑니다.");
  if (!o.trim()) add("O", "danger", "O가 비어 있습니다. 측정값과 관찰 결과를 적어 주세요.");
  else {
    if (!/\d/.test(o)) add("O", "danger", "O에 숫자(점수, 각도, 횟수, 시간)가 없습니다.");
    const v = VAGUE.filter((w) => o.includes(w));
    if (v.length) add("O", "warn", `O에 측정할 수 없는 표현이 있습니다: ${v.map((x) => `“${x}”`).join(", ")}. 수치나 도움 수준으로 바꿔 주세요.`);
    if (!ASSIST.some(([k, ko]) => new RegExp(`(^|[^A-Za-z-])${k}([^A-Za-z]|$)`).test(o) || o.includes(ko))) add("O", "warn", "도움 수준(I, Mod I, S, Min A, Mod A, Max A, Dep)이 표시되지 않았습니다.");
  }
  if (!a.trim()) add("A", "danger", "A가 비어 있습니다. S와 O를 근거로 해석을 적어 주세요.");
  else {
    if (!/STG|LTG|목표/.test(a)) add("A", "warn", "A가 목표(STG/LTG)와 연결되지 않았습니다. 어느 목표에 대한 진전인지 적어 주세요.");
    if (a.trim().length < 40) add("A", "info", "A가 짧습니다. 문제의 원인과 예후를 한 문장씩 추가해 보세요.");
  }
  if (!p.trim()) add("P", "danger", "P가 비어 있습니다.");
  else {
    if (!/주\s*\d|\d+\s*회|\d+\s*분/.test(p)) add("P", "warn", "P에 빈도나 시간(예: 주 5회, 30분)이 없습니다.");
    if (!/재평가/.test(p)) add("P", "warn", "P에 재평가 일정이 없습니다.");
  }
  if (prev) for (const k of ["s", "o", "a", "p"]) {
    if ((note[k] ?? "").trim().length > 20 && similarity(note[k], prev[k] ?? "") > 0.85) add(k.toUpperCase(), "warn", `${k.toUpperCase()}가 지난 기록(${fmtDate(prev.date)})과 거의 같습니다. 복사한 내용이 오늘 상태와 맞는지 확인해 주세요.`);
  }
  const penalty = r.reduce((t, x) => t + (x.level === "danger" ? 25 : x.level === "warn" ? 10 : 3), 0);
  return { items: r, score: Math.max(0, 100 - penalty) };
}

/** 최근 N일 가정 훈련 요약 */
export function homeStats(programs, sessions, days = 7) {
  const since = localDate(new Date(Date.now() - days * DAY));
  const ss = sessions.filter((x) => x.date > since);
  const expected = programs.reduce((t, x) => t + x.perDay * days, 0);
  const adherence = expected ? Math.min(100, Math.round((ss.length / expected) * 100)) : null;
  const cam = ss.filter((x) => x.source === "camera" && x.maxAngle != null);
  const maxPain = ss.reduce((m, x) => Math.max(m, x.pain ?? 0), 0);
  const painNotes = ss.filter((x) => x.comment).map((x) => `${fmtDate(x.date)} “${x.comment}”`);
  return { adherence, done: ss.length, expected, cam, maxPain, painNotes };
}

export function latestScores(scores) {
  const tools = [...new Set(scores.map((x) => x.tool))];
  return tools.map((t) => {
    const arr = scores.filter((x) => x.tool === t).sort((a, b) => a.date.localeCompare(b.date));
    const last = arr[arr.length - 1];
    return { ...last, prev: arr.length > 1 ? arr[arr.length - 2].value : null };
  });
}

/** 치료사 대시보드용 자동 검진 (위험 신호) */
export function screen(patient, { programs, sessions, notes }) {
  const out = [];
  const today = localDate();
  const st = homeStats(programs, sessions);
  if (st.adherence !== null && st.adherence < 50) out.push({ level: "warn", text: `최근 7일 가정 훈련 수행률 ${st.adherence}% (${st.done}/${st.expected}회). 동기나 이해도를 확인해 보세요.` });
  if (st.maxPain >= 5) out.push({ level: "danger", text: `가정 훈련 중 통증 ${st.maxPain}/10 보고. ${st.painNotes.slice(-1)[0] ?? ""}` });
  if (st.cam.length >= 3) {
    const first = st.cam[0].maxAngle, last = st.cam[st.cam.length - 1].maxAngle;
    if (last < first - 10) out.push({ level: "warn", text: `카메라 측정 어깨 굽힘 최대각이 ${first}°에서 ${last}°로 줄었습니다.` });
  }
  const lastNote = notes[0];
  const weekAgo = localDate(new Date(Date.now() - 7 * DAY));
  if (!lastNote || lastNote.date < weekAgo) out.push({ level: "info", text: lastNote ? `최근 7일간 작성한 SOAP 노트가 없습니다 (마지막 ${fmtDate(lastNote.date)}).` : "아직 작성한 SOAP 노트가 없습니다." });
  const inWeek = localDate(new Date(Date.now() + 7 * DAY));
  for (const g of patient.goals) {
    if (g.status !== "active" || !g.due) continue;
    if (g.due < today) out.push({ level: "danger", text: `${g.type} 기한이 지났습니다 (${fmtDate(g.due)}). 재평가 후 목표를 수정하거나 달성 처리하세요.` });
    else if (g.due <= inWeek) out.push({ level: "info", text: `${g.type} 기한이 ${fmtDate(g.due)}입니다. 재평가를 예약하세요.` });
  }
  return out;
}

/** SOAP 초안: 가정 훈련·메시지·점수를 모아 치료사가 고칠 초안을 만든다. 모르는 부분은 [ ]로 남긴다. */
export function draftNote(patient, { programs, sessions, messages }) {
  const st = homeStats(programs, sessions);
  const weekAgo = new Date(Date.now() - 7 * DAY).toISOString();
  const msgs = messages.filter((m) => m.from === "patient" && m.at >= weekAgo);
  const scores = latestScores(patient.scores);
  const stg = patient.goals.find((g) => g.type === "STG" && g.status === "active");
  const s = [
    ...msgs.map((m) => `환자(메시지 ${fmtDate(m.at)}): "${m.text}"`),
    ...st.painNotes.map((x) => `가정 훈련 기록: ${x}`),
  ].join("\n") || "환자: \"\"  ← 오늘 환자가 한 말을 적어 주세요";
  const camLine = st.cam.length ? `- 가정 카메라 기록: 어깨 굽힘 최대 ${st.cam[st.cam.length - 1].maxAngle}° (최근 7일 첫 기록 ${st.cam[0].maxAngle}°)` : null;
  const o = [
    ...scores.map((x) => `- ${x.tool} ${x.value}${x.max ? "/" + x.max : ""} (측정 ${fmtDate(x.date)}${x.prev != null ? `, 이전 ${x.prev}` : ""})`),
    st.adherence != null ? `- 가정 훈련 수행률 ${st.adherence}% (${st.done}/${st.expected}회), 최대 통증 ${st.maxPain}/10` : null,
    camLine,
    "- [수행한 작업]: [도움 수준], [소요 시간]분",
  ].filter(Boolean).join("\n");
  const k = scores.find((x) => x.tool === "K-MBI");
  const a = [
    k && k.prev != null ? `K-MBI ${k.value - k.prev >= 0 ? k.value - k.prev + "점 향상" : Math.abs(k.value - k.prev) + "점 저하"}.` : "",
    stg ? `STG(“${stg.text.slice(0, 28)}…”)에 대해 [진전 양호 / 정체 / 저하].` : "",
    st.maxPain >= 5 ? "가정 훈련 중 통증 보고가 있어 운동 강도 조정 필요 여부 확인 필요." : "",
    "[문제의 원인과 재활 잠재력을 적어 주세요]",
  ].filter(Boolean).join(" ");
  const inWeek = localDate(new Date(Date.now() + 7 * DAY));
  const p = [
    "- 주 5회, 회당 30분 작업치료 지속",
    ...programs.map((x) => `- 가정 프로그램: ${x.title} ${x.target}${x.unit} 하루 ${x.perDay}회${x.camera ? " (카메라 기록)" : ""}`),
    `- ${fmtDate(inWeek)} ${k ? "K-MBI " : ""}재평가`,
  ].join("\n");
  return { s, o, a, p };
}

/** 환자용: 목표 문장을 쉬운 말로 */
export function plainGoal(text) {
  return text
    .replace(/\s*\((I|Mod I|S|Min A|Mod A|Max A|Dep)\)/g, "")
    .replace(/(수정된 독립|최소 도움|중등도 도움|최대 도움|감독|독립)\s*(수준)?\s*으로 수행한다\./, (_, k) => `${PLAIN_ASSIST[k]} 할 수 있게 되는 것이 목표예요.`);
}

/** 환자 메시지 분류: 치료사가 먼저 봐야 할 메시지 */
export function triage(text) {
  if (/붓|저림|저려|감각|넘어|낙상|어지|숨|가슴/.test(text)) return { level: "danger", text: "안전 관련 증상이 포함되어 있어 치료사에게 먼저 알렸어요. 증상이 심하면 병원이나 119에 먼저 연락하세요." };
  if (/아프|통증|당겨|당기/.test(text)) return { level: "warn", text: "통증 관련 내용이라 치료사 확인 목록 맨 위에 올렸어요." };
  return null;
}

/** 치료사용 답장 초안 */
export function replyDraft(patient, { programs, sessions, messages }) {
  const last = messages.filter((m) => m.from === "patient").pop();
  const st = homeStats(programs, sessions);
  const first = patient.name.length > 2 ? patient.name.slice(1) : patient.name;
  if (last && /당기|아프|통증/.test(last.text)) {
    const ang = st.cam.at(-1)?.maxAngle;
    return `${first}님, 알려 주셔서 감사해요. 당분간 운동은 통증이 없는 범위${ang ? `(약 ${Math.max(60, ang - 15)}°)` : ""}까지만 해 주세요. 다음 치료 때 직접 확인할게요.`;
  }
  return st.adherence != null ? `${first}님, 이번 주 가정 운동 수행률이 ${st.adherence}%예요. 잘하고 계세요!` : `${first}님, 오늘 치료 수고 많으셨어요.`;
}
