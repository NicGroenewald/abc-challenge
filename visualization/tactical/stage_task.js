import * as THREE from 'three';
import { createHero } from './hero.js';
import { loadHeadsetModel } from './hero_model.js';
import { createTaskScene } from './scene_task.js?r=f2';

const BUST_FRACTION = 0.68;
const BUST_X = 0.72;
const FOV = 24;
const CAM_YAW = 30, CAM_PITCH = 8;
const PLAY_RATE = 0.25;
const MAX_STEP = 0.25;
const DIP_HALF = 0.125, DIP_DEPTH = 0.85;
const READOUT_MS = 250;

const here = p => new URL(p, import.meta.url).href;
const DATA = [['K8_HERO_HEAD', 'hero/head.js'], ['K8HeroPose', 'hero/headpose.js'], ['K8_HERO_CLIP', 'hero/clip.js?r=q1']];

function loadScript(global, src) {
  if (window[global]) return Promise.resolve();
  return new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = here(src); s.async = false;
    s.onload = () => window[global] ? ok() : fail(new Error(src + ' did not define ' + global));
    s.onerror = () => fail(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
}

let el = null, canvas = null, renderer = null, scene = null, camera = null, hero = null, ro = null, mounting = null;
let state = 'far', paused = false, ready = false, raf = 0, last = null;
let clock = 0, wrapped = false, frames = 0, posS = 0;
let part = null, labelsEl = null, offX = 0, once = 0;
const cam = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: FOV, offset: 1 };
let size = [1, 1];
let roAt = -Infinity, roK = -1, roEls = null;
const drawn = { t: 0, frame: 0, posS: 0, clock: 0 };

function shouldRun() { return ready && state === 'current' && !paused && !document.hidden; }
function schedule() {
  if (shouldRun()) { if (!raf) raf = requestAnimationFrame(tick); }
  else { if (raf) cancelAnimationFrame(raf); raf = 0; last = null; }
}

function advance(dt) {
  const P = hero.period;
  if (clock >= P) { clock = 0; wrapped = true; return; }
  clock = Math.min(P, clock + dt * PLAY_RATE);
}
function dip() {
  const P = hero.period, d = Math.min(P - clock, wrapped ? clock : Infinity);
  if (!(d < DIP_HALF)) return 1;
  const k = 0.5 + 0.5 * Math.cos(Math.PI * d / DIP_HALF);
  return 1 - DIP_DEPTH * k;
}
function setOpacity() {
  if (!canvas) return;
  const near = posS <= 2.2 ? 1 : posS >= 3 ? 0 : 1 - (posS - 2.2) / 0.8;
  canvas.style.opacity = (hero ? 1 - (1 - dip()) * near : 1).toFixed(3);
}

function readout(now, force) {
  if (!force && now - roAt < READOUT_MS) return;
  const C = window.K8_HERO_CLIP, k = hero.sampleIndex() - hero.horizon;
  if (k < 0 || dip() < 1) return;
  roAt = now;
  if (k === roK) return;
  if (!roEls) { const e = document.querySelector('#heroReadout [data-r="err"]'), h = document.querySelector('#heroReadout [data-r="hold"]'); if (!e || !h) return; roEls = [e, h]; }
  roK = k;
  roEls[0].textContent = C.err[k].toFixed(1) + '°';
  roEls[1].textContent = C.hold[k].toFixed(1) + '°';
}

function aimCamera() {
  const [w, h] = size;
  part.camera(posS, cam);
  camera.position.copy(cam.position); camera.lookAt(cam.target);
  camera.fov = cam.fov; camera.setViewOffset(w, h, offX * cam.offset, 0, w, h);
  camera.updateMatrixWorld(true);
  return [w, h];
}
function draw() {
  hero.update(clock);
  part.update(hero.fraction());
  readout(performance.now(), false);
  setOpacity();
  const [w, h] = aimCamera();
  renderer.render(scene, camera);
  part.placeLabels(camera, w, h);
  frames++;
  drawn.t = performance.now(); drawn.frame = frames; drawn.posS = posS; drawn.clock = clock;
  if (frames === 1 && el) el.setAttribute('data-live', 'on');
}
function tick(now) {
  raf = 0;
  if (!shouldRun()) { last = null; return; }
  const dt = last === null ? 0 : Math.min(MAX_STEP, Math.max(0, (now - last) / 1000)); last = now;
  advance(dt);
  draw();
  raf = requestAnimationFrame(tick);
}

