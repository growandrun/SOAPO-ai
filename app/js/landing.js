/* 로그인 전 화면: 홈페이지, 로그인·가입, 첫 로그인 후 가입 마무리 */
import { state } from "./state.js";
import { h } from "./util.js";

const brand = (size = "") => `<div class="brand"><img class="logo ${size === "big" ? "lg" : ""}" src="assets/logo.png" alt="SOAPO.ai" width="900" height="173"></div>`;

export function landingHtml() {
  return `<div class="landing">
  <header class="lnav">
    ${brand()}
    <nav class="toolbar"><button class="btn" data-act="go-auth" data-mode="login">로그인</button></nav>
  </header>

  <section class="hero">
    <div class="hero-copy">
      <span class="label">작업치료 SOAP 기록 · 가정 재활</span>
      <h1>치료실의 기록과<br>집에서의 재활을 하나로 잇습니다</h1>
      <p class="lede">작업치료사는 AI의 도움으로 SOAP 노트를 빠짐없이 쓰고, 환자와 보호자는 집에서 휴대폰 카메라로 운동을 기록합니다. 집에서 쌓인 기록은 다음 치료 계획으로 바로 이어집니다.</p>
      <div class="cta">
        <button class="btn primary lg" data-act="go-auth" data-mode="patient">환자·보호자로 시작하기</button>
        <button class="btn lg" data-act="go-auth" data-mode="therapist">작업치료사로 시작하기</button>
      </div>
      <p class="small muted">비밀번호 없이 이메일로 가입합니다. 이미 가입했다면 <button class="linklike" data-act="go-auth" data-mode="login">로그인</button>하세요.</p>
    </div>
    <figure class="hero-note" aria-label="SOAP 노트 예시">
      <div class="hn-head"><span class="mono small">9/30 · 박○○ · 우측 편마비</span><span class="pill ok">서명 완료</span></div>
      <dl>
        <dt>S</dt><dd>“숟가락을 오래 들면 손이 떨려요.”</dd>
        <dt>O</dt><dd>K-MBI <b class="mono">56</b>/100 (이전 52) · 식사 <b>Min A</b>, 18분</dd>
        <dt>A</dt><dd>굵은 손잡이 적용 시 수행 향상. STG #1 진전 양호.</dd>
        <dt>P</dt><dd>주 5회 30분 · 가정 운동 어깨 굽힘 20회 · 10/7 재평가</dd>
      </dl>
      <div class="hn-checks"><span class="pill ok">측정값 있음</span><span class="pill ok">목표와 연결</span><span class="pill ok">재평가일 있음</span></div>
      <figcaption class="small muted">AI가 기록을 점검해 빠진 항목을 알려 줍니다</figcaption>
    </figure>
  </section>

  <section class="flow">
    <h2>치료가 이렇게 이어집니다</h2>
    <ol class="steps">
      <li><b>평가와 처방</b><span>치료사가 평가 점수, 목표, 가정 운동을 입력하고 환자에게 초대 코드를 줍니다.</span></li>
      <li><b>집에서 실천</b><span>환자·보호자가 카메라로 운동 각도와 횟수를 재고, 매일 통증과 컨디션을 남깁니다.</span></li>
      <li><b>다음 치료로</b><span>AI가 기록을 모아 SOAP 초안과 위험 신호로 정리하고, 치료사가 확인하고 서명합니다.</span></li>
    </ol>
  </section>

  <section class="audience">
    <div class="aud">
      <h3>작업치료사에게</h3>
      <ul>
        <li>오늘 일정, 확인이 필요한 환자, 다가오는 재평가를 한 화면에서</li>
        <li>SOAP 초안 자동 작성과 실시간 기록 점검 (측정값·도움 수준·목표 연결·복사 의심)</li>
        <li>환자별 가정 운동 수행률, 통증 추이, 평가 점수 그래프</li>
        <li>서명한 기록은 수정할 수 없어 의무기록처럼 보관</li>
      </ul>
      <button class="btn" data-act="go-auth" data-mode="therapist">작업치료사로 시작하기</button>
    </div>
    <div class="aud">
      <h3>환자·보호자에게</h3>
      <ul>
        <li>오늘 해야 할 운동과 다음 치료 날짜를 첫 화면에서</li>
        <li>휴대폰 카메라로 팔 각도와 횟수를 자동으로 측정</li>
        <li>매일 통증·피로·기분을 기록하면 치료사가 추이를 확인</li>
        <li>어려운 치료 용어는 쉬운 말로 바꿔서 보여 드려요</li>
      </ul>
      <button class="btn" data-act="go-auth" data-mode="patient">환자·보호자로 시작하기</button>
    </div>
  </section>

  <section class="trust">
    <div><b>영상은 기기 밖으로 나가지 않습니다</b><span>카메라 영상은 휴대폰 안에서만 분석하고, 횟수와 각도 숫자만 저장합니다.</span></div>
    <div><b>담당 관계만 볼 수 있습니다</b><span>치료사는 자신이 등록한 환자만, 환자는 자신의 기록만 볼 수 있도록 서버에서 막습니다.</span></div>
    <div><b>AI는 제안하고, 판단은 치료사가 합니다</b><span>AI 초안과 경고는 확인용이며, 서명과 치료 결정은 면허를 가진 치료사의 몫입니다.</span></div>
  </section>

  <footer class="lfoot small muted">
    <span>SOAPO.ai · 교육·연구용 서비스입니다. 응급 상황은 119에 연락하세요.</span>
  </footer>
</div>`;
}

