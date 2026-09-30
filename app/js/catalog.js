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

/** 치료 분야: 치료사가 설정에서 고른 분야의 치료만 체크리스트에 보인다 (기본: 성인 신경계) */
export const PACKS = [
  ["neuro", "성인 신경계·뇌졸중", "상지·손 기능, ADL, 인지, 감각, 보조기"],
  ["peds", "소아 발달", "감각통합, 놀이, 소근육·필기, 섭식, 부모 교육"],
  ["geri", "치매·노인", "회상·현실 지향, 인지 자극, 낙상 예방, 보호자 상담"],
  ["mental", "정신건강", "사회기술, 스트레스 관리, 일상 구조화, 직업 재활"],
  ["handtx", "손 재활·근골격계", "부종·흉터 관리, 건 활주, 관절 가동술, 보조기"],
  ["community", "지역사회·가정", "가정환경 수정, 보조기기, 외출·운전, 서비스 연계"],
];
export const DEFAULT_PACKS = ["neuro"];

/** 치료 그룹: [코드, 이름, 분야] */
export const GROUPS = [
  ["upper", "상지 기능·근력", "neuro"],
  ["hand", "손 기능·협응", "neuro"],
  ["adl", "일상생활 (ADL·IADL)", "neuro"],
  ["cog", "인지·지각", "neuro"],
  ["sensory", "감각·운동 조절·기타", "neuro"],
  ["device", "보조기·교육", "neuro"],
  ["peds", "소아 발달", "peds"],
  ["geri", "치매·노인", "geri"],
  ["mental", "정신건강", "mental"],
  ["handtx", "손 재활·근골격계", "handtx"],
  ["community", "지역사회·가정", "community"],
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
  // 소아 발달
  { code: "si_therapy",     group: "peds", label: "감각통합 치료 (그네·트램펄린 등)", fields: ["minutes"] },
  { code: "play",           group: "peds", label: "놀이 기반 훈련", fields: ["minutes", "assist"] },
  { code: "peds_fine",      group: "peds", label: "소근육·눈-손 협응 발달", fields: ["minutes", "assist"] },
  { code: "handwriting",    group: "peds", label: "필기·가위 사용 훈련", fields: ["minutes", "assist"] },
  { code: "peds_selfcare",  group: "peds", label: "자조 기술 (식사·옷 입기·배변)", fields: ["minutes", "assist"] },
  { code: "oral_motor",     group: "peds", label: "구강 운동·섭식 훈련", fields: ["minutes", "level"] },
  { code: "social_play",    group: "peds", label: "사회성·또래 상호작용", fields: ["minutes"] },
  { code: "self_regulation",group: "peds", label: "주의·행동 조절 훈련", fields: ["minutes", "level"] },
  { code: "positioning",    group: "peds", label: "자세·앉기 조절", fields: ["minutes", "assist"] },
  { code: "parent_edu",     group: "peds", label: "부모 교육·가정 프로그램 지도", fields: ["minutes"] },
  // 치매·노인
  { code: "reminiscence",   group: "geri", label: "회상 치료", fields: ["minutes"] },
  { code: "reality_orient", group: "geri", label: "현실 지향 훈련", fields: ["minutes", "level"] },
  { code: "cog_stim",       group: "geri", label: "인지 자극 활동 (퍼즐·계산·분류)", fields: ["minutes", "level"] },
  { code: "routine",        group: "geri", label: "일상 루틴·단서 활용 훈련", fields: ["minutes", "assist"] },
  { code: "leisure_act",    group: "geri", label: "원예·음악·미술 활동", fields: ["minutes"] },
  { code: "fall_prev",      group: "geri", label: "낙상 예방 훈련·교육", fields: ["minutes", "assist"] },
  { code: "behavior_mgmt",  group: "geri", label: "배회·행동 증상 관리", fields: ["minutes"] },
  { code: "caregiver",      group: "geri", label: "보호자 상담·부담 경감 교육", fields: ["minutes"] },
  // 정신건강
  { code: "social_skills",  group: "mental", label: "사회기술 훈련", fields: ["minutes", "level"] },
  { code: "stress_mgmt",    group: "mental", label: "스트레스 관리·이완 훈련", fields: ["minutes"] },
  { code: "daily_struct",   group: "mental", label: "일상 구조화·시간 관리", fields: ["minutes"] },
  { code: "self_mgmt",      group: "mental", label: "자기관리 (약 복용·위생·수면)", fields: ["minutes", "assist"] },
  { code: "vocational",     group: "mental", label: "직업 재활·작업 수행 훈련", fields: ["minutes", "level"] },
  { code: "community_life", group: "mental", label: "지역사회 적응 훈련", fields: ["minutes", "assist"] },
  { code: "group_activity", group: "mental", label: "집단 활동·치료 집단", fields: ["minutes"] },
  { code: "leisure_explore",group: "mental", label: "여가 탐색·활동 계획", fields: ["minutes"] },
  // 손 재활·근골격계
  { code: "edema",          group: "handtx", label: "부종 관리 (거상·압박·역행 마사지)", fields: ["side", "minutes"] },
  { code: "scar",           group: "handtx", label: "흉터 관리 (마사지·실리콘)", fields: ["side", "minutes"] },
  { code: "tendon_glide",   group: "handtx", label: "건 활주 운동", fields: ["side", "sets", "reps"] },
  { code: "joint_mob",      group: "handtx", label: "관절 가동술", fields: ["side", "minutes", "level"], levels: [["1", "Grade I"], ["2", "Grade II"], ["3", "Grade III"], ["4", "Grade IV"]], levelLabel: "등급" },
  { code: "thermal",        group: "handtx", label: "온열·한랭 치료", fields: ["side", "minutes"] },
  { code: "paraffin",       group: "handtx", label: "파라핀 치료", fields: ["side", "minutes"] },
  { code: "desensitize",    group: "handtx", label: "둔감화 훈련", fields: ["side", "minutes"] },
  { code: "dyn_splint",     group: "handtx", label: "정적·동적 보조기 제작·조정", fields: ["side", "minutes"] },
  { code: "work_harden",    group: "handtx", label: "작업 강화·복귀 훈련", fields: ["minutes", "weight", "level"] },
  // 지역사회·가정
  { code: "home_mod",       group: "community", label: "가정환경 평가·수정 제안", fields: ["minutes"] },
  { code: "assistive",      group: "community", label: "보조기기 추천·사용 훈련", fields: ["minutes", "assist"] },
  { code: "outing",         group: "community", label: "외출·대중교통 이용 훈련", fields: ["minutes", "assist"] },
  { code: "driving",        group: "community", label: "운전 재활 평가·훈련", fields: ["minutes"] },
  { code: "shopping",       group: "community", label: "장보기·금전 관리 훈련", fields: ["minutes", "assist"] },
  { code: "service_link",   group: "community", label: "복지·돌봄 서비스 연계", fields: ["minutes"] },
];
/** 분야에 속한 그룹 코드 */
export const groupsOf = (packs) => GROUPS.filter(([, , pk]) => packs.includes(pk));
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

