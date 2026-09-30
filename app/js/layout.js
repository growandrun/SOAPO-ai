/* 치료사·환자 화면이 같이 쓰는 조각 */
import { cache } from "./data.js";
import { state } from "./state.js";
import { h } from "./util.js";

export const KIND = { session: "치료", evaluation: "초기 평가", reevaluation: "재평가", telehealth: "원격 상담" };
export const STATUS = { scheduled: "예정", done: "완료", cancelled: "취소", no_show: "결석" };
export const STATUS_PILL = { scheduled: "info", done: "ok", cancelled: "plain", no_show: "warn" };
const WD = ["일", "월", "화", "수", "목", "금", "토"];

export const fmtTime = (iso) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
export const fmtDay = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
/** 오늘 기준 며칠 남았는지: 0 → "오늘", 1 → "내일" */
export function dday(dateStr) {
  const a = new Date(dateStr + "T00:00:00"), b = new Date(new Date().toDateString());
  const n = Math.round((a - b) / 864e5);
  return n === 0 ? "오늘" : n === 1 ? "내일" : n > 0 ? `${n}일 뒤` : `${-n}일 지남`;
}

/** 만 나이 (한국 공식 나이) */
export function manAge(birth) {
  const b = new Date(birth + "T00:00:00"), t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
}
/** "1958.03.12 · 만 68세" */
export const fmtBirth = (birth) => birth ? `${birth.replaceAll("-", ".")} · 만 ${manAge(birth)}세` : "";

export function topbar() {
  const p = cache.profile;
  const who = p.role === "therapist" ? "치료사용" : p.relation === "guardian" ? "보호자용" : "환자용";
  return `<header class="topbar">
    <div class="brand"><img class="logo" src="assets/logo.png" alt="SOAPO.ai" width="900" height="173"><span class="sub">${who}</span></div>
    <div class="spacer"></div>
    <div class="userchip"><span>${h(p.name)}<span class="email"> · ${h(state.email)}</span></span><button class="btn sm" data-act="logout">로그아웃</button></div>
  </header>`;
}
