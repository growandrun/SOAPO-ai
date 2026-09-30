// 전체 흐름 테스트: 로컬 Supabase(npx supabase start)와 앱 서버(포트 3000)가 켜진 상태에서 npm run test:e2e
// 매번 새 DB가 필요하므로 먼저 npx supabase db reset 을 실행하세요.
import { chromium } from 'playwright';
const MAIL = 'http://127.0.0.1:54324';
const APP = 'http://localhost:3000/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function mail(to) {
  for (let i = 0; i < 30; i++) {
    const r = await (await fetch(`${MAIL}/api/v1/search?query=to:${encodeURIComponent(to)}`)).json();
    if (r.messages?.length) {
      const m = await (await fetch(`${MAIL}/api/v1/message/${r.messages[0].ID}`)).json();
      const link = (m.HTML.match(/href="([^"]+)"/) || [])[1]?.replace(/&amp;/g, '&');
      const code = (m.Text.match(/\b(\d{6,10})\b/) || [])[1];
      return { subject: m.Subject, link, code };
    }
    await sleep(500);
  }
  throw new Error('no mail for ' + to);
}
const today = new Date(); const pad = (n) => String(n).padStart(2, '0');
const localDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

await fetch(`${MAIL}/api/v1/messages`, { method: 'DELETE' });
const b = await chromium.launch();
const errs = [];
const mk = async (name, vp) => { const c = await b.newContext({ ignoreHTTPSErrors: true, viewport: vp, colorScheme: process.env.DARK ? 'dark' : 'light' }); const p = await c.newPage();
  if (process.env.SHOTS) await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort()); // 캡처가 글꼴을 기다리지 않게
  p.on('pageerror', (e) => errs.push(`${name} pageerror: ${e.message}`)); p.on('console', (m) => m.type() === 'error' && errs.push(`${name}: ${m.text()}`)); return p; };
const T = await mk('T', { width: 1280, height: 900 }), P = await mk('P', { width: 390, height: 844 });
const step = (s) => console.log('✓', s);
// SHOTS=폴더 를 주면 주요 화면을 캡처한다
// 캡처는 웹 글꼴을 기다리다 멈출 수 있어(글꼴 차단 환경), 실패해도 테스트를 막지 않게 한다
const shot = async (pg, name) => { if (!process.env.SHOTS) return; try { await pg.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true, timeout: 10000 }); } catch { console.log(`  (캡처 건너뜀: ${name})`); } };
const text = async (pg, sel) => (await pg.textContent(sel)).replace(/\s+/g, ' ').trim();

