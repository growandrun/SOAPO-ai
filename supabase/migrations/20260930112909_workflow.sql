-- 치료사 업무 흐름 개선
-- 1. SOAP 임시 저장: status = 'draft' 행은 수정·삭제 가능 (서명된 기록은 기존 트리거가 계속 막음)
-- 2. SOAP 정정 기록: 서명된 원본(amends_id)을 가리키는 새 서명 기록 + 정정 사유
-- 3. 그룹 치료: 같은 회기에 함께 저장한 내원기록을 group_id로 묶음

-- 1. 임시 저장한 초안 삭제 --------------------------------------------------------
create policy "치료사 초안 삭제" on soap_notes for delete to authenticated
  using (private.treats(patient_id) and author_id = (select auth.uid()) and status = 'draft');

-- 2. 정정 기록 ----------------------------------------------------------------
alter table soap_notes add column amend_reason text
  check (length(amend_reason) <= 500);
alter table soap_notes add constraint soap_notes_amend_needs_reason
  check (amends_id is null or (status = 'signed' and length(trim(coalesce(amend_reason, ''))) > 0));
grant insert (amend_reason) on soap_notes to authenticated;

-- 정정 기록은 같은 환자의 서명된 원본만 가리킬 수 있다
alter policy "치료사 작성" on soap_notes with check (
  private.treats(patient_id) and author_id = (select auth.uid())
  and (soap_notes.amends_id is null or exists (
    select 1 from soap_notes o where o.id = soap_notes.amends_id and o.patient_id = soap_notes.patient_id and o.status = 'signed' and o.amends_id is null)));

-- 3. 그룹 치료 ----------------------------------------------------------------
alter table visits add column group_id uuid;
create index visits_group on visits (group_id) where group_id is not null;
grant insert (group_id) on visits to authenticated;

-- 환자용 최신 평가: 같은 시각이면 정정 기록을 원본보다 우선
create or replace function public.my_latest_assessment() returns table (session_date date, a text)
language sql stable security definer set search_path = public as $$
  select n.session_date, n.a from soap_notes n join patients p on p.id = n.patient_id
  where p.user_id = auth.uid() and n.status = 'signed'
  order by n.session_date desc, n.created_at desc, (n.amends_id is not null) desc limit 1;
$$;
