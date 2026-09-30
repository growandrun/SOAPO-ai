/* 환자·보호자와 연락: 치료사 응답 시간, 기기 알림(웹 푸시), 초대 코드 공유 */
import * as D from "./data.js";

/* ---------- 응답 시간 ---------- */
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
export const DEFAULT_AUTO = "지금은 치료사 응답 시간이 아니에요. 남기신 메시지는 응답 시간에 확인할게요. 통증이 갑자기 심해지거나 응급 상황이면 119에 연락하세요.";
export const officeOf = (prefs) => ({ on: false, days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00", message: "", ...(prefs?.office ?? {}) });

/** "월–금 09:00–18:00" / "월·수·금 09:00–13:00" */
export function officeText(o) {
  const d = [...o.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));   // 월요일부터
  const idx = d.map((x) => (x + 6) % 7);
  const run = idx.length > 2 && idx.every((x, i) => i === 0 || x === idx[i - 1] + 1);
  const days = !d.length ? "요일 미정" : run ? `${DAYS[d[0]]}–${DAYS[d[d.length - 1]]}` : d.map((x) => DAYS[x]).join("·");
  return `${days} ${o.start}–${o.end}`;
}
/** 지금이 응답 시간인지 (설정을 안 켰으면 항상 응답 시간으로 본다) */
export function isOpen(o, now = new Date()) {
  if (!o.on) return true;
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return o.days.includes(now.getDay()) && hm >= o.start && hm < o.end;
}
export const autoReplyText = (o) => `자동 안내: ${o.message?.trim() || DEFAULT_AUTO} (응답 시간: ${officeText(o)})`;

/* ---------- 기기 알림 (웹 푸시) ---------- */
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const pushSupported = () => Boolean(D.vapidPublicKey) && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** 알림 상태: unsupported | ios-install(홈 화면에 추가 필요) | denied | on | off */
export async function pushState() {
  if (!D.vapidPublicKey) return "unsupported";
  if (isIOS() && !standalone()) return "ios-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

const b64ToBytes = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

/** 알림 켜기: 권한 요청 → 서비스 워커 등록 → 구독 → 서버에 저장 */
export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error(perm === "denied" ? "알림이 차단되어 있습니다. 브라우저(또는 휴대폰) 설정에서 이 사이트의 알림을 허용해 주세요." : "알림 허용을 선택하지 않았습니다.");
  const reg = await navigator.serviceWorker.register("sw.js");
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(D.vapidPublicKey) }));
  await D.savePushSubscription(sub);
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await D.sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
}

/** 알림 카드 (환자 홈, 치료사 설정에서 사용). 상태는 비동기라 빈 칸을 먼저 그리고 채운다 */
export const pushCardHtml = () => `<div id="push-card" class="push-card" hidden></div>`;
export async function fillPushCard() {
  const el = document.getElementById("push-card"); if (!el) return;
  const st = await pushState().catch(() => "unsupported");
  if (st === "unsupported") { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = {
    "ios-install": `<b>새 메시지 알림 받기</b><span class="small">아이폰은 Safari 아래쪽 <b>공유</b> 버튼 → <b>홈 화면에 추가</b>를 누른 뒤, 홈 화면의 SOAPO 아이콘으로 열면 알림을 켤 수 있어요.</span>`,
    denied: `<b>알림이 꺼져 있어요</b><span class="small">휴대폰(또는 브라우저) 설정에서 이 사이트의 알림을 허용하면 새 메시지를 바로 알려 드려요.</span>`,
    off: `<b>새 메시지 알림 받기</b><span class="small">앱을 닫아 두어도 새 메시지가 오면 알려 드려요. 알림에는 메시지 내용이 보이지 않아요.</span><button class="btn primary sm" data-act="push-on">알림 켜기</button>`,
    on: `<b>새 메시지 알림이 켜져 있어요</b><span class="small">이 기기로 알려 드려요.</span><button class="btn sm ghost" data-act="push-off">알림 끄기</button>`,
  }[st];
}

/** 앱을 열어 둔 채 다른 탭을 보고 있을 때: 브라우저 알림 (이미 허용한 경우만) */
export function tabNotify(text) {
  if (!document.hidden || !("Notification" in window) || Notification.permission !== "granted") return;
  try { new Notification("SOAPO.ai", { body: text, icon: "assets/icon-192.png", tag: "soapo-tab" }); } catch { /* 일부 모바일 브라우저는 지원 안 함 */ }
}

/* ---------- 초대 코드 공유 (카카오톡 등) ---------- */
export async function shareInvite(name, code) {
  const text = `[SOAPO.ai] ${name}님의 재활 기록 앱 초대 코드: ${code}\n아래 주소에서 '환자·보호자로 시작하기' → 가입 후 코드를 입력해 주세요.`;
  const url = `${location.origin}${location.pathname}?start=patient`;
  if (navigator.share) { await navigator.share({ title: "SOAPO.ai 초대", text, url }); return "shared"; }
  await navigator.clipboard.writeText(`${text}\n${url}`);
  return "copied";
}
