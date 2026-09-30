/* 작은 차트 (SVG). 색은 CSS 변수로 받아 밝은/어두운 테마 모두에서 읽히게 한다. */
import { fmtDate } from "./util.js";

/** 날짜별 값 추이. pts: [{date, value}], max: 세로축 최댓값 */
export function lineChart(pts, { max, unit = "점", label = "추이", invert = false } = {}) {
  if (!pts.length) return "";
  if (pts.length < 2) return `<p class="muted small">기록이 2회 이상 쌓이면 추이를 그립니다. (현재 ${pts[0].value}${unit})</p>`;
  const top = max ?? Math.max(...pts.map((x) => x.max ?? x.value), ...pts.map((x) => x.value));
  const W = 520, H = 190, L = 34, R = 16, T = 16, B = 26;
  const xs = (i) => L + (i * (W - L - R)) / (pts.length - 1);
  const ys = (v) => T + (1 - v / top) * (H - T - B);
  const ticks = [0, 0.5, 1].map((f) => Math.round(top * f));
  const grid = ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${ys(v) + 4}" text-anchor="end">${v}</text>`).join("");
  const line = pts.map((x, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${ys(x.value).toFixed(1)}`).join("");
  const area = `${line}L${xs(pts.length - 1)},${ys(0)}L${xs(0)},${ys(0)}Z`;
  const every = Math.ceil(pts.length / 7);
  const color = invert ? "var(--warn)" : "var(--accent)";
  const soft = invert ? "var(--warn-soft)" : "var(--accent-soft)";
  const dots = pts.map((x, i) => `<circle cx="${xs(i).toFixed(1)}" cy="${ys(x.value).toFixed(1)}" r="${i === pts.length - 1 ? 4.5 : 2.5}" fill="${color}"/>${i % every === 0 || i === pts.length - 1 ? `<text x="${xs(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${fmtDate(x.date)}</text>` : ""}`).join("");
  const last = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${grid}
    <path d="${area}" fill="${soft}" opacity=".75"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>${dots}
    <text x="${(xs(pts.length - 1) - 8).toFixed(1)}" y="${(ys(last.value) - 10).toFixed(1)}" text-anchor="end" style="fill:var(--ink);font-weight:500">${last.value}${unit}</text></svg>`;
}

/** 진행률 고리 */
export function ring(done, total, size = 88) {
  const pct = total ? Math.min(1, done / total) : 0;
  const r = size / 2 - 7, c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${done}/${total} 완료">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="7"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round"
      stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" style="fill:var(--ink);font:500 ${size / 5}px var(--font-mono)">${done}/${total}</text></svg>`;
}

/** 표 안에 넣는 작은 추이선 */
export function spark(values, max = 10) {
  if (values.length < 2) return values.length ? `<span class="mono small">${values[0]}</span>` : `<span class="muted small">–</span>`;
  const W = 64, H = 18;
  const pts = values.map((v, i) => `${((i * W) / (values.length - 1)).toFixed(1)},${(H - 2 - (v / max) * (H - 4)).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--warn)" stroke-width="1.8" stroke-linejoin="round"/></svg> <span class="mono small">${values[values.length - 1]}</span>`;
}