const _v = new THREE.Vector3();
function silhouette() {
  let lo = Infinity, hi = -Infinity, left = Infinity, right = -Infinity;
  scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  for (const m of [hero.skin, ...hero.headset.children.filter(o => o.isMesh)]) {
    const a = m.geometry.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) { _v.set(a[i], a[i + 1], a[i + 2]).applyMatrix4(m.matrixWorld).project(camera); if (_v.y < lo) lo = _v.y; if (_v.y > hi) hi = _v.y; if (_v.x < left) left = _v.x; if (_v.x > right) right = _v.x; }
  }
  return { lo, hi, left, right };
}
function fit() {
  const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
  size = [w, h];
  renderer.setSize(w, h, false);
  camera.fov = FOV; camera.aspect = w / h; camera.clearViewOffset(); camera.updateProjectionMatrix();
  const box = new THREE.Box3(); for (const m of [hero.skin, ...hero.headset.children.filter(o => o.isMesh)]) box.expandByObject(m, true);
  const c = box.getCenter(new THREE.Vector3());
  const yaw = hero.bodyRef + CAM_YAW * Math.PI / 180, pitch = CAM_PITCH * Math.PI / 180;
  const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  let d = 6;
  for (let k = 0; k < 6; k++) {
    camera.position.copy(c).addScaledVector(dir, d); camera.lookAt(c); camera.updateMatrixWorld(true);
    const s = silhouette(), frac = (s.hi - s.lo) / 2;
    d *= frac / BUST_FRACTION;
    if (k === 2) { const mid = (s.hi + s.lo) / 2; c.y += mid * Math.tan(FOV * Math.PI / 360) * d; }
  }
  camera.position.copy(c).addScaledVector(dir, d); camera.lookAt(c); camera.updateMatrixWorld(true);
  const s = silhouette(), cx = ((s.left + s.right) / 2 + 1) / 2 * w;
  offX = cx - BUST_X * w;
  camera.setViewOffset(w, h, offX, 0, w, h);
  if (part) part.setKey0(camera.position, c, FOV);
}
function frame() {
  const box = new THREE.Box3(); for (const m of [hero.skin, ...hero.headset.children.filter(o => o.isMesh)]) box.expandByObject(m, true);
  const origin = box.getCenter(new THREE.Vector3()), U = box.max.y - box.min.y, a = hero.bodyRef;
  const F = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)), R = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
  const yaw = a + CAM_YAW * Math.PI / 180, dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  return { origin, U, F, R, side: dir.dot(R) >= 0 ? 1 : -1 };
}

function light({ origin, U, F, R, side }) {
  const at = (f, u, r) => origin.clone().addScaledVector(F, f * U).addScaledVector(new THREE.Vector3(0, 1, 0), u * U).addScaledVector(R, r * U * side);
  const aim = new THREE.Object3D(); aim.position.copy(origin); scene.add(aim);
  const add = (color, power, pos) => { const l = new THREE.DirectionalLight(color, power); l.position.copy(pos); l.target = aim; scene.add(l); return l; };
  add(0xfff1e0, 2.6, at(3, 3, -2));
  add(0xcfdcff, 0.65, at(2, 0.5, 3));
  add(0xffffff, 2.2, at(-3, 2.6, 1));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x15171b, 0.35));
  const room = new THREE.Scene(), glow = (w, h, x, y, z, v) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); room.add(m); };
  glow(6, 4, -5, 5, 4, 6); glow(5, 5, 6, 2, 3, 2.5); glow(20, 20, 0, -6, 0, 0.12);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(room, 0.04).texture; scene.environmentIntensity = 0.55; pm.dispose();
  room.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
}

