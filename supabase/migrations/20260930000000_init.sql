-- SOAPO 데이터베이스 스키마 (Supabase / PostgreSQL)
-- 로그인: Supabase Auth 이메일 매직링크. auth.users는 Supabase가 관리한다.
-- 권한: RLS(행 단위 보안)로 "치료사는 담당 환자만, 환자는 본인 것만" 보이게 한다.
-- 가입: 프로필은 클라이언트가 직접 만들 수 없고, 아래 RPC 함수로만 만든다.
--       (환자는 초대 코드가 있어야 환자 기록과 연결된다)

create extension if not exists "pgcrypto";

-- 1. 사용자 프로필 ------------------------------------------------------------
create type user_role as enum ('therapist', 'patient', 'admin');

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null,
  name        text not null check (length(trim(name)) > 0),
  license_no  text,                          -- 치료사 면허 번호
  verified    boolean not null default false, -- 관리자가 면허 확인 후 true
  created_at  timestamptz not null default now()
);

-- 2. 환자 ---------------------------------------------------------------------
create function new_invite_code() returns text language sql volatile as $$
  select 'SOAP-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
$$;

create table patients (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references profiles(id) on delete set null, -- 환자가 가입하면 연결
  therapist_id    uuid not null references profiles(id),
  name            text not null,
  birth_year      int check (birth_year between 1900 and 2100),
  sex             text,
  diagnosis       text,
  onset_date      date,
  affected_side   text not null default 'right' check (affected_side in ('left', 'right', 'both')),
  invite_code     text unique default new_invite_code(), -- 가입에 쓰면 null
  consent_at      timestamptz,                 -- 민감정보 수집·이용 동의 시각
  created_at      timestamptz not null default now()
);