const AUTH_TEXT = {
  login: { title: "로그인", desc: "가입할 때 쓴 이메일과 비밀번호를 입력하세요." },
  patient: { title: "환자·보호자 가입", desc: "이메일과 비밀번호를 정하고 이메일 인증을 마치면, 담당 작업치료사에게 받은 초대 코드를 입력합니다." },
  therapist: { title: "작업치료사 가입", desc: "이메일과 비밀번호를 정하고 이메일 인증을 마치면, 이름과 면허 번호를 입력합니다." },
};
const pwHint = "8자 이상, 영문과 숫자를 섞어 주세요.";
const codeForm = (id, label = "인증 코드") => `<form id="${id}" class="field" style="gap:.6rem">
    <label class="label" for="otp">${label}</label>
    <input type="text" id="otp" class="code-input" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required placeholder="숫자 코드">
    <button class="btn primary" type="submit">확인</button>
  </form>`;

function authBody() {
  const t = AUTH_TEXT[state.authMode];
  const email = `<div class="field"><label class="label" for="email">이메일</label><input type="email" id="email" required placeholder="you@example.com" value="${h(state.email)}" autocomplete="email"></div>`;
  switch (state.authStep) {
    case "form":
      return state.authMode === "login"
        ? `<form class="card" id="f-login">
            <h2>${t.title}</h2><p class="small muted">${t.desc}</p>
            ${email}
            <div class="field"><label class="label" for="password">비밀번호</label><input type="password" id="password" required autocomplete="current-password"></div>
            <button class="btn primary" type="submit">로그인</button>
            <div class="toolbar small"><button type="button" class="linklike" data-act="auth-step" data-step="forgot">비밀번호를 잊었나요?</button><span class="muted">·</span><button type="button" class="linklike" data-act="auth-step" data-step="code-email">메일로 받은 코드로 로그인</button></div>
          </form>`
        : `<form class="card" id="f-signup">
            <h2>${t.title}</h2><p class="small muted">${t.desc}</p>
            ${email}
            <div class="field"><label class="label" for="password">비밀번호</label><input type="password" id="password" required minlength="8" autocomplete="new-password" aria-describedby="pw-hint"><span class="small muted" id="pw-hint">${pwHint}</span></div>
            <div class="field"><label class="label" for="password2">비밀번호 확인</label><input type="password" id="password2" required minlength="8" autocomplete="new-password"></div>
            <button class="btn primary" type="submit">가입하기</button>
          </form>`;
    case "confirm":
      return `<div class="card">
          <h2>이메일을 인증해 주세요</h2>
          <p><span class="mono">${h(state.email)}</span>로 인증 메일을 보냈습니다. 스팸함도 확인해 주세요.</p>
          <p class="small muted">이 기기에서 메일의 링크를 누르면 바로 넘어갑니다. 다른 기기에서 메일을 열었다면 메일 속 인증 코드를 입력하세요.</p>
          ${codeForm("f-signup-code")}
          <div class="toolbar"><button class="btn ghost" data-act="resend-signup">메일 다시 보내기</button><button class="btn ghost" data-act="auth-step" data-step="form">처음으로</button></div>
        </div>`;
    case "code-email":
      return `<form class="card" id="f-code-email">
          <h2>메일 코드로 로그인</h2><p class="small muted">비밀번호 없이, 메일로 받은 코드나 링크로 로그인합니다. 이미 가입한 이메일만 쓸 수 있습니다.</p>
          ${email}
          <button class="btn primary" type="submit">로그인 메일 받기</button>
          <button type="button" class="linklike" data-act="auth-step" data-step="form">비밀번호로 로그인</button>
        </form>`;
    case "code-sent":
      return `<div class="card">
          <h2>메일을 확인하세요</h2>
          <p><span class="mono">${h(state.email)}</span>로 로그인 메일을 보냈습니다.</p>
          ${codeForm("f-code")}
          <div class="toolbar"><button class="btn ghost" data-act="resend">메일 다시 보내기</button><button class="btn ghost" data-act="auth-step" data-step="form">비밀번호로 로그인</button></div>
        </div>`;
    case "forgot":
      return `<form class="card" id="f-forgot">
          <h2>비밀번호 찾기</h2><p class="small muted">가입한 이메일로 비밀번호를 다시 정하는 링크를 보내 드립니다.</p>
          ${email}
          <button class="btn primary" type="submit">재설정 메일 받기</button>
          <button type="button" class="linklike" data-act="auth-step" data-step="form">로그인으로 돌아가기</button>
        </form>`;
    case "forgot-sent":
      return `<div class="card">
          <h2>메일을 확인하세요</h2>
          <p><span class="mono">${h(state.email)}</span>로 비밀번호 재설정 링크를 보냈습니다. 링크를 누르면 새 비밀번호를 정하는 화면이 열립니다.</p>
          <p class="small muted">가입하지 않은 이메일이면 메일이 가지 않습니다.</p>
          <button class="btn ghost" data-act="auth-step" data-step="form">로그인으로 돌아가기</button>
        </div>`;
  }
  return "";
}

