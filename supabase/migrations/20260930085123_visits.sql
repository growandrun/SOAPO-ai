-- 내원기록: 내원한 날 어떤 치료를 어떻게, 얼마나 했는지
-- 치료 항목은 체크리스트 코드(app/js/catalog.js)와 세부 값(측면·무게·세트·횟수·시간·단계·도움 수준)으로 저장한다.
-- items 예: [{"code":"dumbbell","side":"R","weight":2,"sets":3,"reps":10,"response":"good","how":"팔꿈치 90도"}]
-- 환자·보호자도 읽을 수 있다 (앱에서 "지난 치료에서 한 것"으로 보여 줌).

create table visits (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references patients(id) on delete cascade,
  therapist_id   uuid not null references profiles(id) default auth.uid(),
  appointment_id uuid references appointments(id) on delete set null,
  visited_on     date not null,
  duration_min   int check (duration_min between 1 and 480),
  items          jsonb not null default '[]'
                 check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 40 and octet_length(items::text) <= 20000),
  observations   text[] not null default '{}' check (cardinality(observations) <= 30),
  note           text check (length(note) <= 2000),
  created_at     timestamptz not null default now()
);
create index visits_patient_day on visits (patient_id, visited_on desc);
create index visits_therapist on visits (therapist_id);
create index visits_appointment on visits (appointment_id);

alter table visits enable row level security;
create policy "읽기" on visits for select to authenticated using (private.can_see_patient(patient_id));
-- 연결한 일정은 같은 환자의 것이어야 한다
create policy "치료사 쓰기" on visits for insert to authenticated with check (
  private.treats(patient_id) and therapist_id = (select auth.uid())
  and (appointment_id is null or exists (select 1 from appointments a where a.id = appointment_id and a.patient_id = visits.patient_id)));
create policy "치료사 수정" on visits for update to authenticated using (private.treats(patient_id)) with check (
  private.treats(patient_id)
  and (appointment_id is null or exists (select 1 from appointments a where a.id = appointment_id and a.patient_id = visits.patient_id)));
create policy "치료사 삭제" on visits for delete to authenticated using (private.treats(patient_id));

revoke all on visits from anon;
revoke insert, update on visits from authenticated;
grant insert (patient_id, appointment_id, visited_on, duration_min, items, observations, note) on visits to authenticated;
grant update (appointment_id, visited_on, duration_min, items, observations, note) on visits to authenticated;
