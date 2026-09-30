-- 환자 등록은 사람만 추가한다: 이름 + 첫 내원일. 진단·발병일 같은 의료 정보는 등록 단계에서 받지 않는다.
alter table patients add column first_visit_on date;
grant insert (first_visit_on) on patients to authenticated;
grant update (first_visit_on) on patients to authenticated;
