# SOAPO 재활노트

작업치료사의 SOAP 노트 작성과 환자의 가정 재활을 AI로 연결하는 서비스입니다.

- **치료사**: 환자 등록, 목표·평가 점수 관리, AI가 만든 SOAP 초안과 실시간 기록 점검, 서명(서명 후 수정 불가), 가정 운동 처방, 환자별 위험 신호 자동 검진, 메시지
- **환자**: 초대 코드로 가입, 휴대폰·노트북 카메라로 운동 각도·횟수 측정, 쉬운 말로 된 회복 기록, 치료사와 실시간 메시지
- **로그인**: 비밀번호 없이 이메일로 받은 링크 또는 6자리 코드

## 폴더

| 경로 | 내용 |
|---|---|
| `app/` | **실제 서비스 앱** (Supabase 로그인·DB 연결). 빌드 없이 정적 호스팅 가능 |
| `app/config.js` | 로컬 개발용 Supabase 주소와 공개 키 (배포 때는 빌드가 새로 만듦) |
| `scripts/configure-supabase.mjs` | 운영 Supabase 로그인 설정을 자동으로 맞추는 스크립트 |
| `vercel.json`, `scripts/build.mjs` | Vercel 배포 설정과 빌드 (환경 변수로 `config.js` 생성) |
| `.github/workflows/` | 자동 테스트(`ci.yml`)와 Supabase 설정 적용(`supabase.yml`) |
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

## 2. 실제 서비스로 올리기 (Vercel + Supabase)

| 단계 | 상태 |
|---|---|
| Supabase 프로젝트 `soapo supabase` (서울) | ✅ 만들어짐 |
| DB 테이블·권한·실시간 메시지 (`supabase/migrations/`) | ✅ 적용됨, Supabase 보안 점검 반영 |
| 앱이 쓸 연결값 (`supabase/production.json`) | ✅ 저장소에 들어 있음 (공개 키라 괜찮음) |
| ① Vercel에 저장소 연결 | ✅ https://soapoai.vercel.app (push하면 자동 배포) |
| ② 로그인 설정 (사이트 주소, 한국어 메일) | 할 일 |
| ③ 환자에게 메일 보내기 (Resend) | 할 일 |

### ① Vercel에 저장소 연결 (완료)
1. [vercel.com](https://vercel.com)에 GitHub 계정으로 로그인합니다.
2. **Add New → Project → `growandrun/SOAPO-ai` Import**를 누릅니다.
3. 설정은 건드리지 말고 **Deploy**를 누릅니다.

빌드가 `supabase/production.json`을 읽어 Supabase에 자동으로 연결하므로 환경 변수를 넣지 않아도 됩니다. (Vercel 환경 변수 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`가 있으면 그 값이 우선합니다.)
배포가 끝나면 나오는 주소(예: `https://soapoai.vercel.app`)를 ②에서 씁니다.

### ② 로그인 설정 (3분) — 둘 중 하나

**방법 A: Supabase 대시보드에서 직접**
1. [Authentication → URL Configuration](https://supabase.com/dashboard/project/ftgzlusvshpyadudqwzo/auth/url-configuration)
   - **Site URL**: Vercel 주소 (예: `https://soapoai.vercel.app`)
   - **Redirect URLs**: `https://soapoai.vercel.app/**` 추가
2. [Authentication → Emails](https://supabase.com/dashboard/project/ftgzlusvshpyadudqwzo/auth/templates)
   - **Magic link**와 **Confirm signup** 두 곳 모두 제목을 `SOAPO 재활노트 로그인`으로 바꿉니다.
   - 본문에는 `supabase/templates/magic_link.html` 내용을 붙여 넣습니다.
   - 이 템플릿에 6자리 코드가 들어 있어야 다른 기기에서 메일을 연 환자도 로그인할 수 있습니다.

**방법 B: 자동 (GitHub Actions)**
1. [Access Token](https://supabase.com/dashboard/account/tokens)을 만듭니다.
2. GitHub 저장소 **Settings → Secrets and variables → Actions**에 아래 값을 넣습니다.
   - Secret `SUPABASE_ACCESS_TOKEN`: 1번에서 만든 토큰
   - Variable `SITE_URL`: Vercel 주소
3. **Actions → Supabase 설정 → Run workflow**를 누르면 방법 A의 내용을 자동으로 적용합니다.

Secret `SUPABASE_DB_PASSWORD`도 넣어 두면, 이후 `supabase/migrations/`에 새 파일이 push될 때 DB에도 자동으로 적용됩니다.

> Vercel 미리보기 주소(브랜치별 배포)에서는 메일 링크가 운영 주소로 돌아갑니다. 미리보기에서는 메일 속 **6자리 코드**로 로그인하세요.

### ③ 환자에게 메일이 가게 하기
Supabase 기본 메일은 **프로젝트 팀원 주소로만, 시간당 몇 통**만 보냅니다. ②까지 하면 본인 메일로는 로그인할 수 있지만, 환자에게 보내려면 메일 발송 서비스가 필요합니다.

1. [Resend](https://resend.com)에 가입하고 **본인 도메인을 인증**합니다. 도메인이 없으면 Resend는 본인 메일로만 보낼 수 있습니다.
2. API Key를 만듭니다.
3. 두 방법 중 하나로 연결합니다.
   - **방법 A**: Supabase [SMTP 설정](https://supabase.com/dashboard/project/ftgzlusvshpyadudqwzo/auth/smtp)에 입력합니다.
     - Host `smtp.resend.com`, Port `465`, User `resend`, Password는 API Key
     - Sender email은 인증한 도메인 주소
   - **방법 B**: GitHub에 Secret `RESEND_API_KEY`와 Variable `MAIL_FROM`을 넣고 **Supabase 설정** 워크플로를 다시 실행합니다.

### 자동 테스트
push할 때마다 `.github/workflows/ci.yml`이 GitHub 서버에서 로컬 Supabase를 띄우고, Vercel과 같은 방법으로 빌드한 사이트에 대해 권한 테스트와 전체 흐름 테스트를 돌립니다. 결과는 저장소 **Actions** 탭에서 볼 수 있습니다.

## 알아 둘 점

- 환자는 SOAP 원문을 볼 수 없고, 서명된 최신 평가(A)만 쉬운 말 화면에서 봅니다.
- 누구나 치료사로 가입할 수 있습니다. 가입한 치료사는 자기가 등록한 환자만 볼 수 있지만, 실제 병원에 도입하기 전에는 `profiles.verified`(면허 확인)를 관리자가 승인하는 절차를 추가해야 합니다.
- AI 기능(초안, 점검, 검진, 쉬운 말 요약, 메시지 분류)은 아직 규칙 기반입니다. `app/js/ai.js`의 함수들을 같은 입출력으로 LLM 서버 호출로 바꿀 수 있게 나눠 두었습니다.
- 카메라 영상은 기기 밖으로 나가지 않고, 횟수·최대 각도 숫자만 저장합니다. 카메라 각도는 각도계 측정과 차이가 있을 수 있어 추이 확인용입니다.
- 교육·연구 단계입니다. 실제 환자 정보를 넣기 전에 기관의 개인정보 보호 절차와 IRB 승인을 확인하세요.
