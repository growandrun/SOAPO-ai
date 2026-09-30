// 전체 흐름 테스트: 로컬 Supabase(npx supabase start)와 앱(npm run dev)이 켜진 상태에서 npm run test:e2e
// 매번 새 DB가 필요하므로 먼저 npx supabase db reset 을 실행하세요.
import { chromium } from 'playwright';
const MAIL = 'http://127.0.0.1:54324';
const APP = 'http://localhost:3000/';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function mail(to) {
  for (let i = 0; i < 30; i++) {
    const r = await (await fetch(`${MAIL}/api/v1/search?query=to:${encodeURIComponent(to)}`)).json();
    if (r.messages?.length) {
      const m = await (await fetch(`${MAIL}/api/v1/message/${r.messages[0].ID}`)).json();
      const link = (m.HTML.match(/href="([^"]+)"/) || [])[1]?.replace(/&amp;/g, '&');
      const code = (m.Text.match(/\b(\d{6})\b/) || [])[1];
      return { subject: m.Subject, link, code };
    }
    await sleep(500);
  }
  throw new Error('no mail for ' + to);
}
await fetch(`${MAIL}/api/v1/messages`, { method: 'DELETE' });
const b = await chromium.launch();
const errs = [];
const mk = async (name, vp) => { const c = await b.newContext({ ignoreHTTPSErrors: true, viewport: vp }); const p = await c.newPage();
  p.on('pageerror', e => errs.push(`${name} pageerror: ${e.message}`)); p.on('console', m => m.type() === 'error' && !/fonts|ERR_CERT/.test(m.text()) && errs.push(`${name}: ${m.text()}`)); return p; };
const T = await mk('T', { width: 1200, height: 900 }), P = await mk('P', { width: 390, height: 844 });
const step = (s) => console.log('✓', s);

// 치료사: 매직링크로 로그인
await T.goto(APP); await T.fill('#email', 'ot.kim@test.kr'); await T.click('#f-email button[type=submit]');
await T.waitForSelector('#otp'); const tm = await mail('ot.kim@test.kr'); step(`메일 수신: "${tm.subject}", 링크 ${!!tm.link}, 코드 ${tm.code}`);
await T.goto(tm.link); await T.waitForSelector('#f-onboard'); step('매직링크 → 첫 로그인 화면');
await T.click('[data-role=therapist]'); await T.fill('#ob-name', '김하늘'); await T.fill('#ob-license', '제12345호'); await T.check('#ob-consent'); await T.click('#f-onboard button[type=submit]');
await T.waitForSelector('#f-patient'); step('치료사 가입 → 환자 등록 화면');
await T.fill('#np-name', '박영수'); await T.fill('#np-birth', '1958'); await T.selectOption('#np-sex', '남'); await T.fill('#np-dx', '뇌경색 · 우측 편마비'); await T.click('#f-patient button[type=submit]');
await T.waitForSelector('.phead h1'); const invite = (await T.textContent('.phead b.mono')).trim(); step(`환자 등록, 초대 코드 ${invite}`);
await T.click('details:has(#f-goal) summary'); await T.fill('#g-text', '변형 숟가락을 사용하여 식사를 2주 이내에 수정된 독립(Mod I) 수준으로 수행한다.'); await T.click('#f-goal button[type=submit]');
await T.waitForSelector('.goals li'); step('목표 추가');
for (const [v, d] of [['48', '2026-09-16'], ['55', '2026-09-23']]) { await T.click('details:has(#f-score) summary'); await T.fill('#sc-value', v); await T.fill('#sc-date', d); await T.click('#f-score button[type=submit]'); await T.waitForTimeout(400); }
await T.waitForSelector('.chart svg'); step('점수 2건 → 추이 그래프');
await T.click('[data-tab=home]'); await T.fill('#pg-title', '어깨 앞으로 들어올리기'); await T.fill('#pg-detail', '천천히 들어 올렸다 내립니다'); await T.fill('#pg-target', '5'); await T.selectOption('#pg-camera', 'shoulder_flexion'); await T.click('#f-prog button[type=submit]');
await T.waitForTimeout(500); await T.fill('#pg-title', '콩 옮기기'); await T.fill('#pg-detail', '콩 20개를 옮깁니다'); await T.selectOption('#pg-camera', ''); await T.click('#f-prog button[type=submit]');
await T.waitForFunction(() => document.querySelectorAll('.task').length === 2); step('가정 프로그램 2개 처방');
await T.click('[data-tab=msg]'); await T.waitForSelector('.panel');

