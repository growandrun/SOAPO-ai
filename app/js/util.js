export const DAY = 864e5;

/** 이 기기 시간대 기준 YYYY-MM-DD (한국 시간 새벽에 날짜가 하루 밀리지 않도록 UTC 대신 사용) */
export const localDate = (d = new Date()) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

/** "2026-09-30" 같은 날짜 문자열은 그대로, 시각은 기기 시간대로 → "9/30" */
export const fmtDate = (d) => {
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) { const [, m, dd] = d.split("-"); return `${+m}/${+dd}`; }
  const x = new Date(d); return `${x.getMonth() + 1}/${x.getDate()}`;
};

export const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function toast(msg, kind = "") {
  const t = document.createElement("div");
  t.className = `toast ${kind}`; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), kind === "error" ? 4500 : 2400);
}