// ── 홈페이지 → 치료사 가입 (메일 링크) ──
await T.goto(APP, { waitUntil: 'domcontentloaded' }); await T.waitForSelector('.hero h1'); await shot(T, '1-home');
if ((await text(T, '.hero')).includes('비밀번호 없이')) throw new Error('홈에 "비밀번호 없이" 문구가 남아 있음');
step('홈페이지 표시');
if (await T.$('a[href="demo/"]')) throw new Error('데모 링크가 남아 있음');
await T.click('.cta [data-mode=therapist]'); await T.waitForSelector('#f-signup');
if (!(await text(T, '#f-signup h2')).includes('작업치료사 가입')) throw new Error('치료사 가입 화면 아님');
const T_PW = 'Soapo2026';
await T.fill('#email', 'ot.kim@test.kr'); await T.fill('#password', 'abcdefgh'); await T.fill('#password2', 'abcdefgh'); await T.click('#f-signup button[type=submit]');
await T.waitForSelector('.toast.error'); if (!(await text(T, '.toast.error')).includes('영문과 숫자')) throw new Error('약한 비밀번호가 통과됨');
await T.fill('#password', T_PW); await T.fill('#password2', T_PW + 'x'); await T.click('#f-signup button[type=submit]');
await T.waitForFunction(() => [...document.querySelectorAll('.toast.error')].some((t) => t.textContent.includes('일치하지')));
step('비밀번호 규칙 검사 (영문+숫자 8자 이상, 확인 일치)');
await T.fill('#password2', T_PW); await T.click('#f-signup button[type=submit]');
await T.waitForSelector('#f-signup-code'); const tm = await mail('ot.kim@test.kr'); step(`이메일·비밀번호 가입 → 인증 메일 "${tm.subject}"`);
await T.goto(tm.link, { waitUntil: 'domcontentloaded' }); await T.waitForSelector('#f-onboard');
if ((await T.getAttribute('[data-role=therapist]', 'aria-pressed')) !== 'true') throw new Error('치료사 유형이 미리 선택되지 않음');
step('메일 링크 → 가입 마무리 (치료사 미리 선택됨)');
await T.fill('#ob-name', '김하늘'); await T.fill('#ob-license', '제12345호'); await T.check('#ob-consent'); await T.click('#f-onboard button[type=submit]');
await T.waitForSelector('#f-patient'); step('치료사 가입 → 첫 환자 등록 화면');
await shot(T, '0-register'); if (await T.$('#np-dx')) throw new Error('등록 화면에 의료 정보 칸이 남아 있음');
await T.fill('#np-name', '박영수'); await T.fill('#np-birth', '1958-03-12'); await T.fill('#np-visit', localDate); await T.click('#f-patient button[type=submit]');
await T.waitForSelector('.phead h1'); if (!(await text(T, '.phead')).includes('첫 내원')) throw new Error('첫 내원일 표시 없음');
if (!/1958\.03\.12 · 만 \d+세/.test(await text(T, '.rail'))) throw new Error('환자 목록에 생년월일·만 나이 없음');
await T.click('.pinfo summary'); await T.fill('#pi-birth', '1958-03-13'); await T.click('#f-pinfo button[type=submit]'); await T.waitForFunction(() => document.querySelector('.rail').textContent.includes('1958.03.13')); const invite = (await T.textContent('.phead b.mono')).trim(); step(`환자 등록, 초대 코드 ${invite}`);
await T.click('details:has(#f-goal) summary'); await T.fill('#g-text', '변형 숟가락을 사용하여 식사를 2주 이내에 수정된 독립(Mod I) 수준으로 수행한다.'); await T.fill('#g-due', localDate); await T.click('#f-goal button[type=submit]');
await T.waitForSelector('.goals li');
for (const [v, d] of [['48', '2026-09-16'], ['55', '2026-09-23']]) { await T.click('details:has(#f-score) summary'); await T.fill('#sc-value', v); await T.fill('#sc-date', d); await T.click('#f-score button[type=submit]'); await T.waitForTimeout(400); }
await T.click('[data-tab=home]'); await T.fill('#pg-title', '어깨 앞으로 들어올리기'); await T.fill('#pg-detail', '천천히 들어 올렸다 내립니다'); await T.fill('#pg-target', '5'); await T.selectOption('#pg-camera', 'shoulder_flexion'); await T.click('#f-prog button[type=submit]');
await T.waitForTimeout(400); await T.fill('#pg-title', '콩 옮기기'); await T.fill('#pg-detail', '콩 20개를 옮깁니다'); await T.selectOption('#pg-camera', ''); await T.click('#f-prog button[type=submit]');
await T.waitForFunction(() => document.querySelectorAll('.task').length === 2); step('목표·점수·가정 운동 입력');
await T.click('[data-tab=schedule]'); await T.fill('#ap-date', localDate); await T.fill('#ap-time', '23:50'); await T.selectOption('#ap-kind', 'reevaluation'); await T.fill('#ap-note', 'K-MBI 재평가'); await T.click('#f-appt button[type=submit]');
await T.waitForSelector('.appts .appt'); step('치료 일정(재평가) 추가');
await T.click('[data-act=t-dashboard]'); await T.waitForSelector('.tiles');
console.log('  대시보드 타일:', await text(T, '.tiles'));
if (!(await text(T, '.deadlines')).includes('재평가')) throw new Error('다가오는 기한에 재평가 없음');
step('치료사 대시보드: 오늘 일정·기한·환자 현황');

