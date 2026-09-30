-- SOAPO 데이터베이스 스키마 (Supabase / PostgreSQL)
-- 로그인은 Supabase Auth의 이메일 매직링크(OTP)를 사용하므로 auth.users 테이블은 Supabase가 관리한다.
-- 모든 테이블은 RLS(행 단위 보안)로 "치료사는 담당 환자만, 환자는 본인 것만" 보이게 한다.

create extension if not exists "pgcrypto";

-- 1. 사용자 프로필 ------------------------------------------------------------
create type user_role as enum ('therapist', 'patient', 'admin');

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null,
  name        text not null,
  license_no  text,                          -- 치료사 면허 번호
  verified    boolean not null default false, -- 관리자가 면허 확인 후 true
  created_at  timestamptz not null default now()
);

-- 2. 기관 / 환자 --------------------------------------------------------------
create table organizations (
  id    uuid primary key default gen_random_uuid(),
  name  text not null                        -- 예: ○○대학교병원 재활의학과
);

create table patients (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid references organizations(id),
  user_id         uuid unique references profiles(id), -- 환자가 앱에 가입하면 연결
  therapist_id    uuid not null references profiles(id),
  name            text not null,
  birth_year      int,
  sex             text,
  diagnosis       text,
  onset_date      date,
  affected_side   text check (affected_side in ('left', 'right', 'both')),
  invite_code     text unique,                 -- 환자 가입용 1회성 코드
  consent_at      timestamptz,                 -- 민감정보 수집·이용 동의 시각
  created_at      timestamptz not null default now()
);

-- 3. 평가 점수 (K-MBI, FIM, BBT, K-MMSE, COPM …) --------------------------------
create table assessments (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  tool        text not null,                  -- 'K-MBI', 'BBT(Rt)' 등
  value       numeric not null,
  max_value   numeric,
  detail      jsonb,                          -- 하위 항목 점수
  measured_on date not null,
  measured_by uuid references profiles(id)
);

-- 4. 목표 (LTG / STG) ---------------------------------------------------------
create type goal_type as enum ('LTG', 'STG');
create type goal_status as enum ('active', 'met', 'revised', 'discontinued');

create table goals (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  parent_id   uuid references goals(id),      -- STG가 어떤 LTG에 속하는지
  type        goal_type not null,
  text        text not null,                  -- COAST 형식 문장
  occupation  text,                           -- 식사, 옷 입기 …
  assist_level text,                          -- I, Mod I, S, Min A, Mod A, Max A, Dep
  due_date    date,
  status      goal_status not null default 'active',
  created_at  timestamptz not null default now()
);

-- 5. SOAP 노트 ----------------------------------------------------------------
create type note_status as enum ('draft', 'signed', 'amended');

create table soap_notes (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  author_id   uuid not null references profiles(id),
  session_date date not null,
  s           text, o text, a text, p text,
  status      note_status not null default 'draft',
  signed_at   timestamptz,
  ai_check    jsonb,                          -- 저장 시점의 AI 점검 결과
  ai_draft_used boolean default false,        -- AI 초안 사용 여부 (감사 추적)
  amends_id   uuid references soap_notes(id), -- 서명 후 수정은 새 버전으로만
  created_at  timestamptz not null default now()
);
-- 서명된 노트는 수정 불가 (의무기록 무결성)
create function block_signed_update() returns trigger language plpgsql as $$
begin
  if old.status = 'signed' then raise exception '서명된 기록은 수정할 수 없습니다. 정정 기록(amended)을 새로 작성하세요.'; end if;
  return new;
end $$;
create trigger soap_notes_immutable before update on soap_notes for each row execute function block_signed_update();

-- 6. 가정 프로그램 & 수행 기록 --------------------------------------------------
create table home_programs (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references patients(id) on delete cascade,
  goal_id       uuid references goals(id),
  title         text not null,
  instructions  text not null,
  target_count  int,
  unit          text default '회',
  per_day       int default 1,
  camera_metric text,                          -- 'shoulder_flexion' 등, null이면 수동 기록
  target_angle  int,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table home_sessions (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references patients(id) on delete cascade,
  program_id   uuid not null references home_programs(id),
  performed_at timestamptz not null default now(),
  reps         int,
  max_angle    int,
  metrics      jsonb,                          -- 센서/카메라 원시 요약값 (영상 자체는 저장하지 않음)
  pain         int check (pain between 0 and 10),
  comment      text,
  source       text check (source in ('camera', 'sensor', 'manual'))
);

-- 7. 메시지 -------------------------------------------------------------------
create table messages (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  sender_id   uuid references profiles(id),   -- null이면 시스템/AI 알림
  kind        text not null default 'text' check (kind in ('text', 'ai_alert')),
  body        text not null,
  triage      text,                           -- 'danger' | 'warn' | null
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

-- 8. 감사 로그 (누가 어떤 환자 정보를 봤는지) -------------------------------------
create table audit_log (
  id         bigserial primary key,
  actor_id   uuid references profiles(id),
  action     text not null,
  patient_id uuid,
  at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS 정책
-- ---------------------------------------------------------------------------
create function is_my_patient(pid uuid) returns boolean language sql stable security definer as $$
  select exists (
    select 1 from patients p
    where p.id = pid
      and (p.therapist_id = auth.uid() or p.user_id = auth.uid())
  );
$$;

alter table profiles      enable row level security;
alter table patients      enable row level security;
alter table assessments   enable row level security;
alter table goals         enable row level security;
alter table soap_notes    enable row level security;
alter table home_programs enable row level security;
alter table home_sessions enable row level security;
alter table messages      enable row level security;
alter table audit_log     enable row level security;

create policy "본인 프로필" on profiles for all using (id = auth.uid());
create policy "담당/본인 환자" on patients for select using (therapist_id = auth.uid() or user_id = auth.uid());
create policy "치료사가 환자 등록" on patients for insert with check (therapist_id = auth.uid());

create policy "읽기" on assessments   for select using (is_my_patient(patient_id));
create policy "읽기" on goals         for select using (is_my_patient(patient_id));
create policy "읽기" on home_programs for select using (is_my_patient(patient_id));
create policy "읽기" on home_sessions for select using (is_my_patient(patient_id));
create policy "읽기" on messages      for select using (is_my_patient(patient_id));

-- 치료사 전용 쓰기
create policy "치료사 쓰기" on assessments   for insert with check (exists (select 1 from patients p where p.id = patient_id and p.therapist_id = auth.uid()));
create policy "치료사 쓰기" on goals         for all    using (exists (select 1 from patients p where p.id = patient_id and p.therapist_id = auth.uid()));
create policy "치료사 쓰기" on home_programs for all    using (exists (select 1 from patients p where p.id = patient_id and p.therapist_id = auth.uid()));

-- SOAP 노트: 치료사만 읽고 씀. 환자는 서명된 노트를 쉬운 말 요약(API)으로만 본다.
create policy "치료사 SOAP" on soap_notes for all
  using (exists (select 1 from patients p where p.id = patient_id and p.therapist_id = auth.uid()));

-- 환자는 본인 수행 기록만 추가
create policy "환자 기록" on home_sessions for insert
  with check (exists (select 1 from patients p where p.id = patient_id and p.user_id = auth.uid()));

-- 메시지: 담당 관계인 양쪽 모두 작성 가능
create policy "메시지 쓰기" on messages for insert with check (is_my_patient(patient_id) and sender_id = auth.uid());
