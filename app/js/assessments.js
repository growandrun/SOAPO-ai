/* 세부 평가 도구
   - K-MBI·K-MMSE는 항목별 점수를 details에 담고, 합계를 value로 저장한다 (기존 추이 그래프가 그대로 동작).
   - COPM은 문제별 점수를 details에 담고, 수행·만족 평균을 두 행으로 저장한다.
   - 악력·MMT·ROM은 부위(와 측면)마다 한 행으로 저장해 부위별 추이를 볼 수 있게 한다. */

/** K-MBI (Shah 수정 바델 지수): 항목마다 5단계, 단계별 점수는 만점에 따라 다름 */
const KMBI_STEPS = { 5: [0, 1, 3, 4, 5], 10: [0, 2, 5, 8, 10], 15: [0, 3, 8, 12, 15] };
export const KMBI_LEVELS = ["1 수행 불가", "2 최대 도움", "3 중등도 도움", "4 최소 도움", "5 완전 독립"];
export const KMBI = [
  ["hygiene", "개인위생", 5], ["bathing", "목욕", 5], ["feeding", "식사", 10], ["toilet", "화장실 사용", 10],
  ["stairs", "계단 오르기", 10], ["dressing", "옷 입기", 10], ["bowel", "대변 조절", 10], ["bladder", "소변 조절", 10],
  ["ambulation", "보행 (휠체어 사용 시 5점 만점)", 15], ["transfer", "의자·침대 이동", 15],
];
export const kmbiSteps = (max) => KMBI_STEPS[max];

/** K-MMSE 항목과 만점 */
export const MMSE = [
  ["time", "시간 지남력", 5], ["place", "장소 지남력", 5], ["registration", "기억 등록", 3], ["attention", "주의 집중·계산", 5],
  ["recall", "기억 회상", 3], ["naming", "이름 대기", 2], ["repetition", "따라 말하기", 1], ["command", "3단계 명령", 3],
  ["reading", "읽기", 1], ["writing", "쓰기", 1], ["copying", "오각형 그리기", 1],
];

/** 도수근력검사: 근육군 목록과 등급 (숫자로 저장: 3+ → 3.3, 3- → 2.7) */
export const MMT_MUSCLES = [
  ["sh_flex", "어깨 굽힘"], ["sh_abd", "어깨 벌림"], ["sh_er", "어깨 바깥돌림"], ["el_flex", "팔꿉 굽힘"], ["el_ext", "팔꿉 폄"],
  ["supination", "아래팔 뒤침"], ["wr_ext", "손목 폄"], ["wr_flex", "손목 굽힘"], ["grip_flex", "손가락 굽힘 (쥐기)"], ["thumb_opp", "엄지 맞섬"],
];
export const MMT_GRADES = ["0", "1", "2-", "2", "2+", "3-", "3", "3+", "4-", "4", "4+", "5"];
export const gradeToNum = (g) => (g.endsWith("+") ? +g.slice(0, -1) + 0.3 : g.endsWith("-") ? +g.slice(0, -1) - 0.3 : +g);
export function numToGrade(v) {
  const n = Math.round(v * 10) / 10, base = Math.round(n);
  return n > base ? `${base}+` : n < base ? `${base}-` : String(base);
}

/** 관절가동범위: 동작과 참고 정상 범위(°) */
export const ROM_MOTIONS = [
  ["sh_flex", "어깨 굽힘", 180], ["sh_ext", "어깨 폄", 60], ["sh_abd", "어깨 벌림", 180], ["sh_ir", "어깨 안쪽돌림", 70], ["sh_er", "어깨 바깥돌림", 90],
  ["el_flex", "팔꿉 굽힘", 150], ["pronation", "아래팔 엎침", 80], ["supination", "아래팔 뒤침", 80], ["wr_flex", "손목 굽힘", 80], ["wr_ext", "손목 폄", 70],
];

export const SIDE_TAG = { R: "Rt", L: "Lt" };

/** 평가 입력 양식 종류 */
export const ASSESS_KINDS = [
  ["simple", "총점만 입력 (FIM, BBT, MFT, FMA-UE 등)"],
  ["kmbi", "K-MBI 항목별"],
  ["mmse", "K-MMSE 항목별"],
  ["copm", "COPM 문제별"],
  ["grip", "악력 (kg, 3회 평균)"],
  ["mmt", "도수근력검사 (MMT)"],
  ["rom", "관절가동범위 (ROM)"],
];

/** 부위별로 저장되는 평가인지 (요약 표에서 따로 묶어 보여 줌) */
export const isRegional = (tool) => /^(AROM|PROM|MMT|악력)\b/.test(tool) || /^악력\(/.test(tool);
/** 표시용 값: MMT는 등급으로, ROM은 °, 악력은 kg */
export function fmtScore(x) {
  if (/^MMT /.test(x.tool)) return numToGrade(x.value);
  if (/^(AROM|PROM) /.test(x.tool)) return `${x.value}°`;
  if (/^악력/.test(x.tool)) return `${x.value}kg`;
  return `${x.value}${x.max ? "/" + x.max : ""}`;
}
