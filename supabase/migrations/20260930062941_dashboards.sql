-- 대시보드 기능 (docs/DASHBOARD_RESEARCH.md 참고)
-- 1. 환자 본인 / 보호자 가입 구분
-- 2. 치료 일정 (치료사 대시보드의 오늘 일정, 환자 대시보드의 다음 치료)
-- 3. 매일 컨디션 기록 (통증·피로·기분·수면, 환자가 입력하고 치료사가 추이를 봄)
-- 4. 메시지 읽음 표시 (읽지 않은 메시지 수)

-- 1. 환자 / 보호자 ------------------------------------------------------------
alter table profiles add column relation text check (relation in ('self', 'guardian'));

drop function public.redeem_invite(text, text);
create function public.redeem_invite(p_code text, p_name text, p_relation text default 'self') returns profiles
language plpgsql security definer set search_path = public as $$
declare r profiles; pid uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_relation not in ('self', 'guardian') then raise exception '가입 유형이 올바르지 않습니다.'; end if;
  select id into pid from patients where invite_code = upper(trim(p_code)) and user_id is null for update;
  if pid is null then raise exception '초대 코드를 찾을 수 없거나 이미 사용되었습니다.'; end if;
  insert into profiles (id, role, name, relation) values (auth.uid(), 'patient', trim(p_name), p_relation) returning * into r;
  update patients set user_id = auth.uid(), invite_code = null, consent_at = now() where id = pid;
  return r;
end $$;
revoke execute on function public.redeem_invite(text, text, text) from anon, public;
grant execute on function public.redeem_invite(text, text, text) to authenticated;

-- 2. 치료 일정 -----------------------------------------------------------------
create table appointments (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references patients(id) on delete cascade,
  therapist_id uuid not null references profiles(id) default auth.uid(),
  starts_at    timestamptz not null,
  duration_min int not null default 30 check (duration_min between 5 and 480),
  kind         text not null default 'session' check (kind in ('session', 'evaluation', 'reevaluation', 'telehealth')),
  status       text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled', 'no_show')),
  note         text check (length(note) <= 1000),
  created_at   timestamptz not null default now()
);
create index appointments_patient_time on appointments (patient_id, starts_at);
create index appointments_therapist_time on appointments (therapist_id, starts_at);

alter table appointments enable row level security;
create policy "읽기" on appointments for select to authenticated using (private.can_see_patient(patient_id));
create policy "치료사 쓰기" on appointments for insert to authenticated with check (private.treats(patient_id) and therapist_id = (select auth.uid()));
create policy "치료사 수정" on appointments for update to authenticated using (private.treats(patient_id)) with check (private.treats(patient_id));
create policy "치료사 삭제" on appointments for delete to authenticated using (private.treats(patient_id));

-- 3. 매일 컨디션 기록 ----------------------------------------------------------
create table symptom_logs (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  logged_on  date not null,
  pain       int not null check (pain between 0 and 10),
  fatigue    int check (fatigue between 0 and 10),
  mood       int check (mood between 1 and 5),
  sleep      int check (sleep between 1 and 5),
  note       text check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  unique (patient_id, logged_on)
);

alter table symptom_logs enable row level security;
create policy "읽기" on symptom_logs for select to authenticated using (private.can_see_patient(patient_id));
create policy "환자 기록" on symptom_logs for insert to authenticated with check (private.is_self_patient(patient_id));
create policy "환자 수정" on symptom_logs for update to authenticated using (private.is_self_patient(patient_id)) with check (private.is_self_patient(patient_id));

-- 4. 메시지 읽음 표시 -----------------------------------------------------------
create table thread_reads (
  user_id      uuid not null default auth.uid() references profiles(id) on delete cascade,
  patient_id   uuid not null references patients(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, patient_id)
);
create index thread_reads_patient on thread_reads (patient_id);

alter table thread_reads enable row level security;
create policy "본인 읽기" on thread_reads for select to authenticated using (user_id = (select auth.uid()));
create policy "본인 기록" on thread_reads for insert to authenticated with check (user_id = (select auth.uid()) and private.can_see_patient(patient_id));
create policy "본인 수정" on thread_reads for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and private.can_see_patient(patient_id));

-- 열 단위 권한 ---------------------------------------------------------------
revoke all on appointments, symptom_logs, thread_reads from anon;
revoke insert, update on appointments, symptom_logs, thread_reads from authenticated;
grant insert (patient_id, starts_at, duration_min, kind, status, note) on appointments to authenticated;
grant update (starts_at, duration_min, kind, status, note) on appointments to authenticated;
grant insert (patient_id, logged_on, pain, fatigue, mood, sleep, note) on symptom_logs to authenticated;
-- 앱은 upsert로 저장하므로 충돌 키(patient_id, logged_on)도 다시 쓰게 된다. 바뀌는 값은 없고 RLS가 본인 것만 허용한다.
grant update (patient_id, logged_on, pain, fatigue, mood, sleep, note) on symptom_logs to authenticated;
grant insert (patient_id, last_read_at) on thread_reads to authenticated;
grant update (patient_id, last_read_at) on thread_reads to authenticated;
