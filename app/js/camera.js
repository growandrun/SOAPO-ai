/* 카메라 운동 측정 (MediaPipe Pose, 브라우저 안에서만 처리)
   영상은 서버로 보내지 않고, 계산한 횟수·최대 각도만 onSave로 넘긴다. */

import { h } from "./util.js";

const MP_VER = "0.10.14";
let cam = null;

const SIDE_KEY = "soapo-cam-side", VOICE_KEY = "soapo-cam-voice";
const savedSide = () => { try { return localStorage.getItem(SIDE_KEY); } catch { return null; } };
const voiceOn = () => { try { return localStorage.getItem(VOICE_KEY) !== "off"; } catch { return true; } };

/** 측정할 동작: 각도 계산 방법과 자세 안내 */
export const METRICS = {
  shoulder_flexion:   { label: "어깨 앞으로 들기", view: "몸을 옆으로 돌려 옆모습이 보이게 서거나 앉아 주세요.", angle: (lm, side) => shoulderAngle(lm, side) },
  shoulder_abduction: { label: "어깨 옆으로 벌리기", view: "카메라를 정면으로 보고 서거나 앉아 주세요.", angle: (lm, side) => shoulderAngle(lm, side) },
  elbow_flexion:      { label: "팔꿈치 굽히기", view: "팔 전체가 보이게 옆모습이나 정면으로 앉아 주세요.", angle: (lm, side) => 180 - elbowAngle(lm, side) },
};
export const metricOf = (key) => METRICS[key] ?? METRICS.shoulder_flexion;

/** 음성 안내 (한국어). 기기에 음성이 없으면 조용히 넘어간다 */
function say(text) {
  if (!cam?.voice || !("speechSynthesis" in window)) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = "ko-KR"; u.rate = 0.95; speechSynthesis.speak(u); } catch { /* 무시 */ }
}
const KO_NUM = ["", "하나", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟", "아홉", "열"];

export function openCamera(prog, affectedSide, onSave) {
  const side = savedSide() ?? (affectedSide === "left" ? "left" : "right");
  const metric = metricOf(prog.camera);
  cam = { prog, metric, reps: 0, maxAngle: 0, up: false, stream: null, raf: 0, sim: false, landmarker: null, side, onSave, counting: false, voice: voiceOn(), lostSince: 0 };
  const m = document.createElement("div"); m.className = "modal"; m.id = "cam-modal";
  m.innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-label="카메라 운동">
    <div class="toolbar" style="justify-content:space-between"><h2>${h(prog.title)}</h2><button class="btn ghost" data-cam="close">닫기</button></div>
    <p class="small muted">${h(prog.detail)} ${metric.label}: 팔이 ${prog.targetAngle}° 이상 움직였다 돌아오면 1회로 셉니다. 영상은 이 기기 안에서만 분석하고 저장하지 않습니다.</p>
    <ol class="cam-guide" id="cam-guide">
      <li>휴대폰을 <b>1.5~2m 앞</b>, 가슴 높이에 세워 주세요 (의자나 선반에 기대 두면 좋아요).</li>
      <li>${metric.view}</li>
      <li><b>머리부터 허리까지</b> 화면에 다 보이면 아래 <b>시작</b>을 눌러 주세요. 3초 뒤부터 셉니다.</li>
    </ol>
    <div class="seg" role="group" aria-label="측정할 팔">
      <button type="button" data-cam="side" data-side="right" aria-pressed="${side === "right"}">오른팔 측정</button>
      <button type="button" data-cam="side" data-side="left" aria-pressed="${side === "left"}">왼팔 측정</button>
    </div>
    <div class="stage"><video id="cam-video" playsinline muted></video><canvas id="cam-canvas"></canvas>
      <div class="hud"><b id="hud-angle">0°</b><b id="hud-reps">0 / ${prog.target}</b></div>
      <div class="center" id="cam-center">카메라와 자세 인식 모델을 준비하는 중…</div></div>
    <div class="bigcount"><div><span class="small muted">횟수</span><strong id="c-reps">0</strong></div><div><span class="small muted">최대 각도</span><strong id="c-max">0°</strong></div><div><span class="small muted">목표</span><strong>${prog.target}</strong></div></div>
    <div class="field"><label class="label" for="c-pain">운동 중 통증 (0 없음 – 10 매우 심함): <span id="c-pain-v" class="mono">0</span></label><input type="range" id="c-pain" min="0" max="10" value="0"></div>
    <div class="field"><label class="label" for="c-comment">치료사에게 남길 말 (선택)</label><input type="text" id="c-comment" placeholder="예: 오늘은 어깨가 덜 당겼어요"></div>
    <div class="toolbar"><button class="btn primary lg" data-cam="go" id="go-btn">시작</button><button class="btn" data-cam="voice" aria-pressed="${cam.voice}">${cam.voice ? "소리 안내 켜짐" : "소리 안내 꺼짐"}</button></div>
    <div class="toolbar"><button class="btn primary" data-cam="save">기록 저장</button><button class="btn" data-cam="sim" id="sim-btn" hidden>시뮬레이션으로 체험</button></div>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener("click", onClick);
  m.querySelector("#c-pain").addEventListener("input", (e) => { m.querySelector("#c-pain-v").textContent = e.target.value; });
  start().catch((e) => {
    if (!cam) return;
    m.querySelector("#cam-center").textContent = `카메라를 쓸 수 없습니다 (${e.message}). 카메라 권한을 허용했는지 확인해 주세요. 시뮬레이션으로 화면을 체험할 수도 있어요.`;
    m.querySelector("#sim-btn").hidden = false;
  });
}

async function onClick(e) {
  const b = e.target.closest("[data-cam]"); if (!b || !cam) return;
  if (b.dataset.cam === "close") return close();
  if (b.dataset.cam === "sim") return simulate();
  if (b.dataset.cam === "voice") {
    cam.voice = !cam.voice;
    try { localStorage.setItem(VOICE_KEY, cam.voice ? "on" : "off"); } catch {}
    b.setAttribute("aria-pressed", String(cam.voice)); b.textContent = cam.voice ? "소리 안내 켜짐" : "소리 안내 꺼짐";
    return;
  }
  if (b.dataset.cam === "go") return countdown(b);
  if (b.dataset.cam === "side") {
    cam.side = b.dataset.side; cam.reps = 0; cam.maxAngle = 0; cam.up = false;
    try { localStorage.setItem(SIDE_KEY, cam.side); } catch {}
    document.querySelectorAll('[data-cam="side"]').forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.side === cam.side)));
    return;
  }
  if (b.dataset.cam === "save") {
    const box = document.getElementById("cam-modal");
    const result = { programId: cam.prog.id, reps: cam.reps, maxAngle: cam.maxAngle, pain: +box.querySelector("#c-pain").value, comment: box.querySelector("#c-comment").value.trim(), source: "camera" };
    b.disabled = true;
    try { await cam.onSave(result); close(); } catch { b.disabled = false; }
  }
}