/** 도움 수준 표기: 저장은 같은 코드(I … Dep), 보이는 방식만 치료사 설정에 따름
    ot: OT 약어 (Min A 등) / fim: FIM 7점 척도 */
export const ASSIST_SCALES = [["ot", "OT 약어 (I · Mod I · S · Min A · Mod A · Max A · Dep)"], ["fim", "FIM 점수 (7 완전 독립 ~ 1 완전 도움)"]];
const FIM = { I: [7, "완전 독립"], ModI: [6, "수정된 독립"], S: [5, "감독·준비"], MinA: [4, "최소 도움, 75% 이상 스스로"], ModA: [3, "중등도 도움, 50–74%"], MaxA: [2, "최대 도움, 25–49%"], Dep: [1, "완전 도움, 25% 미만"] };
let scale = "ot";
export function setAssistScale(v) { scale = v === "fim" ? "fim" : "ot"; }
export const assistScale = () => scale;
export const assistOptions = () => scale === "fim" ? FIELDS.assist.options.map(([k]) => [k, `FIM ${FIM[k][0]} ${FIM[k][1]}`]) : FIELDS.assist.options;
/** 도움 수준 코드 → SOAP 표기 (MinA → Min A, FIM이면 "FIM 4 (최소 도움…)") */
export const assistCode = (v) => scale === "fim" && FIM[v] ? `FIM ${FIM[v][0]} (${FIM[v][1]})` : v.replace(/^(Mod|Min|Max)(A|I)$/, "$1 $2");
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
  if (it.assist && mode !== "plain") parts.push(mode === "soap" ? assistCode(it.assist) : optLabel(assistOptions(), it.assist));
  if (it.response && mode !== "plain") parts.push(optLabel(FIELDS.response.options, it.response));
  const name = mode === "plain" ? plainLabel(it.code) : t.label;
  return `${name}${parts.length ? ` — ${parts.join(", ")}` : ""}${it.how && mode !== "plain" ? ` · ${it.how}` : ""}`;
}

