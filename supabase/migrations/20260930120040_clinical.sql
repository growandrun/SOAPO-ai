-- 임상 내용 보강
-- 14. 평가 세부 항목 (K-MBI 항목별, K-MMSE 항목별, COPM 문제별, 악력 시행별)
-- 15. 안전 정보: 주의사항 체크리스트, 체중부하, 식이 단계 (진단·발병일·마비측 칸은 init에 이미 있음)
--     등록 화면에서는 받지 않고, 필요할 때 환자 화면에서 선택 입력한다.
-- 16·20. 치료사 설정: 도움 수준 표기(OT 약어 / FIM 점수), 사용할 치료 분야
-- 17. 내원기록 ↔ 목표 연결
-- 18. 차트번호, 19. 치료 종결 상태

-- 14 ---------------------------------------------------------------------------
alter table assessments add column details jsonb
  check (details is null or (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 20000));
grant insert (details) on assessments to authenticated;

-- 15·18·19 ---------------------------------------------------------------------
alter table patients
  add column precautions      text[] not null default '{}' check (cardinality(precautions) <= 40),
  add column precaution_note  text check (length(precaution_note) <= 1000),
  add column weight_bearing   text check (weight_bearing in ('NWB', 'TTWB', 'PWB', 'WBAT', 'FWB')),
  add column diet_food        text check (diet_food in ('3', '4', '5', '6', '7', 'NPO')),
  add column diet_drink       text check (diet_drink in ('0', '1', '2', '3', '4')),
  add column chart_no         text check (length(trim(chart_no)) between 1 and 40),
  add column status           text not null default 'active' check (status in ('active', 'discharged')),
  add column discharged_on    date,
  add column discharge_reason text check (discharge_reason in ('goal_met', 'discharged', 'transfer', 'stopped', 'other'));
-- 같은 치료사 안에서 차트번호가 겹치지 않게
create unique index patients_chart_no on patients (therapist_id, chart_no) where chart_no is not null;
grant insert (chart_no) on patients to authenticated;
grant update (diagnosis, onset_date, affected_side, precautions, precaution_note, weight_bearing, diet_food, diet_drink,
              chart_no, status, discharged_on, discharge_reason) on patients to authenticated;

-- 16·20 ------------------------------------------------------------------------
alter table profiles add column prefs jsonb not null default '{}'
  check (jsonb_typeof(prefs) = 'object' and octet_length(prefs::text) <= 4000);
-- 설정(prefs)만 본인이 바꿀 수 있다. 역할·면허 확인 여부는 바꿀 수 없다.
revoke update on profiles from authenticated;
grant update (prefs) on profiles to authenticated;
create policy "본인 설정 수정" on profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- 17 ---------------------------------------------------------------------------
alter table visits add column goal_ids uuid[] not null default '{}' check (cardinality(goal_ids) <= 20);
grant insert (goal_ids) on visits to authenticated;
grant update (goal_ids) on visits to authenticated;
