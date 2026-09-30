# SOAPO 재활노트

작업치료사의 SOAP 노트 작성과 환자의 가정 재활을 AI로 연결하는 서비스입니다.

- **치료사**: 환자 등록, 목표·평가 점수 관리, AI가 만든 SOAP 초안과 실시간 기록 점검, 서명(서명 후 수정 불가), 가정 운동 처방, 환자별 위험 신호 자동 검진, 메시지
- **환자**: 초대 코드로 가입, 휴대폰·노트북 카메라로 운동 각도·횟수 측정, 쉬운 말로 된 회복 기록, 치료사와 실시간 메시지
- **로그인**: 비밀번호 없이 이메일로 받은 링크 또는 6자리 코드

## 폴더

| 경로 | 내용 |
|---|---|
| `app/` | **실제 서비스 앱** (Supabase 로그인·DB 연결). 빌드 없이 정적 호스팅 가능 |
| `app/config.js` | Supabase 주소와 Publishable key |
| `supabase/migrations/` | DB 테이블, 권한(RLS), 가입 함수 |
| `supabase/templates/` | 한국어 로그인 메일 (링크 + 6자리 코드) |
| `supabase/tests/rls_test.sql` | 권한 테스트 24개 (다른 치료사·환자 데이터가 안 보이는지) |
| `tests/e2e.mjs` | 치료사·환자 두 브라우저로 전체 흐름을 확인하는 테스트 |
| `prototype/index.html` | 설치 없이 열어 보는 데모 (가짜 데이터) |
| `docs/ARCHITECTURE.md` | 전체 구조, AI 설계, 법규 체크리스트, 로드맵 |

## 1. 내 컴퓨터에서 실행하기

필요한 것: [Docker Desktop](https://www.docker.com/products/docker-desktop/), [Node.js](https://nodejs.org/) 20 이상, Python 3

```bash
npm install
npx supabase start        # 처음에는 이미지를 받느라 몇 분 걸립니다
npm run dev               # http://localhost:3000
```

- `app/config.js`에는 로컬 Supabase 기본값이 이미 들어 있습니다.
- 로컬에서는 메일이 실제로 나가지 않습니다. **http://127.0.0.1:54324** (Mailpit)에서 로그인 메일을 확인하세요.
- 사용 순서: 치료사로 가입 → 환자 등록 → 초대 코드 복사 → 다른 브라우저(또는 시크릿 창)에서 환자로 가입

테스트:

```bash
npm run test:db                            # 권한 테스트
npx supabase db reset && npm run test:e2e  # 전체 흐름 (앱과 Supabase가 켜져 있어야 함)
```

## 2. 실제 서비스로 올리기

### ① Supabase 프로젝트 만들기
1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만듭니다. 리전은 **Northeast Asia (Seoul)** 를 고르세요.
2. 터미널에서 DB 구조를 올립니다.
   ```bash
   npx supabase login
   npx supabase link --project-ref <프로젝트 ref>   # 대시보드 주소 supabase.com/dashboard/project/<ref>
   npx supabase db push
   ```

### ② 로그인 메일 설정 (대시보드 → Authentication)
1. **URL Configuration**: Site URL에 배포 주소(예: `https://soapo.netlify.app`)를 넣고, Redirect URLs에 `https://soapo.netlify.app/**`를 추가합니다.
2. **Email Templates**: "Magic Link"와 "Confirm signup" 두 곳에 `supabase/templates/magic_link.html` 내용을 붙여 넣습니다. 제목은 `SOAPO 재활노트 로그인`. 이 템플릿에 6자리 코드가 들어 있어야 다른 기기에서 메일을 연 환자도 로그인할 수 있습니다.
3. **SMTP (필수)**: Supabase 기본 메일 발송은 프로젝트 팀원 주소로만, 시간당 몇 통만 보냅니다. 환자에게 메일이 가려면 Project Settings → Authentication → SMTP Settings에서 메일 발송 서비스(Resend, Amazon SES, SendGrid 등)를 연결해야 합니다.

### ③ 앱 설정과 배포
1. 대시보드 → Project Settings → API Keys에서 **Project URL**과 **Publishable key**를 `app/config.js`에 넣습니다. (Secret key는 절대 넣지 마세요.)
2. `app/` 폴더를 정적 호스팅에 올립니다. Netlify(폴더 끌어다 놓기), Vercel, GitHub Pages 모두 됩니다. **카메라는 https 주소에서만 작동**합니다.

## 알아 둘 점

- 환자는 SOAP 원문을 볼 수 없고, 서명된 최신 평가(A)만 쉬운 말 화면에서 봅니다.
- 누구나 치료사로 가입할 수 있습니다. 가입한 치료사는 자기가 등록한 환자만 볼 수 있지만, 실제 병원에 도입하기 전에는 `profiles.verified`(면허 확인)를 관리자가 승인하는 절차를 추가해야 합니다.
- AI 기능(초안, 점검, 검진, 쉬운 말 요약, 메시지 분류)은 아직 규칙 기반입니다. `app/js/ai.js`의 함수들을 같은 입출력으로 LLM 서버 호출로 바꿀 수 있게 나눠 두었습니다.
- 카메라 영상은 기기 밖으로 나가지 않고, 횟수·최대 각도 숫자만 저장합니다. 카메라 각도는 각도계 측정과 차이가 있을 수 있어 추이 확인용입니다.
- 교육·연구 단계입니다. 실제 환자 정보를 넣기 전에 기관의 개인정보 보호 절차와 IRB 승인을 확인하세요.
