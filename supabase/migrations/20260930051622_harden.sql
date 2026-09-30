-- Supabase 보안·성능 점검(advisors) 결과 반영
-- 1. 권한 도우미 함수를 API로 호출할 수 없는 private 스키마로 옮긴다 (RLS 정책 안에서만 쓰임)
-- 2. RLS 정책에서 auth.uid()를 행마다 다시 계산하지 않도록 (select auth.uid())로 바꾼다
-- 3. 외래 키에 인덱스를 추가한다

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.is_therapist()          set schema private;
alter function public.treats(uuid)            set schema private;
alter function public.is_self_patient(uuid)   set schema private;
alter function public.can_see_patient(uuid)  set schema private;
alter function public.can_see_profile(uuid)  set schema private;

-- 옮긴 함수와 이를 부르는 함수가 서로를 찾을 수 있게
alter function private.can_see_patient(uuid) set search_path = public, private;
alter function public.reissue_invite(uuid)   set search_path = public, private;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
revoke execute on function public.new_invite_code() from public, anon;
grant execute on function public.new_invite_code() to authenticated;

alter policy "담당/본인 환자 읽기" on patients using (therapist_id = (select auth.uid()) or user_id = (select auth.uid()));
alter policy "치료사 환자 등록" on patients with check (therapist_id = (select auth.uid()) and private.is_therapist());
alter policy "치료사 환자 수정" on patients using (therapist_id = (select auth.uid())) with check (therapist_id = (select auth.uid()));
alter policy "치료사 작성" on soap_notes with check (private.treats(patient_id) and author_id = (select auth.uid()));
alter policy "쓰기" on messages with check (private.can_see_patient(patient_id) and sender_id = (select auth.uid()));

create index if not exists patients_therapist_id on patients (therapist_id);
create index if not exists assessments_patient_id on assessments (patient_id);
create index if not exists assessments_measured_by on assessments (measured_by);
create index if not exists goals_patient_id on goals (patient_id);
create index if not exists soap_notes_patient_date on soap_notes (patient_id, session_date desc);
create index if not exists soap_notes_author_id on soap_notes (author_id);
create index if not exists soap_notes_amends_id on soap_notes (amends_id);
create index if not exists home_programs_patient_id on home_programs (patient_id);
create index if not exists home_sessions_program_id on home_sessions (program_id);
create index if not exists messages_sender_id on messages (sender_id);