export function authHtml() {
  const switcher = state.authStep !== "form" ? "" : state.authMode === "login"
    ? `<p class="small muted">처음이신가요? <button class="linklike" data-act="go-auth" data-mode="patient">환자·보호자 가입</button> · <button class="linklike" data-act="go-auth" data-mode="therapist">작업치료사 가입</button></p>`
    : `<p class="small muted">이미 가입했나요? <button class="linklike" data-act="go-auth" data-mode="login">로그인</button></p>`;
  return `<main class="auth">
    <button class="linklike back" data-act="go-home">← 처음 화면</button>
    ${brand("big")}
    ${authBody()}
    ${switcher}
  </main>`;
}

/** 비밀번호 재설정 링크로 들어왔을 때: 새 비밀번호 정하기 (로그인 후 설정에서도 사용) */
export function resetHtml() {
  return `<main class="auth">${brand("big")}
    <form class="card" id="f-newpw">
      <h2>새 비밀번호 정하기</h2><p class="small muted mono">${h(state.email)}</p>
      <div class="field"><label class="label" for="newpw">새 비밀번호</label><input type="password" id="newpw" required minlength="8" autocomplete="new-password"><span class="small muted">${pwHint}</span></div>
      <div class="field"><label class="label" for="newpw2">새 비밀번호 확인</label><input type="password" id="newpw2" required minlength="8" autocomplete="new-password"></div>
      <button class="btn primary" type="submit">비밀번호 저장</button>
    </form></main>`;
}

export function onboardHtml() {
  const pt = state.role === "patient";
  const guardian = state.relation === "guardian";
  return `<main class="auth"><form class="card" id="f-onboard">
    <h2>가입을 마무리해 주세요</h2><p class="small muted mono">${h(state.email)}</p>
    <div class="seg" role="group" aria-label="가입 유형">
      <button type="button" data-act="role" data-role="patient" aria-pressed="${pt}">환자·보호자</button>
      <button type="button" data-act="role" data-role="therapist" aria-pressed="${!pt}">작업치료사</button>
    </div>
    ${pt ? `
      <div class="seg" role="group" aria-label="누가 사용하나요">
        <button type="button" data-act="relation" data-relation="self" aria-pressed="${!guardian}">환자 본인</button>
        <button type="button" data-act="relation" data-relation="guardian" aria-pressed="${guardian}">보호자</button>
      </div>
      <div class="field"><label class="label" for="ob-name">${guardian ? "보호자 이름" : "이름"}</label><input type="text" id="ob-name" required autocomplete="name"></div>
      <div class="field"><label class="label" for="ob-invite">치료사에게 받은 초대 코드</label><input type="text" id="ob-invite" required placeholder="SOAP-XXXXXX" autocapitalize="characters"></div>
      <p class="small muted">${guardian ? "보호자로 가입하면 환자를 대신해 운동과 컨디션을 기록하고 치료사와 대화할 수 있습니다." : "초대 코드가 없다면 담당 작업치료사에게 요청하세요."}</p>`
    : `
      <div class="field"><label class="label" for="ob-name">이름</label><input type="text" id="ob-name" required autocomplete="name"></div>
      <div class="field"><label class="label" for="ob-license">작업치료사 면허 번호</label><input type="text" id="ob-license" required></div>`}
    <label class="small" style="display:flex;gap:.5rem;align-items:start"><input type="checkbox" id="ob-consent" required> 건강정보(민감정보)를 재활 치료 목적으로 수집·이용하는 데 동의합니다.</label>
    <div class="toolbar"><button class="btn primary" type="submit">가입 완료</button><button class="btn ghost" type="button" data-act="logout">로그아웃</button></div>
  </form></main>`;
}

export function setupHtml() {
  return `<main class="auth"><div class="card"><h2>서버 연결이 필요합니다</h2>
    <p class="small">아직 Supabase가 연결되지 않았습니다. README의 "실제 서비스로 올리기"를 따라 설정하세요.</p></div></main>`;
}

export function errorHtml() {
  return `<main class="auth"><div class="card"><h2>불러오지 못했습니다</h2><p class="small">${h(state.error)}</p>
    <div class="toolbar"><button class="btn primary" data-act="retry">다시 시도</button><button class="btn ghost" data-act="logout">로그아웃</button></div></div></main>`;
}
