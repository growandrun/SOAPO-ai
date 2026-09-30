/* 배포용 사이트를 dist/ 에 만든다 (Vercel이 배포할 때 실행)
   dist/        실제 서비스 앱 (app/)
   dist/config.js 는 환경 변수로 만든다. 값이 없으면 앱이 "설정 필요" 화면을 보여 준다.

   읽는 환경 변수 (앞에 있는 것이 우선)
     주소: SOAPO_SUPABASE_URL, SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL
     공개 키: SOAPO_SUPABASE_KEY, SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
              SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY
   Vercel의 Supabase 연동(Marketplace)을 쓰면 SUPABASE_URL 등이 자동으로 들어온다.
   환경 변수가 없으면 supabase/production.json(운영 프로젝트의 공개 연결값)을 쓴다. */

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const out = new URL("dist/", root);
const env = process.env;
const pick = (...names) => names.map((n) => env[n]).find((v) => v && v.trim())?.trim() ?? "";

const prod = await readFile(new URL("supabase/production.json", root), "utf8").then(JSON.parse).catch(() => ({}));
const envUrl = pick("SOAPO_SUPABASE_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const envKey = pick("SOAPO_SUPABASE_KEY", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
const fromEnv = Boolean(envUrl && envKey);
const url = (fromEnv ? envUrl : prod.supabaseUrl ?? "").replace(/\/+$/, "");
const key = fromEnv ? envKey : prod.supabaseKey ?? "";

if (/service_role|sb_secret_/.test(key)) {
  console.error("공개하면 안 되는 Secret(service_role) 키가 들어왔습니다. Publishable(anon) 키를 넣어 주세요.");
  process.exit(1);
}
if (url && !/^https?:\/\//.test(url)) {
  console.error(`Supabase 주소 형식이 이상합니다: ${url}`);
  process.exit(1);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(new URL("app/", root), out, { recursive: true });

// 웹 푸시 공개 키: 운영 프로젝트에 연결할 때만 production.json 값을 쓴다
const vapid = pick("SOAPO_VAPID_PUBLIC_KEY") || (url && url === (prod.supabaseUrl ?? "").replace(/\/+$/, "") ? prod.vapidPublicKey ?? "" : "");
const config = url && key ? { supabaseUrl: url, supabaseKey: key, vapidPublicKey: vapid } : { supabaseUrl: "", supabaseKey: "" };
await writeFile(new URL("config.js", out), `// 빌드 시 자동 생성 (scripts/build.mjs)\nwindow.SOAPO_CONFIG = ${JSON.stringify(config, null, 2)};\n`);

console.log(url && key
  ? `✓ dist/ 생성, Supabase ${url} 에 연결 (${fromEnv ? "환경 변수" : "supabase/production.json"})`
  : "✓ dist/ 생성 (Supabase 환경 변수가 없어 설정 안내 화면으로 배포됩니다.)");
