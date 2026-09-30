// 새 메시지 알림(웹 푸시) 보내기
// 앱이 메시지를 저장한 뒤 { message_id } 로 부른다. 보낸 사람 본인인지 확인하고, 상대방 기기로만 보낸다.
// 잠금 화면에 건강 정보가 보이지 않도록 알림 내용에는 메시지 본문을 넣지 않는다.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await admin.auth.getUser(token);
  const user = who?.user;
  if (!user) return json({ error: "로그인이 필요합니다" }, 401);

  const { message_id } = await req.json().catch(() => ({}));
  if (typeof message_id !== "string") return json({ error: "message_id가 필요합니다" }, 400);

  const { data: m } = await admin.from("messages").select("id, patient_id, sender_id, created_at").eq("id", message_id).maybeSingle();
  if (!m || m.sender_id !== user.id) return json({ error: "보낸 사람만 알림을 요청할 수 있습니다" }, 403);
  if (Date.now() - new Date(m.created_at).getTime() > 5 * 60_000) return json({ error: "오래된 메시지입니다" }, 409);

  const { data: p } = await admin.from("patients").select("therapist_id, user_id").eq("id", m.patient_id).single();
  const to = [p?.therapist_id, p?.user_id].filter((id): id is string => Boolean(id) && id !== user.id);
  if (!to.length) return json({ sent: 0 });

  const { data: subs } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", to);
  if (!subs?.length) return json({ sent: 0 });

  const { data: cfg } = await admin.from("push_config").select("vapid_public, vapid_private, subject").eq("id", 1).single();
  if (!cfg) return json({ error: "알림 설정이 없습니다" }, 500);
  webpush.setVapidDetails(cfg.subject, cfg.vapid_public, cfg.vapid_private);

  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    const toTherapist = s.user_id === p?.therapist_id;
    const payload = JSON.stringify({
      title: "SOAPO.ai",
      body: toTherapist ? "환자·보호자에게서 새 메시지가 왔어요" : "치료사에게서 새 메시지가 왔어요",
      url: "/",
      tag: `msg-${m.patient_id}`,
    });
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // 기기에서 알림을 끄거나 앱을 지운 경우: 구독을 지운다
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("push 실패", code, (e as Error).message);
    }
  }));
  return json({ sent });
});