/** 안전 정보: 주의사항 체크리스트 (환자 화면에서 선택 입력, 등록 때는 받지 않음) */
export const PRECAUTIONS = [
  ["fall", "낙상 위험"],
  ["bp_high", "고혈압 주의"],
  ["orthostatic", "기립성 저혈압"],
  ["hypoglycemia", "저혈당 (당뇨)"],
  ["cardiac", "심장 질환 (운동 강도 주의)"],
  ["seizure", "경련 이력"],
  ["dysphagia", "연하곤란·흡인 위험"],
  ["osteoporosis", "골다공증·골절 위험"],
  ["hip", "고관절 탈구 주의 (인공관절)"],
  ["shoulder_sub", "어깨 아탈구"],
  ["sensory_loss", "감각 저하 (화상·압박 주의)"],
  ["skin", "욕창·피부 손상 위험"],
  ["no_bp_arm", "혈압 측정 금지 팔 (투석·림프부종)"],
  ["anticoag", "항응고제 복용 (출혈·멍 주의)"],
  ["infection", "감염 주의·격리"],
  ["cognition", "인지 저하 (보호자 동반 필요)"],
  ["aphasia", "의사소통 장애 (실어증 등)"],
  ["vision", "시력·시야 결손"],
];
export const WEIGHT_BEARING = [["NWB", "체중부하 금지 (NWB)"], ["TTWB", "발끝 접지만 (TTWB)"], ["PWB", "부분 체중부하 (PWB)"], ["WBAT", "견딜 수 있는 만큼 (WBAT)"], ["FWB", "완전 체중부하 (FWB)"]];
/** 식이 단계 (IDDSI) */
export const DIET_FOOD = [["7", "7 일반식"], ["6", "6 부드럽고 한입 크기"], ["5", "5 다지고 촉촉한"], ["4", "4 퓌레"], ["3", "3 액상"], ["NPO", "금식 (NPO)"]];
export const DIET_DRINK = [["0", "0 묽은 음료"], ["1", "1 아주 약간 걸쭉한"], ["2", "2 약간 걸쭉한"], ["3", "3 중간 정도 걸쭉한"], ["4", "4 아주 걸쭉한"]];
export const SIDES = [["right", "오른쪽"], ["left", "왼쪽"], ["both", "양쪽"]];
export const DISCHARGE_REASONS = [["goal_met", "목표 달성"], ["discharged", "퇴원"], ["transfer", "전원·다른 기관 이동"], ["stopped", "본인·보호자 사정으로 중단"], ["other", "기타"]];
export const labelOf = (list, v) => list.find(([k]) => k === v)?.[1] ?? v;

/** 환자의 안전 정보를 짧은 표시 목록으로 (위험도 높은 것부터) */
export function safetyTags(p) {
  const tags = (p.precautions ?? []).map((k) => labelOf(PRECAUTIONS, k));
  if (p.weightBearing && p.weightBearing !== "FWB") tags.push(labelOf(WEIGHT_BEARING, p.weightBearing));
  if (p.dietFood && p.dietFood !== "7") tags.push(`식이 ${labelOf(DIET_FOOD, p.dietFood)}`);
  if (p.dietDrink && p.dietDrink !== "0") tags.push(`음료 IDDSI ${p.dietDrink}`);
  return tags;
}