// 환자: 코드로 로그인 + 초대 코드 가입
await P.goto(APP); await P.fill('#email', 'patient.park@test.kr'); await P.click('#f-email button[type=submit]');
await P.waitForSelector('#otp'); const pm = await mail('patient.park@test.kr');
await P.fill('#otp', pm.code); await P.click('#f-code button'); await P.waitForSelector('#f-onboard'); step('6자리 코드로 로그인');
await P.fill('#ob-name', '박영수'); await P.fill('#ob-invite', 'SOAP-XXXXXX'); await P.check('#ob-consent'); await P.click('#f-onboard button[type=submit]');
await P.waitForSelector('.toast.error'); step(`틀린 초대 코드 거부: "${await P.textContent('.toast.error')}"`);
await P.fill('#ob-invite', invite.toLowerCase()); await P.click('#f-onboard button[type=submit]');
await P.waitForSelector('.papp h1'); step('초대 코드로 환자 가입 → 오늘 할 일');
await P.click('[data-act=manual]'); await P.waitForSelector('.done'); step('수동 운동 기록');
await P.click('[data-act=cam]'); await P.waitForSelector('#sim-btn:not([hidden])', { timeout: 15000 }); await P.click('#sim-btn');
await P.waitForFunction(() => +document.getElementById('c-reps').textContent >= 3, null, { timeout: 20000 });
await P.$eval('#c-pain', el => { el.value = 6; el.dispatchEvent(new Event('input', { bubbles: true })); }); await P.fill('#c-comment', '어깨 앞쪽이 당겨요');
await P.click('[data-cam=save]'); await P.waitForFunction(() => !document.getElementById('cam-modal')); step('카메라(시뮬레이션) 기록 저장, 통증 6');
await P.click('[data-tab=msg]'); await P.fill('#msg-text', '오늘 손이 좀 저려요'); await P.click('#f-msg button');
await P.waitForFunction(() => document.querySelectorAll('.msg.ai').length >= 2); step('환자 메시지 + AI 분류 안내');

// 치료사: 실시간 메시지 & 검진
await T.reload(); await T.waitForSelector('.rail'); // 가입 상태 반영
await T.click('[data-tab=msg]'); await T.waitForSelector('.thread');
console.log('  대화:', (await T.textContent('.thread')).replace(/\s+/g, ' ').slice(0, 200));
await P.fill('#msg-text', '실시간 테스트입니다'); await P.click('#f-msg button');
await T.waitForFunction(() => document.querySelector('.thread')?.textContent.includes('실시간 테스트'), null, { timeout: 10000 }); step('치료사 화면에 새 메시지 실시간 도착');
await T.fill('#msg-text', '통증 없는 범위까지만 해 주세요'); await T.click('#f-msg button');
await P.waitForFunction(() => document.querySelector('.thread')?.textContent.includes('통증 없는 범위'), null, { timeout: 10000 }); step('환자 화면에 답장 실시간 도착');
await T.click('[data-tab=overview]'); console.log('  검진:', (await T.textContent('.alerts')).replace(/\s+/g, ' '));

// SOAP: 초안은 서명 불가, 채우면 서명
await T.click('[data-tab=soap]'); await T.click('[data-act=ai-draft]'); await T.click('[data-act=sign]');
await T.waitForSelector('.toast.error'); step('초안 그대로는 서명 차단');
await T.fill('#soap-o', '- K-MBI 55/100 (이전 48)\n- 식사: 변형 숟가락 사용 시 최소 도움(Min A), 15분');
await T.fill('#soap-a', 'Rt 쥐기 지구력 저하로 식기 조작 제한. K-MBI 7점 향상으로 STG #1에 대해 진전 양호. 가정 운동 중 통증 6/10 보고되어 강도 조정 필요.');
await T.click('[data-act=sign]'); await T.waitForSelector('.note'); step('SOAP 서명 저장 → 이력');


await P.reload(); await P.waitForSelector('.papp'); await P.click('[data-tab=progress]'); await P.waitForSelector('.plain-summary');
console.log('  환자 요약:', (await P.textContent('.plain-summary')).replace(/\s+/g, ' ').slice(0, 260));

await P.click('[data-act=logout]'); await P.waitForSelector('#f-email'); step('로그아웃');
await b.close();
const unexpected = errs.filter((e) => !/초대 코드|400 \(Bad Request\)|ERR_TOO_MANY_RETRIES/.test(e));
if (unexpected.length) { console.error('예상하지 못한 오류:', unexpected); process.exit(1); }
console.log('모든 단계 통과');
