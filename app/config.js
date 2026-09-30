/* Supabase 연결 설정
   - 로컬 개발: `npx supabase start` 후 출력되는 API URL과 Publishable key (아래 기본값이 로컬 기본값)
   - 실제 서비스: Supabase 대시보드 → Project Settings → API Keys 의 Project URL과 Publishable key
   Publishable(anon) key는 브라우저에 공개되어도 되는 키입니다. 데이터 보호는 DB의 RLS 정책이 합니다.
   Secret(service_role) key는 절대 여기에 넣지 마세요. */
window.SOAPO_CONFIG = {
  supabaseUrl: "http://127.0.0.1:54321",
  supabaseKey: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
};