// ── 환자 쪽: 보호자로 가입 (?start=patient, 인증 코드) ──
await P.goto(APP + '?start=patient', { waitUntil: 'domcontentloaded' }); await P.waitForSelector('#f-signup');
if (!(await text(P, '#f-signup h2')).includes('환자·보호자 가입')) throw new Error('환자 가입 화면 아님');
const P_PW = 'Guard1an99';
await P.fill('#email', 'guardian.park@test.kr'); await P.fill('#password', P_PW); await P.fill('#password2', P_PW); await P.click('#f-signup button[type=submit]');
await P.waitForSelector('#f-signup-code'); const pm = await mail('guardian.park@test.kr');
await P.fill('#otp', pm.code); await P.click('#f-signup-code button'); await P.waitForSelector('#f-onboard'); step('보호자 이메일·비밀번호 가입 → 메일 코드로 인증');
await P.click('[data-relation=guardian]'); await P.fill('#ob-name', '박보호'); await P.fill('#ob-invite', 'SOAP-XXXXXX'); await P.check('#ob-consent'); await P.click('#f-onboard button[type=submit]');
await P.waitForSelector('.toast.error'); step('틀린 초대 코드 거부');
await P.fill('#ob-invite', invite.toLowerCase()); await P.click('#f-onboard button[type=submit]');
await P.waitForSelector('.pcards'); console.log('  환자 홈:', (await text(P, '.hello')).slice(0, 80), '|', (await text(P, '.pcards')).slice(0, 120));
if (!(await text(P, '.hello')).includes('보호자님')) throw new Error('보호자 인사말 없음');
step('보호자 가입 → 환자 홈 대시보드 (다음 치료·오늘 운동·꾸준함)');
await P.$eval('#sy-pain', (el) => { el.value = 7; el.dispatchEvent(new Event('input', { bubbles: true })); });
await P.fill('#sy-note', '어깨가 아침에 뻣뻣해요'); await P.click('#f-symptom button[type=submit]');
await P.waitForSelector('.symptoms'); await shot(P, '3-patient-home'); step('오늘 컨디션 저장 (통증 7 → 치료사에게 자동 알림)');
await P.click('[data-tab=exercise]'); await P.click('[data-act=manual]'); await P.waitForSelector('.done');
await P.click('[data-act=cam]'); await P.click('[data-side=left]'); if ((await P.getAttribute('[data-side=left]', 'aria-pressed')) !== 'true') throw new Error('왼팔 선택 안 됨');
await P.waitForSelector('#sim-btn:not([hidden])', { timeout: 15000 }); await P.click('#sim-btn');
await P.waitForFunction(() => +document.getElementById('c-reps').textContent >= 2, null, { timeout: 20000 });
await P.click('[data-cam=save]'); await P.waitForFunction(() => !document.getElementById('cam-modal')); step('운동 기록 (직접 + 카메라 시뮬레이션)');
await P.click('[data-tab=msg]'); await P.fill('#msg-text', '오늘 손이 좀 저려요'); await P.click('#f-msg button');
await P.waitForFunction(() => document.querySelectorAll('.msg.ai').length >= 2); step('보호자 메시지 + 자동 분류');

// ── 치료사: 대시보드 반영, 실시간 메시지, SOAP ──
await T.reload({ waitUntil: 'domcontentloaded' }); await T.waitForSelector('.tiles');
const tiles = await text(T, '.tiles'); console.log('  갱신된 타일:', tiles);
await shot(T, '2-therapist-dashboard');
if (!(await text(T, '.dash')).includes('통증 7/10')) throw new Error('대시보드에 컨디션 통증 경고 없음');
step('대시보드에 통증 경고·새 메시지 반영');
await T.click('.rail [data-act=pick]'); await T.click('[data-tab=schedule]'); await T.waitForSelector('.chart table'); await shot(T, '4-therapist-schedule');
step('환자별 일정·컨디션 탭');
await T.click('[data-tab=msg]'); await T.waitForSelector('.thread');
await P.fill('#msg-text', '실시간 테스트입니다'); await P.click('#f-msg button');
await T.waitForFunction(() => document.querySelector('.thread')?.textContent.includes('실시간 테스트'), null, { timeout: 10000 }); step('치료사 화면에 메시지 실시간 도착');
await T.fill('#msg-text', '통증 없는 범위까지만 해 주세요'); await T.click('#f-msg button');
await P.waitForFunction(() => document.querySelector('.thread')?.textContent.includes('통증 없는 범위'), null, { timeout: 10000 }); step('보호자 화면에 답장 실시간 도착');
await T.click('[data-act=t-dashboard]'); await T.click('.appt [data-act=write-visit]'); await T.waitForSelector('#f-visit');
await T.check('input[name=t][value=dumbbell]'); await T.selectOption('select[name="dumbbell.side"]', 'R'); await T.fill('input[name="dumbbell.weight"]', '2'); await T.fill('input[name="dumbbell.sets"]', '3'); await T.fill('input[name="dumbbell.reps"]', '10'); await T.fill('input[name="dumbbell.how"]', '팔꿈치 90도 유지');
await T.check('input[name=t][value=eating]'); await T.selectOption('select[name="eating.assist"]', 'MinA'); await T.fill('input[name="eating.minutes"]', '15');
await T.check('input[name=obs][value=guardian]'); await T.check('input[name=obs][value=fall_risk]');
await shot(T, '7-therapist-visit-form');
await T.click('#f-visit button[type=submit]'); await T.waitForSelector('.visit');
const vt = await text(T, '.main');
for (const want of ['2kg × 3세트 × 10회', '최소 도움 (Min A)', '낙상 위험 관찰', '치료별 변화']) if (!vt.includes(want)) throw new Error(`내원기록에 "${want}" 없음`);
step('내원기록: 치료 체크리스트 + 측면·무게·세트·횟수·도움 수준 저장');
await T.click('[data-act=visit-copy]'); await T.waitForFunction(() => document.querySelector('input[name="dumbbell.weight"]')?.value === '2' && document.querySelector('input[name=t][value=dumbbell]').checked);
await shot(T, '8-therapist-visits'); step('지난 내원기록 불러오기');
await T.click('[data-act=t-dashboard]'); await T.waitForSelector('[data-act=write-soap]'); step('내원기록 저장 → 일정 자동 완료 → SOAP 쓰기 버튼');
await T.click('[data-act=write-soap]'); await T.waitForSelector('#soap-s'); await T.click('[data-act=ai-draft]');
if (!(await T.inputValue('#soap-s')).includes('컨디션 기록')) throw new Error('SOAP 초안에 컨디션 기록 없음');
if (!(await T.inputValue('#soap-o')).includes('덤벨·웨이트 근력 운동 — 오른쪽, 2kg × 3세트 × 10회')) throw new Error('SOAP 초안 O에 내원기록 없음');
await T.click('[data-act=sign]'); await T.waitForSelector('.toast.error'); step('AI 초안(컨디션·내원기록 포함) 그대로는 서명 차단');
await T.fill('#soap-o', '- K-MBI 55/100 (이전 48)\n- 식사: 변형 숟가락 사용 시 최소 도움(Min A), 15분');
await T.fill('#soap-a', 'Rt 쥐기 지구력 저하로 식기 조작 제한. K-MBI 7점 향상으로 STG #1에 대해 진전 양호. 컨디션 기록상 통증 7/10으로 강도 조정 필요.');
await T.click('[data-act=sign]'); await T.waitForSelector('.note'); step('SOAP 서명 저장');

