/* 카메라 운동 측정 (MediaPipe Pose, 브라우저 안에서만 처리)
   영상은 서버로 보내지 않고, 계산한 횟수·최대 각도만 onSave로 넘긴다. */

import { h } from "./util.js";

const MP_VER = "0.10.14";
let cam = null;

export function openCamera(prog, affectedSide, onSave) {
  cam = { prog, reps: 0, maxAngle: 0, up: false, stream: null, raf: 0, sim: false, landmarker: null, side: affectedSide === "left" ? "left" : "right", onSave };
  const m = document.createElement("div"); m.className = "modal"; m.id = "cam-modal";
  m.innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-label="카메라 운동">
    <div class="toolbar" style="justify-content:space-between"><h2>${h(prog.title)}</h2><button class="btn ghost" data-cam="close">닫기</button></div>
    <p class="small muted">${h(prog.detail)} 팔이 ${prog.targetAngle}° 이상 올라갔다 내려오면 1회로 셉니다. 영상은 이 기기 안에서만 분석하고 저장하지 않습니다.</p>
    <div class="stage"><video id="cam-video" playsinline muted></video><canvas id="cam-canvas"></canvas>
      <div class="hud"><b id="hud-angle">0°</b><b id="hud-reps">0 / ${prog.target}</b></div>
      <div class="center" id="cam-center">카메라와 자세 인식 모델을 준비하는 중…</div></div>
    <div class="bigcount"><div><span class="small muted">횟수</span><strong id="c-reps">0</strong></div><div><span class="small muted">최대 각도</span><strong id="c-max">0°</strong></div><div><span class="small muted">목표</span><strong>${prog.target}</strong></div></div>
    <div class="field"><label class="label" for="c-pain">운동 중 통증 (0 없음 – 10 매우 심함): <span id="c-pain-v" class="mono">0</span></label><input type="range" id="c-pain" min="0" max="10" value="0"></div>
    <div class="field"><label class="label" for="c-comment">치료사에게 남길 말 (선택)</label><input type="text" id="c-comment" placeholder="예: 오늘은 어깨가 덜 당겼어요"></div>
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
    if (pts) { draw(pts, v); onAngle(shoulderAngle(pts, cam.side)); }
    cam.raf = requestAnimationFrame(loop);
  };
  loop();
}

/** 엉덩이–어깨–팔꿈치 각도 ≈ 어깨 굽힘. 오른쪽: 12,14,24 / 왼쪽: 11,13,23 */
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
  if (cam.up && deg < 30) { cam.up = false; cam.reps++; }
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
  if (!cam || cam.sim) return; cam.sim = true;
  document.getElementById("cam-center").hidden = false;
  document.getElementById("cam-center").textContent = "시뮬레이션: 팔을 올렸다 내리는 동작을 가상으로 재생합니다 (실제 기록과 구분되지 않으니 체험용으로만 쓰세요)";
  let t = 0; const peak = 95 + Math.random() * 20;
  const step = () => { if (!cam) return; t += 0.05; onAngle(Math.round(Math.max(0, Math.sin(t) * peak))); if (cam.reps < cam.prog.target) cam.raf = requestAnimationFrame(step); };
  step();
}

function close() {
  if (!cam) return;
  cancelAnimationFrame(cam.raf); cam.stream?.getTracks().forEach((t) => t.stop()); cam.landmarker?.close?.();
  cam = null; document.getElementById("cam-modal")?.remove();
}
