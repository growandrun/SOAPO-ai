/* 서비스 워커: 앱을 닫아 두어도 새 메시지 알림을 받는다 (웹 푸시)
   알림에는 메시지 본문을 넣지 않는다 (잠금 화면에 건강 정보가 보이지 않게). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* 형식이 이상하면 기본 문구 */ }
  e.waitUntil(self.registration.showNotification(d.title || "SOAPO.ai", {
    body: d.body || "새 메시지가 왔어요",
    icon: "assets/icon-192.png",
    badge: "assets/icon-192.png",
    tag: d.tag || "soapo",
    renotify: true,
    data: { url: d.url || "./" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = tabs.find((t) => t.url.startsWith(self.registration.scope));
    if (open) { await open.focus(); open.postMessage({ type: "open-messages" }); return; }
    await self.clients.openWindow(url + (url.includes("?") ? "&" : "?") + "open=msg");
  })());
});
