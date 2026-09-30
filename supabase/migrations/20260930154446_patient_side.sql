-- 환자·보호자 쪽 개선
-- 24. 치료사 응답 시간·자동 안내: profiles.prefs.office 에 저장 (스키마 변경 없음)
-- 25. 앱 밖 알림(웹 푸시): 기기별 구독 정보 + 발송 설정(서버 전용)
-- 26. 카메라 측정 동작 추가: 어깨 벌림, 팔꿈치 굽힘
-- 27. 내원기록 중 치료사만 볼 내용(관찰·특이사항, 치료사 메모)을 별도 테이블로 분리

-- 25 ---------------------------------------------------------------------------
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  endpoint   text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh     text not null check (length(p256dh) <= 200),
  auth       text not null check (length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on push_subscriptions (user_id);
alter table push_subscriptions enable row level security;
create policy "본인 구독 읽기" on push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "본인 구독 삭제" on push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));
revoke all on push_subscriptions from anon;
revoke insert, update on push_subscriptions from authenticated;

-- 같은 기기(endpoint)를 다른 계정이 쓰던 경우에도 지금 로그인한 사람으로 옮겨 저장
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then raise exception '로그인이 필요합니다.'; end if;
  delete from push_subscriptions where endpoint = p_endpoint;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth);
end $$;
revoke execute on function public.save_push_subscription(text, text, text) from anon, public;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- 발송 설정 (VAPID 키). 서버(Edge Function, service role)만 읽는다. 값은 마이그레이션이 아니라 운영 DB에 직접 넣는다.
create table push_config (
  id            int primary key default 1 check (id = 1),
  vapid_public  text not null,
  vapid_private text not null,
  subject       text not null
);
alter table push_config enable row level security;   -- 정책 없음 = 로그인 사용자도 못 읽음
revoke all on push_config from anon, authenticated;

-- 26 ---------------------------------------------------------------------------
alter table home_programs drop constraint home_programs_camera_metric_check;
alter table home_programs add constraint home_programs_camera_metric_check
  check (camera_metric in ('shoulder_flexion', 'shoulder_abduction', 'elbow_flexion'));

-- 27 ---------------------------------------------------------------------------
create table visit_private (
  visit_id     uuid primary key references visits(id) on delete cascade,
  patient_id   uuid not null references patients(id) on delete cascade,
  observations text[] not null default '{}' check (cardinality(observations) <= 30),
  staff_note   text check (length(staff_note) <= 2000),
  updated_at   timestamptz not null default now()
);
create index visit_private_patient on visit_private (patient_id);
alter table visit_private enable row level security;
create policy "치료사 읽기" on visit_private for select to authenticated using (private.treats(patient_id));
create policy "치료사 쓰기" on visit_private for insert to authenticated with check (
  private.treats(patient_id) and exists (select 1 from visits v where v.id = visit_private.visit_id and v.patient_id = visit_private.patient_id));
create policy "치료사 수정" on visit_private for update to authenticated using (private.treats(patient_id)) with check (
  private.treats(patient_id) and exists (select 1 from visits v where v.id = visit_private.visit_id and v.patient_id = visit_private.patient_id));
revoke all on visit_private from anon;
revoke insert, update on visit_private from authenticated;
grant insert (visit_id, patient_id, observations, staff_note) on visit_private to authenticated;
-- 앱은 upsert로 저장하므로 충돌 키도 다시 쓴다 (RLS가 같은 환자의 기록만 허용)
grant update (visit_id, patient_id, observations, staff_note) on visit_private to authenticated;

-- 기존 관찰 기록을 옮기고, 환자도 읽을 수 있는 visits 테이블에서는 뺀다
insert into visit_private (visit_id, patient_id, observations)
  select id, patient_id, observations from visits where cardinality(observations) > 0;
alter table visits drop column observations;