async function start() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("이 브라우저는 카메라를 지원하지 않거나 https가 아닙니다");
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false });
  if (!cam) { stream.getTracks().forEach((t) => t.stop()); return; }
  cam.stream = stream;
  const v = document.getElementById("cam-video"); v.srcObject = stream; await v.play();
  const vision = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/vision_bundle.mjs`);
  const files = await vision.FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/wasm`);
  const lm = await vision.PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task" },
    runningMode: "VIDEO", numPoses: 1,
  });
  if (!cam) { lm.close(); return; }
  cam.landmarker = lm;
  document.getElementById("cam-center").hidden = true;
  const loop = () => {
    if (!cam || cam.sim) return;
    const res = cam.landmarker.detectForVideo(v, performance.now());
    const pts = res.landmarks?.[0];
    if (pts && visible(pts, cam.side)) { cam.lostSince = 0; hint(""); draw(pts, v); if (cam.counting) onAngle(Math.round(cam.metric.angle(pts, cam.side))); }
    else {
      cam.lostSince ||= performance.now();
      if (performance.now() - cam.lostSince > 1500) hint("몸이 화면에 다 보이지 않아요. 조금 뒤로 물러나 머리부터 허리까지 보이게 해 주세요.");
    }
    cam.raf = requestAnimationFrame(loop);
  };
  loop();
}