await P.reload({ waitUntil: 'domcontentloaded' }); await P.waitForSelector('.papp'); await P.click('[data-tab=records]'); await P.waitForSelector('.plain-summary');
if (!(await text(P, '.papp')).includes('치료사 평가')) throw new Error('환자 기록에 치료사 평가 없음');
if (!(await text(P, '.papp')).includes('덤벨·웨이트 근력 운동 — 오른쪽, 2kg × 3세트 × 10회')) throw new Error('환자 기록에 치료실에서 한 운동 없음');
step('환자 내 기록: 점수·통증 그래프·치료사 평가·치료실에서 한 운동');
await P.click('[data-act=logout]'); await P.waitForSelector('.hero'); step('로그아웃 → 홈페이지');

// ── 비밀번호 로그인, 틀린 비밀번호, 비밀번호 찾기 ──
await P.click('.lnav [data-mode=login]'); await P.waitForSelector('#f-login');
await P.fill('#email', 'guardian.park@test.kr'); await P.fill('#password', 'Wrong1234'); await P.click('#f-login button[type=submit]');
await P.waitForSelector('.toast.error'); if (!(await text(P, '.toast.error')).includes('맞지 않습니다')) throw new Error('틀린 비밀번호 안내 없음');
await P.fill('#password', P_PW); await P.click('#f-login button[type=submit]'); await P.waitForSelector('.pcards'); step('틀린 비밀번호 거부 → 올바른 비밀번호로 로그인');
await T.click('[data-act=logout]'); await T.waitForSelector('.hero');
await T.click('.lnav [data-mode=login]'); await T.click('[data-step=forgot]'); await T.fill('#email', 'ot.kim@test.kr'); await T.click('#f-forgot button[type=submit]');
await T.waitForSelector('[data-step=form]'); await sleep(800); const rm = await mail('ot.kim@test.kr');
if (!rm.subject.includes('비밀번호')) throw new Error('재설정 메일이 아님: ' + rm.subject);
await T.goto(rm.link, { waitUntil: 'domcontentloaded' }); await T.waitForSelector('#f-newpw');
await T.fill('#newpw', 'NewPass2027'); await T.fill('#newpw2', 'NewPass2027'); await T.click('#f-newpw button[type=submit]'); await T.waitForSelector('.tiles');
await T.click('[data-act=logout]'); await T.waitForSelector('.hero'); await T.click('.lnav [data-mode=login]');
await T.fill('#email', 'ot.kim@test.kr'); await T.fill('#password', 'NewPass2027'); await T.click('#f-login button[type=submit]'); await T.waitForSelector('.tiles');
step('비밀번호 찾기 → 재설정 메일 → 새 비밀번호로 로그인');
await b.close();
// 실시간 연결은 끊기면 자동으로 다시 연결된다. 실제로 안 되면 위의 "실시간 도착" 단계가 실패한다.
const unexpected = errs.filter((e) => !/초대 코드|400 \(Bad Request\)|ERR_TOO_MANY_RETRIES|ERR_CERT|net::ERR|WebSocket connection to|Invalid login credentials/.test(e)); // 마지막: 틀린 비밀번호 시험은 일부러 하는 것
if (unexpected.length) { console.error('예상하지 못한 오류:', unexpected); process.exit(1); }
console.log('모든 단계 통과');
