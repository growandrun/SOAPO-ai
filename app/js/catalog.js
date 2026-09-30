/* 내원기록 체크리스트 목록
   - 코드(code)만 DB에 저장하고, 화면에 보일 이름은 여기서 붙인다. 이름을 바꿔도 이전 기록이 그대로 읽힌다.
   - 코드는 지우거나 바꾸지 말 것. 새 항목은 끝에 추가한다.
   - fields: 이 치료를 체크했을 때 적을 세부 칸 (측면·무게·세트·횟수·시간·단계·도움 수준) */

/** 세부 칸 정의 */
export const FIELDS = {
  side:    { label: "측면", type: "select", options: [["R", "오른쪽"], ["L", "왼쪽"], ["B", "양쪽"]] },
  weight:  { label: "무게(kg)", type: "number", step: "0.5", max: 200 },
  sets:    { label: "세트", type: "number", step: "1", max: 50 },
  reps:    { label: "횟수", type: "number", step: "1", max: 1000 },
  minutes: { label: "시간(분)", type: "number", step: "1", max: 240 },
  level:   { label: "강도·단계", type: "select" },   // 항목마다 선택지가 다름 (levels)
  assist:  { label: "도움 수준", type: "select", options: [["I", "독립 (I)"], ["ModI", "수정된 독립 (Mod I)"], ["S", "감독 (S)"], ["MinA", "최소 도움 (Min A)"], ["ModA", "중등도 도움 (Mod A)"], ["MaxA", "최대 도움 (Max A)"], ["Dep", "의존 (Dep)"]] },
  response:{ label: "반응", type: "select", options: [["good", "잘 수행"], ["fatigue", "피로"], ["pain", "통증 호소"], ["difficult", "수행 어려움"], ["refused", "거부·중단"]] },
};
const INTENSITY = [["1", "1 매우 가벼움"], ["2", "2 가벼움"], ["3", "3 보통"], ["4", "4 힘듦"], ["5", "5 매우 힘듦"]];

/** 치료 항목 30개 (그룹별) */
export const GROUPS = [
  ["upper", "상지 기능·근력"],
  ["hand", "손 기능·협응"],
  ["adl", "일상생활 (ADL·IADL)"],
  ["cog", "인지·지각"],
  ["sensory", "감각·운동 조절·기타"],
  ["device", "보조기·교육"],
];

export const TREATMENTS = [
  { code: "rom",        group: "upper",  label: "관절가동범위 운동 (ROM)", fields: ["side", "level", "sets", "reps"], levels: [["A", "능동 (AROM)"], ["AA", "능동보조 (AAROM)"], ["P", "수동 (PROM)"]], levelLabel: "방법" },
  { code: "stretch",    group: "upper",  label: "스트레칭", fields: ["side", "minutes"] },
  { code: "dumbbell",   group: "upper",  label: "덤벨·웨이트 근력 운동", fields: ["side", "weight", "sets", "reps"] },
  { code: "theraband",  group: "upper",  label: "탄력밴드 운동", fields: ["side", "level", "sets", "reps"], levels: [["yellow", "노랑"], ["red", "빨강"], ["green", "초록"], ["blue", "파랑"], ["black", "검정"], ["silver", "은색"]], levelLabel: "밴드 색" },
  { code: "grip",       group: "upper",  label: "악력 강화 (그립 기구)", fields: ["side", "weight", "sets", "reps"] },
  { code: "arm_ergo",   group: "upper",  label: "상지 에르고미터·사이클", fields: ["minutes", "level"] },
  { code: "robot",      group: "upper",  label: "상지 로봇·기구 훈련", fields: ["side", "minutes", "level"] },
  { code: "fes",        group: "upper",  label: "기능적 전기자극 (FES)", fields: ["side", "minutes", "level"] },
  { code: "putty",      group: "hand",   label: "치료용 퍼티", fields: ["side", "level", "minutes"], levels: [["xsoft", "아주 부드러움"], ["soft", "부드러움"], ["medium", "중간"], ["firm", "단단함"], ["xfirm", "아주 단단함"]], levelLabel: "퍼티 강도" },
  { code: "pegboard",   group: "hand",   label: "페그보드", fields: ["side", "reps", "minutes"] },
  { code: "cone",       group: "hand",   label: "콘 쌓기", fields: ["side", "reps"] },
  { code: "fine_motor", group: "hand",   label: "소근육 조작 (집기·단추·동전)", fields: ["side", "minutes", "assist"] },
  { code: "bimanual",   group: "hand",   label: "양손 협응 훈련", fields: ["minutes", "assist"] },
  { code: "cimt",       group: "hand",   label: "건측 억제 유도 운동 (CIMT)", fields: ["side", "minutes"] },
  { code: "mirror",     group: "hand",   label: "거울 치료", fields: ["side", "minutes"] },
  { code: "eating",     group: "adl",    label: "식사 훈련", fields: ["assist", "minutes"] },
  { code: "grooming",   group: "adl",    label: "개인위생 (세수·양치·빗질)", fields: ["assist", "minutes"] },
  { code: "dressing",   group: "adl",    label: "옷 입고 벗기", fields: ["assist", "minutes"] },
  { code: "toileting",  group: "adl",    label: "화장실 이용", fields: ["assist", "minutes"] },
  { code: "bathing",    group: "adl",    label: "목욕·샤워", fields: ["assist", "minutes"] },
  { code: "transfer",   group: "adl",    label: "옮겨 앉기·이동", fields: ["assist", "reps"] },
  { code: "iadl",       group: "adl",    label: "도구적 일상활동 (요리·청소·돈 관리)", fields: ["assist", "minutes"] },
  { code: "cognition",  group: "cog",    label: "인지 훈련 (주의·기억·실행기능)", fields: ["minutes", "level"] },
  { code: "computer",   group: "cog",    label: "전산화 인지재활", fields: ["minutes", "level"] },
  { code: "perception", group: "cog",    label: "시지각 훈련", fields: ["minutes", "level"] },
  { code: "neglect",    group: "cog",    label: "편측 무시 훈련", fields: ["minutes", "assist"] },
  { code: "balance",    group: "sensory", label: "앉기·서기 균형 훈련", fields: ["minutes", "assist"] },
  { code: "sensory",    group: "sensory", label: "감각 재교육·감각 통합", fields: ["side", "minutes"] },
  { code: "swallow",    group: "sensory", label: "연하 (삼킴) 훈련", fields: ["minutes", "level"] },
  { code: "splint",     group: "device", label: "보조기 제작·착용 훈련", fields: ["side", "minutes"] },
  { code: "education",  group: "device", label: "보호자·가정 운동 교육", fields: ["minutes"] },
];
export const treatment = (code) => TREATMENTS.find((t) => t.code === code);
/** 항목의 강도·단계 선택지 (따로 정한 게 없으면 1~5 체감 강도) */
export const levelsOf = (t) => t.levels ?? INTENSITY;
export const levelLabelOf = (t) => t.levelLabel ?? "강도 (1–5)";