async function mount(target) {
  if (mounting) return mounting;
  if (window.K8_BOOT && window.K8_BOOT.live3d === false) return;
  el = target;
  mounting = (async () => {
    const cv = document.createElement('canvas'), gl = cv.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
    if (!gl) return;
    try {
      for (const [g, s] of DATA) await loadScript(g, s);
      renderer = new THREE.WebGLRenderer({ canvas: cv, context: gl, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1;
      renderer.setClearColor(0x000000, 0);
      canvas = renderer.domElement;
      canvas.setAttribute('tabindex', '-1'); canvas.setAttribute('aria-hidden', 'true');
      Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', pointerEvents: 'none' });
      canvas.addEventListener('webglcontextlost', onLost);
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 100);
      scene.add(camera);
      hero = createHero({ THREE, clip: window.K8_HERO_CLIP, head: window.K8_HERO_HEAD, pose: window.K8HeroPose });
      hero.setPaused(paused);
      scene.add(hero.group);
      loadHeadsetModel(THREE).then(m => { if (hero) { hero.useModel(m); if (ready) draw(); } }).catch(e => console.warn('headset model:', e));
      el.appendChild(canvas);
      labelsEl = document.createElement('div'); labelsEl.className = 'sc-labels'; el.appendChild(labelsEl);
      labelsEl.setAttribute('aria-hidden', 'true');
      const fr = frame();
      camera.far = 80 * fr.U; camera.near = 0.02 * fr.U;
      light(fr);
      part = createTaskScene({ THREE, clip: window.K8_HERO_CLIP, ...fr, accent: hero.accent, labelsEl });
      scene.add(part.group); part.setPos(posS);
      fit();
      ro = new ResizeObserver(() => { if (!renderer) return; fit(); if (state !== 'far' && ready) draw(); });
      ro.observe(el);
      ready = true;
      draw();
      schedule();
    } catch (e) {
      if (renderer) release();
      else { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); mounting = null; }
    }
  })();
  return mounting;
}
function onLost() { release(true); }
function setState(s) { state = s === 'current' || s === 'near' ? s : 'far'; schedule(); }
function setPos(s, key, extra) {
  posS = +s || 0;
  if (!ready) return;
  part.setPos(posS);
  if (!raf && !once && state !== 'far') once = requestAnimationFrame(() => { once = 0; if (ready && state !== 'far') draw(); });
}
function release(lost) {
  if (canvas) canvas.removeEventListener('webglcontextlost', onLost);
  if (raf) cancelAnimationFrame(raf); raf = 0; last = null; ready = false;
  if (ro) ro.disconnect(); ro = null;
  if (once) cancelAnimationFrame(once); once = 0;
  if (part) part.dispose(); part = null; if (labelsEl) labelsEl.remove(); labelsEl = null;
  if (hero) hero.dispose(); hero = null;
  if (renderer) { renderer.dispose(); if (lost !== true) renderer.forceContextLoss(); }
  if (canvas) canvas.remove();
  if (el) el.removeAttribute('data-live');
  renderer = canvas = scene = camera = null; mounting = null; frames = 0; clock = 0; wrapped = false; roAt = -Infinity; roK = -1; roEls = null;
}
function setPaused(p) {
  paused = !!p; if (hero) hero.setPaused(paused);
  const b = document.getElementById('heroPause'); if (b) b.setAttribute('aria-pressed', paused ? 'true' : 'false');
  schedule();
}

document.addEventListener('click', e => { const b = e.target && e.target.closest && e.target.closest('#heroPause'); if (b) setPaused(!paused); });
{ const b = document.getElementById('heroPause'); if (b) b.setAttribute('aria-pressed', 'false'); }
document.addEventListener('visibilitychange', schedule);

export const stage = { mount, setState, setPos, release };
window.K8StageTask = stage;
window.__hero = {
  frames: () => frames,
  clock: () => clock,
  setClock(sec) { const P = hero ? hero.period : 11.99; let t = +sec || 0; t %= P; if (t < 0) t += P; clock = t; wrapped = false; roAt = -Infinity; },
  sample: () => (hero ? Math.floor(Math.min(hero.samples - 1, clock * hero.rate)) : 0),
  paused: () => paused,
  rate: PLAY_RATE,
  tips: () => (hero && camera ? hero.measure().tips.map(toScreen) : null),
  readoutSample: () => roK,
  probe: () => probe(),
  probeAt(sec) { if (!hero) return null; hero.poseAt(+sec || 0); return probe(); },
  view: () => (camera ? { ...drawn, pos: cam.position.toArray(), target: cam.target.toArray(), fov: cam.fov, offset: cam.offset, offX } : null),
};
function probe() {
  if (!hero) return null;
  const m = hero.measure();
  return { f: m.f, headset: m.headset, ghost: m.ghost, arcDeg: m.arcDeg, arcDegPosed: m.arcDegPosed, gap: m.gap, tips: camera ? m.tips.map(toScreen) : null,
    radius: m.radius, headLength: m.headLength, pointerLength: m.pointerLength };
}
function toScreen(v) {
  camera.updateMatrixWorld(true);
  const p = v.clone().project(camera), r = canvas.getBoundingClientRect();
  return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height];
}
if (window.K8Story && typeof window.K8Story.addLive === 'function') window.K8Story.addLive('task', stage);
