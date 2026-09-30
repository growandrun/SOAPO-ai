/* 운영 Supabase 프로젝트의 로그인 설정을 자동으로 맞춘다 (Supabase Management API)
   - 사이트 주소·리디렉션 허용 목록
   - 한국어 로그인 메일 (링크 + 6자리 코드)
   - 메일 발송(SMTP): RESEND_API_KEY 또는 SMTP_* 가 있을 때만
   그리고 앱이 쓸 config.js를 만든다.

   필요한 환경 변수
     SUPABASE_ACCESS_TOKEN  supabase.com/dashboard/account/tokens 에서 만든 토큰
     SUPABASE_PROJECT_REF   프로젝트 ref (대시보드 주소의 20자리 영문)
     SITE_URL               배포 주소, 예: https://soapoai.vercel.app
   선택
     SUPABASE_PUBLISHABLE_KEY  비우면 API에서 자동으로 가져옴
     GMAIL_ADDRESS + GMAIL_APP_PASSWORD  무료 Gmail로 메일 발송 (추천, 도메인 불필요)
     RESEND_API_KEY + MAIL_FROM     Resend로 메일 발송 (MAIL_FROM 예: login@내도메인.kr)
     SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM  다른 SMTP 서비스
     CONFIG_OUT             config.js를 쓸 경로 (기본: 쓰지 않음)
     DRY_RUN=1              API를 부르지 않고 보낼 내용만 출력

   실행: node scripts/configure-supabase.mjs */

import { readFile, writeFile } from "node:fs/promises";

const env = process.env;
const API = "https://api.supabase.com/v1";
const dry = env.DRY_RUN === "1";

function need(name) {
  if (!env[name]) { console.error(`환경 변수 ${name}가 없습니다.`); process.exit(1); }
  return env[name];
}
const ref = need("SUPABASE_PROJECT_REF");
const site = need("SITE_URL").replace(/\/?$/, "/");
const token = dry ? env.SUPABASE_ACCESS_TOKEN : need("SUPABASE_ACCESS_TOKEN");

async function api(method, path, body) {
  if (dry) { console.log(`[DRY_RUN] ${method} ${path}`, body ? JSON.stringify({ ...body, smtp_pass: body.smtp_pass ? "***" : undefined }, null, 2).slice(0, 1500) : ""); return null; }
  const res = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

const template = await readFile(new URL("../supabase/templates/magic_link.html", import.meta.url), "utf8");
const subject = "SOAPO 재활노트 로그인";

const auth = {
  site_url: site,
  uri_allow_list: `${site}**`, // 내 사이트 경로로만 돌아오게 (vercel.app 전체를 허용하면 다른 사람 사이트로 로그인 토큰이 샐 수 있음)
  mailer_subjects_magic_link: subject,
  mailer_templates_magic_link_content: template,
  mailer_subjects_confirmation: subject,
  mailer_templates_confirmation_content: template,
  mailer_otp_length: 6,
  mailer_otp_exp: 3600,
};

let smtp = "없음 (Supabase 기본 발송: 팀원 주소로만, 시간당 소량)";
if (env.GMAIL_ADDRESS && env.GMAIL_APP_PASSWORD) {
  // 무료 Gmail: 하루 수신자 500명까지, 도메인 없이 누구에게나 발송. 2단계 인증 + 앱 비밀번호(16자리) 필요
  Object.assign(auth, { smtp_host: "smtp.gmail.com", smtp_port: "465", smtp_user: env.GMAIL_ADDRESS, smtp_pass: env.GMAIL_APP_PASSWORD.replace(/\s+/g, ""), smtp_admin_email: env.GMAIL_ADDRESS, smtp_sender_name: "SOAPO 재활노트", rate_limit_email_sent: 20 });
  smtp = `Gmail (${env.GMAIL_ADDRESS}, 하루 500명까지)`;
} else if (env.RESEND_API_KEY && env.MAIL_FROM) {
  Object.assign(auth, { smtp_host: "smtp.resend.com", smtp_port: "465", smtp_user: "resend", smtp_pass: env.RESEND_API_KEY, smtp_admin_email: env.MAIL_FROM, smtp_sender_name: "SOAPO 재활노트", rate_limit_email_sent: 60 });
  smtp = `Resend (${env.MAIL_FROM})`;
} else if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.MAIL_FROM) {
  Object.assign(auth, { smtp_host: env.SMTP_HOST, smtp_port: String(env.SMTP_PORT || 465), smtp_user: env.SMTP_USER, smtp_pass: env.SMTP_PASS, smtp_admin_email: env.MAIL_FROM, smtp_sender_name: "SOAPO 재활노트", rate_limit_email_sent: 60 });
  smtp = `${env.SMTP_HOST} (${env.MAIL_FROM})`;
}

await api("PATCH", `/projects/${ref}/config/auth`, auth);
console.log(`✓ 로그인 설정: 사이트 ${site}, 한국어 메일 템플릿, 메일 발송 ${smtp}`);

let key = env.SUPABASE_PUBLISHABLE_KEY;
if (!key) {
  const keys = (await api("GET", `/projects/${ref}/api-keys`)) ?? [];
  key = keys.find((k) => k.type === "publishable")?.api_key ?? keys.find((k) => k.name === "anon")?.api_key;
  if (!key && !dry) throw new Error("Publishable key를 찾지 못했습니다. SUPABASE_PUBLISHABLE_KEY 변수로 직접 넣어 주세요.");
}
if (key) console.log(`✓ Vercel 환경 변수에 넣을 값 (공개 키라 노출돼도 괜찮습니다)\n    SUPABASE_URL = https://${ref}.supabase.co\n    SUPABASE_PUBLISHABLE_KEY = ${key}`);
if (env.CONFIG_OUT) {
  await writeFile(env.CONFIG_OUT, `// 배포 시 자동 생성 (scripts/configure-supabase.mjs)\nwindow.SOAPO_CONFIG = ${JSON.stringify({ supabaseUrl: `https://${ref}.supabase.co`, supabaseKey: key ?? "" }, null, 2)};\n`);
  console.log(`✓ ${env.CONFIG_OUT} 작성 (https://${ref}.supabase.co)`);
}