/** 측정 팔의 어깨·팔꿈치·손목·엉덩이가 화면 안에 보이는지 */
function visible(lm, side) {
  const ids = side === "right" ? [12, 14, 16, 24] : [11, 13, 15, 23];
  return ids.every((i) => lm[i] && (lm[i].visibility ?? 1) > 0.5 && lm[i].x > 0 && lm[i].x < 1 && lm[i].y > 0 && lm[i].y < 1);
}
function hint(text) {
  const el = document.getElementById("cam-center"); if (!el || cam?.sim) return;
  el.hidden = !text; if (text) el.textContent = text;
}
/** 3, 2, 1 뒤에 세기 시작 */
function countdown(btn) {
  if (!cam || cam.counting) return;
  btn.disabled = true;
  document.getElementById("cam-guide")?.setAttribute("hidden", "");
  let n = 3;
  const tick = () => {
    if (!cam) return;
    if (n === 0) { cam.counting = true; btn.textContent = "세는 중"; say("시작"); return; }
    btn.textContent = String(n); say(KO_NUM[n]); n--; setTimeout(tick, 1000);
  };
  tick();
}

/** 어깨–팔꿈치–손목 사이 각도 (팔을 펴면 180°) */
export function elbowAngle(lm, side) {
  const [S, E, W] = side === "right" ? [lm[12], lm[14], lm[16]] : [lm[11], lm[13], lm[15]];
  const a = Math.atan2(S.y - E.y, S.x - E.x), b = Math.atan2(W.y - E.y, W.x - E.x);
  let deg = Math.abs((b - a) * 180 / Math.PI); if (deg > 180) deg = 360 - deg;
  return Math.round(deg);
}

/** 엉덩이–어깨–팔꿈치 각도 ≈ 어깨 굽힘(옆모습)·벌림(정면). 오른쪽: 12,14,24 / 왼쪽: 11,13,23 */
export function shoulderAngle(lm, side) {
  const [S, E, H] = side === "right" ? [lm[12], lm[14], lm[24]] : [lm[11], lm[13], lm[23]];
  const a = Math.atan2(H.y - S.y, H.x - S.x), b = Math.atan2(E.y - S.y, E.x - S.x);
  let deg = Math.abs((b - a) * 180 / Math.PI); if (deg > 180) deg = 360 - deg;
  return Math.round(deg);
}

function onAngle(deg) {
  if (!cam) return;
  cam.maxAngle = Math.max(cam.maxAngle, deg);
  if (!cam.up && deg >= cam.prog.targetAngle) cam.up = true;
  if (cam.up && deg < 30) {
    cam.up = false; cam.reps++;
    if (cam.reps === cam.prog.target) say("목표를 다 채웠어요. 잘하셨어요");
    else say(KO_NUM[cam.reps] ?? String(cam.reps));
  }
  const $ = (id) => document.getElementById(id);
  $("hud-angle").textContent = deg + "°";
  $("hud-reps").textContent = `${cam.reps} / ${cam.prog.target}`;
  $("c-reps").textContent = cam.reps;
  $("c-max").textContent = cam.maxAngle + "°";
}

function draw(lm, v) {
  const c = document.getElementById("cam-canvas"); if (!c) return;
  c.width = v.videoWidth; c.height = v.videoHeight;
  const g = c.getContext("2d"); g.clearRect(0, 0, c.width, c.height);
  g.lineWidth = 4; g.strokeStyle = "#4cc39d";
  [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24]].forEach(([a, b]) => {
    g.beginPath(); g.moveTo(lm[a].x * c.width, lm[a].y * c.height); g.lineTo(lm[b].x * c.width, lm[b].y * c.height); g.stroke();
  });
  g.fillStyle = "#ffffff";
  [11, 12, 13, 14, 15, 16, 23, 24].forEach((i) => { g.beginPath(); g.arc(lm[i].x * c.width, lm[i].y * c.height, 5, 0, 7); g.fill(); });
}

function simulate() {
  if (!cam || cam.sim) return; cam.sim = true; cam.counting = true;
  document.getElementById("cam-guide")?.setAttribute("hidden", "");
  document.getElementById("cam-center").hidden = false;
  document.getElementById("cam-center").textContent = "시뮬레이션: 팔을 올렸다 내리는 동작을 가상으로 재생합니다 (실제 기록과 구분되지 않으니 체험용으로만 쓰세요)";
  let t = 0; const peak = 95 + Math.random() * 20;
  const step = () => { if (!cam) return; t += 0.05; onAngle(Math.round(Math.max(0, Math.sin(t) * peak))); if (cam.reps < cam.prog.target) cam.raf = requestAnimationFrame(step); };
  step();
}

function close() {
  if (!cam) return;
  cancelAnimationFrame(cam.raf); try { speechSynthesis.cancel(); } catch {} cam.stream?.getTracks().forEach((t) => t.stop()); cam.landmarker?.close?.();
  cam = null; document.getElementById("cam-modal")?.remove();
}
