-- 권한(RLS) 테스트. 실행: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- 테스트 계정: 치료사 2명(t1, t2), 환자 1명(p1), 가입만 한 사람(x)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 't1@test.kr'),
  ('00000000-0000-0000-0000-0000000000a2', 't2@test.kr'),
  ('00000000-0000-0000-0000-0000000000b1', 'p1@test.kr'),
  ('00000000-0000-0000-0000-0000000000c1', 'x@test.kr');

-- ── 치료사 t1 ─────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok($$ select register_therapist('김하늘', '12345') $$, '치료사 가입');
select lives_ok($$ insert into patients (therapist_id, name, diagnosis) values (auth.uid(), '테스트환자', '뇌졸중') $$, '치료사가 환자 등록');
select lives_ok($$ insert into goals (patient_id, type, text) select id, 'STG', '식사 Mod I' from patients $$, '목표 추가');
select lives_ok($$ insert into assessments (patient_id, tool, value, max_value) select id, 'K-MBI', 52, 100 from patients $$, '점수 추가');
select lives_ok($$ insert into home_programs (patient_id, title, instructions) select id, '어깨 운동', '천천히' from patients $$, '가정 프로그램 처방');
select lives_ok($$ insert into soap_notes (patient_id, s, o, a, p, status) select id, 's', 'o', '평가 내용', 'p', 'signed' from patients $$, 'SOAP 서명 저장');
select throws_ok($$ update soap_notes set a = '고침' $$, 'P0001', null, '서명된 SOAP는 수정 불가');
select throws_ok($$ update patients set user_id = auth.uid() $$, '42501', null, '치료사가 환자 계정 연결을 직접 바꿀 수 없음');
select throws_ok($$ insert into patients (therapist_id, name) values ('00000000-0000-0000-0000-0000000000a2', '남의환자') $$, '42501', null, '다른 치료사 이름으로 환자 등록 불가');
select lives_ok($$ insert into patients (therapist_id, name) values (auth.uid(), '코드재발급환자') $$, '두 번째 환자 등록');
select matches((select reissue_invite(id) from patients where name = '코드재발급환자'), '^SOAP-[0-9A-F]{6}$', '초대 코드 재발급');

-- 이후 테스트에서 쓸 환자 id와 초대 코드 (관리자 권한으로 조회)
reset role;
select set_config('test.pid', (select id::text from patients where name = '테스트환자'), true);
select set_config('test.code', (select invite_code from patients where name = '테스트환자'), true);
set local role authenticated;

-- ── 치료사 t2: t1의 환자를 볼 수 없어야 함 ────────────────────
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select lives_ok($$ select register_therapist('이다른', '67890') $$, '두 번째 치료사 가입');
select is((select count(*) from patients), 0::bigint, '다른 치료사의 환자는 안 보임');
select is((select count(*) from soap_notes), 0::bigint, '다른 치료사의 SOAP는 안 보임');
select throws_ok($$ insert into goals (patient_id, type, text) values (current_setting('test.pid')::uuid, 'STG', 'x') $$, '42501', null, '남의 환자 id를 알아도 목표 추가 불가');

-- ── 환자 p1: 초대 코드로 가입 ────────────────────────────────
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select is((select count(*) from patients), 0::bigint, '가입 전에는 환자 기록이 안 보임');
select lives_ok($$ select redeem_invite(current_setting('test.code'), '박영수') $$, '초대 코드로 환자 가입');
select is((select count(*) from patients), 1::bigint, '가입 후 본인 기록만 보임');
select is((select count(*) from soap_notes), 0::bigint, '환자는 SOAP 원문을 직접 못 읽음');
select is((select count(*) from my_latest_assessment()), 1::bigint, '환자는 서명된 평가 요약만 받음');
select lives_ok($$ insert into home_sessions (patient_id, program_id, reps, pain, source) select patient_id, id, 10, 2, 'manual' from home_programs $$, '환자가 운동 기록 저장');
select throws_ok($$ insert into goals (patient_id, type, text) select id, 'STG', '내 맘대로' from patients $$, '42501', null, '환자는 목표를 만들 수 없음');
select lives_ok($$ insert into messages (patient_id, body) select id, '어깨가 당겨요' from patients $$, '환자가 메시지 전송');
select throws_ok($$ insert into messages (patient_id, body, sender_id) select id, '사칭', '00000000-0000-0000-0000-0000000000a1' from patients $$, '42501', null, '보낸 사람을 다른 사람으로 바꿀 수 없음');

-- ── 이미 쓴 코드 재사용, 코드 없는 가입자 ─────────────────────
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select throws_ok($$ select redeem_invite(current_setting('test.code'), '도용') $$, 'P0001', null, '사용된 초대 코드는 재사용 불가');
select is((select count(*) from messages), 0::bigint, '관계없는 사용자는 메시지를 못 봄');

select * from finish();
rollback;