-- 3. 평가 점수 (K-MBI, FIM, BBT, K-MMSE, COPM …) --------------------------------
create table assessments (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  tool        text not null,
  value       numeric not null,
  max_value   numeric,
  measured_on date not null default current_date,
  measured_by uuid references profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

-- 4. 목표 (LTG / STG) ---------------------------------------------------------
create type goal_type as enum ('LTG', 'STG');
create type goal_status as enum ('active', 'met', 'revised', 'discontinued');

create table goals (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  type        goal_type not null,
  text        text not null,                  -- COAST 형식 문장
  due_date    date,
  status      goal_status not null default 'active',
  created_at  timestamptz not null default now()
);

-- 5. SOAP 노트 ----------------------------------------------------------------
create type note_status as enum ('draft', 'signed', 'amended');

create table soap_notes (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references patients(id) on delete cascade,
  author_id    uuid not null references profiles(id) default auth.uid(),
  session_date date not null default current_date,
  s text not null default '', o text not null default '', a text not null default '', p text not null default '',
  status       note_status not null default 'draft',
  signed_at    timestamptz,
  ai_check     jsonb,                          -- 저장 시점의 AI 점검 결과
  ai_draft_used boolean not null default false, -- AI 초안 사용 여부 (감사 추적)
  amends_id    uuid references soap_notes(id),  -- 서명 후 수정은 새 기록으로만
  created_at   timestamptz not null default now()
);

-- 서명된 노트는 수정·삭제 불가 (의무기록 무결성)
create function block_signed_change() returns trigger language plpgsql as $$
begin
  if old.status = 'signed' then
    raise exception '서명된 기록은 수정하거나 삭제할 수 없습니다. 정정 기록을 새로 작성하세요.';
  end if;
  return coalesce(new, old);
end $$;
create trigger soap_notes_immutable before update or delete on soap_notes
  for each row execute function block_signed_change();

-- 서명 시각은 서버가 기록
create function stamp_signed_at() returns trigger language plpgsql as $$
begin
  if new.status = 'signed' and new.signed_at is null then new.signed_at := now(); end if;
  return new;
end $$;
create trigger soap_notes_signed_at before insert or update on soap_notes
  for each row execute function stamp_signed_at();

-- 6. 가정 프로그램 & 수행 기록 --------------------------------------------------
create table home_programs (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references patients(id) on delete cascade,
  title         text not null,
  instructions  text not null,
  target_count  int not null default 10,
  unit          text not null default '회',
  per_day       int not null default 1,
  camera_metric text check (camera_metric in ('shoulder_flexion')), -- null이면 수동 기록
  target_angle  int default 90,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table home_sessions (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references patients(id) on delete cascade,
  program_id   uuid not null references home_programs(id) on delete cascade,
  performed_at timestamptz not null default now(),
  reps         int,
  max_angle    int,
  pain         int check (pain between 0 and 10),
  comment      text,
  source       text not null check (source in ('camera', 'sensor', 'manual'))
  -- 영상 자체는 저장하지 않는다. 기기에서 계산한 수치만 저장.
);
create index home_sessions_patient_time on home_sessions (patient_id, performed_at desc);

-- 7. 메시지 -------------------------------------------------------------------
create table messages (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  sender_id   uuid not null references profiles(id) default auth.uid(),
  kind        text not null default 'text' check (kind in ('text', 'ai_alert')),
  body        text not null check (length(body) between 1 and 4000),
  triage      text check (triage in ('danger', 'warn')),
  created_at  timestamptz not null default now()
);
create index messages_patient_time on messages (patient_id, created_at);

-- ---------------------------------------------------------------------------
-- 권한 도우미 (security definer: RLS 재귀를 피하기 위해)
-- ---------------------------------------------------------------------------
create function is_therapist() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'therapist');
$$;
create function treats(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from patients where id = pid and therapist_id = auth.uid());
$$;
create function is_self_patient(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from patients where id = pid and user_id = auth.uid());
$$;
create function can_see_patient(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select treats(pid) or is_self_patient(pid);
$$;
-- 서로 담당 관계인 치료사·환자는 상대 이름을 볼 수 있다
create function can_see_profile(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select uid = auth.uid() or exists (
    select 1 from patients
    where (therapist_id = uid and user_id = auth.uid()) or (user_id = uid and therapist_id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- 가입 RPC
-- ---------------------------------------------------------------------------
create function register_therapist(p_name text, p_license text) returns profiles
language plpgsql security definer set search_path = public as $$
declare r profiles;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  insert into profiles (id, role, name, license_no) values (auth.uid(), 'therapist', trim(p_name), trim(p_license))
  returning * into r;
  return r;
end $$;

create function redeem_invite(p_code text, p_name text) returns profiles
language plpgsql security definer set search_path = public as $$
declare r profiles; pid uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select id into pid from patients where invite_code = upper(trim(p_code)) and user_id is null for update;
  if pid is null then raise exception '초대 코드를 찾을 수 없거나 이미 사용되었습니다.'; end if;
  insert into profiles (id, role, name) values (auth.uid(), 'patient', trim(p_name)) returning * into r;
  update patients set user_id = auth.uid(), invite_code = null, consent_at = now() where id = pid;
  return r;
end $$;

-- 치료사가 새 초대 코드를 발급 (환자가 아직 가입하지 않은 경우)
create function reissue_invite(p_patient uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not treats(p_patient) then raise exception '담당 환자가 아닙니다.'; end if;
  update patients set invite_code = new_invite_code() where id = p_patient and user_id is null returning invite_code into code;
  return code;
end $$;

-- 환자용: 서명된 최신 SOAP 노트의 평가(A)만 돌려준다. 환자는 soap_notes 테이블을 직접 못 읽는다.
create function my_latest_assessment() returns table (session_date date, a text)
language sql stable security definer set search_path = public as $$
  select n.session_date, n.a from soap_notes n join patients p on p.id = n.patient_id
  where p.user_id = auth.uid() and n.status = 'signed'
  order by n.session_date desc, n.created_at desc limit 1;
$$;

revoke execute on function register_therapist, redeem_invite, reissue_invite, my_latest_assessment from anon, public;
grant execute on function register_therapist, redeem_invite, reissue_invite, my_latest_assessment to authenticated;

-- ---------------------------------------------------------------------------
-- RLS 정책
-- ---------------------------------------------------------------------------
alter table profiles      enable row level security;
alter table patients      enable row level security;
alter table assessments   enable row level security;
alter table goals         enable row level security;
alter table soap_notes    enable row level security;
alter table home_programs enable row level security;
alter table home_sessions enable row level security;
alter table messages      enable row level security;

-- profiles: 읽기만 (생성은 RPC)
create policy "관련 프로필 읽기" on profiles for select to authenticated using (can_see_profile(id));

-- patients
create policy "담당/본인 환자 읽기" on patients for select to authenticated using (therapist_id = auth.uid() or user_id = auth.uid());
create policy "치료사 환자 등록" on patients for insert to authenticated with check (therapist_id = auth.uid() and is_therapist());
create policy "치료사 환자 수정" on patients for update to authenticated using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());

-- 평가·목표·가정 프로그램: 양쪽 읽기, 치료사만 쓰기
create policy "읽기" on assessments   for select to authenticated using (can_see_patient(patient_id));
create policy "읽기" on goals         for select to authenticated using (can_see_patient(patient_id));
create policy "읽기" on home_programs for select to authenticated using (can_see_patient(patient_id));
create policy "치료사 쓰기" on assessments   for insert to authenticated with check (treats(patient_id));
create policy "치료사 쓰기" on goals         for insert to authenticated with check (treats(patient_id));
create policy "치료사 수정" on goals         for update to authenticated using (treats(patient_id)) with check (treats(patient_id));
create policy "치료사 쓰기" on home_programs for insert to authenticated with check (treats(patient_id));
create policy "치료사 수정" on home_programs for update to authenticated using (treats(patient_id)) with check (treats(patient_id));

-- SOAP 노트: 담당 치료사만 (삭제 정책 없음 = 삭제 불가)
create policy "치료사 읽기" on soap_notes for select to authenticated using (treats(patient_id));
create policy "치료사 작성" on soap_notes for insert to authenticated with check (treats(patient_id) and author_id = auth.uid());
create policy "치료사 수정" on soap_notes for update to authenticated using (treats(patient_id)) with check (treats(patient_id));

-- 가정 수행 기록: 양쪽 읽기, 환자 본인만 추가 (자기 프로그램에 대해서만)
create policy "읽기" on home_sessions for select to authenticated using (can_see_patient(patient_id));
create policy "환자 기록" on home_sessions for insert to authenticated with check (
  is_self_patient(patient_id)
  and exists (select 1 from home_programs hp where hp.id = program_id and hp.patient_id = home_sessions.patient_id)
);

-- 메시지: 담당 관계인 양쪽이 읽고 쓴다. 보낸 사람은 본인이어야 한다.
create policy "읽기" on messages for select to authenticated using (can_see_patient(patient_id));
create policy "쓰기" on messages for insert to authenticated with check (can_see_patient(patient_id) and sender_id = auth.uid());

-- 새 메시지를 실시간으로 받기
alter publication supabase_realtime add table messages;

-- ---------------------------------------------------------------------------
-- 열 단위 권한: 클라이언트가 바꿀 수 있는 열만 연다
-- (예: 치료사가 patients.user_id를 바꿔 다른 계정에 환자 기록을 붙이는 것을 막는다)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke insert, update on patients, assessments, goals, soap_notes, home_programs, home_sessions, messages from authenticated;

grant insert (therapist_id, name, birth_year, sex, diagnosis, onset_date, affected_side) on patients to authenticated;
grant update (name, birth_year, sex, diagnosis, onset_date, affected_side) on patients to authenticated;
grant insert (patient_id, tool, value, max_value, measured_on) on assessments to authenticated;
grant insert (patient_id, type, text, due_date) on goals to authenticated;
grant update (text, due_date, status) on goals to authenticated;
grant insert (patient_id, session_date, s, o, a, p, status, ai_check, ai_draft_used, amends_id) on soap_notes to authenticated;
grant update (session_date, s, o, a, p, status, ai_check, ai_draft_used) on soap_notes to authenticated;
grant insert (patient_id, title, instructions, target_count, unit, per_day, camera_metric, target_angle) on home_programs to authenticated;
grant update (title, instructions, target_count, unit, per_day, camera_metric, target_angle, active) on home_programs to authenticated;
grant insert (patient_id, program_id, performed_at, reps, max_angle, pain, comment, source) on home_sessions to authenticated;
grant insert (patient_id, kind, body, triage) on messages to authenticated;
