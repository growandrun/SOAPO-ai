-- 환자 등록 시 생년월일 (환자 목록에 생년월일·만 나이로 표시, 동명이인 구분)
alter table patients add column birth_date date check (birth_date between '1900-01-01' and '2100-12-31');
grant insert (birth_date) on patients to authenticated;
grant update (name, birth_date, first_visit_on) on patients to authenticated;
