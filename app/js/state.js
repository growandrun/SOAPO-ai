/* 화면 상태 (한 곳에서 관리) */
export const state = {
  phase: "loading",        // loading | setup | landing | auth | reset | onboard | ready | error
  userId: null, email: "", error: "",
  authMode: "login",       // login | patient | therapist
  authStep: "form",        // form | confirm | code-email | code-sent | forgot | forgot-sent
  recovery: false,         // 비밀번호 재설정 링크로 들어옴
  role: "patient", relation: "self",
  // 치료사
  tView: "dashboard",      // dashboard | patient | new
  selected: null, tab: "overview", draft: null, draftUsedAI: false,
  // 환자
  ptab: "home", editSymptom: false,
};

/* 가입하려던 유형은 메일 링크로 돌아와도 기억해야 하므로 브라우저에 잠시 저장 */
const KEY = "soapo-intent";
export const intent = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
  clear() { try { localStorage.removeItem(KEY); } catch {} },
};