/** 내원 관찰·특이사항 체크리스트 */
export const OBSERVATIONS = [
  ["guardian", "보호자 동반"],
  ["wheelchair", "휠체어로 내원"],
  ["walker", "보행 보조기 사용"],
  ["pain", "통증 호소"],
  ["fatigue", "피로 호소"],
  ["dizzy", "어지럼·혈압 변동"],
  ["fall_risk", "낙상 위험 관찰"],
  ["good_coop", "협조 양호"],
  ["low_attention", "집중 저하"],
  ["low_motivation", "동기 저하"],
  ["home_ex_done", "가정 운동 수행 확인"],
  ["home_ex_missed", "가정 운동 미수행"],
  ["splint_ok", "보조기 착용 확인"],
  ["skin", "피부 발적·부종 관찰"],
  ["early_stop", "치료 조기 종료"],
];
export const observation = (code) => OBSERVATIONS.find(([k]) => k === code)?.[1] ?? code;

const optLabel = (opts, v) => opts.find(([k]) => k === v)?.[1] ?? v;

/** 도움 수준 코드 → SOAP 표기 (MinA → Min A) */
export const assistCode = (v) => v.replace(/^(Mod|Min|Max)(A|I)$/, "$1 $2");
/** 환자에게 보여 줄 쉬운 이름 (괄호 속 약어 제거) */
export const plainLabel = (code) => (treatment(code)?.label ?? code).replace(/\s*\([A-Z]+\)/, "");

/** 치료 항목 한 줄 요약
   mode "full": 치료사 화면 (도움 수준 한글, 반응, 방법 메모)
        "soap": SOAP O 칸 (도움 수준은 Min A 같은 약어)
        "plain": 환자 화면 (쉬운 이름, 측면·양·시간만) */
export function itemSummary(it, mode = "full") {
  const t = treatment(it.code);
  if (!t) return it.code;
  const parts = [];
  if (it.side) parts.push(optLabel(FIELDS.side.options, it.side));
  if (it.level && mode !== "plain") parts.push(`${levelLabelOf(t).replace(/\s*\(.*\)/, "")} ${optLabel(levelsOf(t), it.level).replace(/^\d\s/, "")}`);
  const dose = [it.weight != null ? `${it.weight}kg` : null, it.sets != null ? `${it.sets}세트` : null, it.reps != null ? `${it.reps}회` : null].filter(Boolean).join(" × ");
  if (dose) parts.push(dose);
  if (it.minutes != null) parts.push(`${it.minutes}분`);
  if (it.assist && mode !== "plain") parts.push(mode === "soap" ? assistCode(it.assist) : optLabel(FIELDS.assist.options, it.assist));
  if (it.response && mode !== "plain") parts.push(optLabel(FIELDS.response.options, it.response));
  const name = mode === "plain" ? plainLabel(it.code) : t.label;
  return `${name}${parts.length ? ` — ${parts.join(", ")}` : ""}${it.how && mode !== "plain" ? ` · ${it.how}` : ""}`;
}
