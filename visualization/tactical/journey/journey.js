
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createHero } from '../hero.js';
import { loadHeadsetModel } from '../hero_model.js';
import { makeGLTFLoader } from '../hero_model.js';
import { applyBoardTextures } from './board_textures.js';
import { DIE, NPU_N, NPU_K8, npuTile, dieTexture } from './die_texture.js';
const BOARD_URL = new URL('../assets/board_q3.glb?r=b7', import.meta.url).href;
import { makeA, makeB } from './modelviews.js?r=ph1';

const MODEL = (new URLSearchParams(location.search).get('model') || 'a').toLowerCase();

const $ = id => document.getElementById(id);
const glCanvas = $('gl'), freeze = $('freeze'), flash = $('flash'), dotsEl = $('dots');

const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.setClearColor(0x010101, 1);
const camera = new THREE.PerspectiveCamera(24, 1, 0.01, 100);

let panelOn = false, openId = null;
const cssPx = name => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
const PHONE_TOP = cssPx('--ph'), PHONE_BOTTOM = cssPx('--pb');
function layout() {
  const W = innerWidth, H = innerHeight;
  if (W <= 768 && W < H) {
    const y = panelOn ? PHONE_TOP : 0, model = { x: 0, y, w: W, h: H - y - (panelOn ? PHONE_BOTTOM : 0) };
    return { form: 'phone', W, H, model, fit: model };
  }
  return { form: 'wide', W, H, model: { x: 0, y: 0, w: W - (panelOn ? $('panel').offsetWidth : 0), h: H }, fit: { w: W, h: H } };
}
const off = { x: 0, y: 0 };
function offsetFor({ W, H, model: m }) { return { x: W / 2 - (m.x + m.w / 2), y: H / 2 - (m.y + m.h / 2) }; }
function setOffset(x, y) {
  off.x = x; off.y = y; const { W, H } = layout();
  if (Math.abs(x) < .5 && Math.abs(y) < .5) camera.clearViewOffset(); else camera.setViewOffset(W, H, x, y, W, H);
}

let reframe = false;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  freeze.width = glCanvas.width; freeze.height = glCanvas.height;
  document.documentElement.classList.toggle('phone', layout().form === 'phone');
  const o = offsetFor(layout()); setOffset(o.x, o.y);
  reframe = true;
  if (L) showBack();
}
addEventListener('resize', resize);

function addEnvironment(scene, intensity = 0.55) {
  const room = new THREE.Scene();
  const panel = (w, h, x, y, z, v) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); room.add(m); };
  panel(6, 4, -5, 5, 4, 6); panel(5, 5, 6, 2, 3, 2.5); panel(20, 20, 0, -6, 0, 0.12);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(room, 0.04).texture; scene.environmentIntensity = intensity;
  pm.dispose();
}

function boardEnvironment(scene, intensity = 1) {
  const room = new THREE.Scene();
  const panel = (w, h, x, y, z, v) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); room.add(m); };
  panel(9, 9, 0, 8, 1, 5);
  panel(2, 10, -7, 3, 2, 3.5);
  panel(2, 10, 7, 3, -2, 2.2);
  panel(30, 30, 0, -8, 0, 0.04);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(room, 0.02).texture; scene.environmentIntensity = intensity;
  pm.dispose();
}

const pose = (target, dir, dist) => ({ target: target.clone(), dir: dir.clone().normalize(), dist });
const cur = pose(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 1);
function fitDist(w, h, margin = 1.1) {
  const t = Math.tan(camera.fov * Math.PI / 360), { H, fit } = layout();
  return margin * Math.max(h / 2 / t * H / fit.h, w / 2 / t * H / fit.w);
}
const fitScale = () => { const { H, fit } = layout(); return Math.max(1, H / fit.h, H / fit.w); };
function applyPose(p) {
  camera.position.copy(p.target).addScaledVector(p.dir, p.dist); camera.lookAt(p.target);
  if (L && !L.external) {
    const far = Math.max(L.far, p.dist * 3);
    const near = Math.max(L.near, p.dist * .05);
    if (far !== camera.far || near !== camera.near) { camera.far = far; camera.near = near; camera.updateProjectionMatrix(); }
  }
}

const ease = {
  inOut: t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
  in: t => t * t * t * t,
  out: t => 1 - (1 - t) ** 3,
  in2: t => t * t, out2: t => 1 - (1 - t) ** 2,
};
const matchK = (v, T, p, lo = 1.3, hi = 14) => Math.min(hi, Math.max(lo, Math.exp(v * T / p)));
const turnFirst = t => ease.inOut(Math.min(1, t / .55));
let tween = null;
function flyTo(to, ms, eDir = ease.inOut, eDist = eDir) {
  const from = pose(cur.target, cur.dir, cur.dist);
  const turn = new THREE.Quaternion().setFromUnitVectors(from.dir, to.dir), id = new THREE.Quaternion(), q = new THREE.Quaternion();
  return new Promise(done => {
    tween = { t0: performance.now(), ms, step(now) {
      const t = Math.min(1, (now - this.t0) / ms), a = eDir(t), b = eDist(t);
      cur.target.lerpVectors(from.target, to.target, a);
      q.slerpQuaternions(id, turn, a); cur.dir.copy(from.dir).applyQuaternion(q);
      cur.dist = from.dist * (to.dist / from.dist) ** b;
      if (t >= 1) { tween = null; done(); }
    } };
  });
}

function buildHeadset() {
  const scene = new THREE.Scene();
  const hero = createHero({ THREE, clip: window.K8_HERO_CLIP, head: window.K8_HERO_HEAD, pose: window.K8HeroPose });
  scene.add(hero.group);
  loadHeadsetModel(THREE).then(m => { hero.useModel(m); anchor.position.set(0, -.115, -.556); }).catch(e => console.warn('headset model:', e));
  hero.ghost.visible = false; hero.arc.visible = false;
  const ptr = hero.headset.getObjectByName('hero-pointer'); ptr.visible = false;
  hero.update(0);

  const box = new THREE.Box3(); for (const m of [hero.skin, ...hero.headset.children.filter(o => o.isMesh)]) box.expandByObject(m, true);
  const origin = box.getCenter(new THREE.Vector3()), U = box.max.y - box.min.y, a = hero.bodyRef;

  const F = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)), R = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)), UP = new THREE.Vector3(0, 1, 0);
  const at = (f, u, r) => origin.clone().addScaledVector(F, f * U).addScaledVector(UP, u * U).addScaledVector(R, r * U);
  const aim = new THREE.Object3D(); aim.position.copy(origin); scene.add(aim);
  for (const [c, p, pos] of [[0xfff1e0, 2.6, at(3, 3, -2)], [0xcfdcff, .65, at(2, .5, 3)], [0xffffff, 2.2, at(-3, 2.6, 1)]]) {
    const l = new THREE.DirectionalLight(c, p); l.position.copy(pos); l.target = aim; scene.add(l);
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x15171b, .35));
  addEnvironment(scene);

  const pa = ptr.geometry.attributes.position;
  const anchor = new THREE.Object3D(); anchor.position.set(pa.getX(0), pa.getY(0), pa.getZ(0)); hero.headset.add(anchor);
  const yaw = a + 30 * Math.PI / 180, pitch = 8 * Math.PI / 180;
  const homeDir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const SUBJECT_W = 1.0, fit = (margin = 1) => fitDist(SUBJECT_W * U, 1.24 * U, margin);
  const shell = hero.headset.children.find(m => m.isMesh && /body$/.test(m.name)) || hero.headset.children.find(m => m.isMesh);
  shell.geometry.computeBoundingBox();
  const sb = shell.geometry.boundingBox.clone().applyMatrix4(shell.matrix), sc = sb.getCenter(new THREE.Vector3()), ss = sb.getSize(new THREE.Vector3());
  const onSet = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); hero.headset.add(o); return o; };
  const imuA = onSet(sc.x, sb.max.y, sb.min.z + ss.z * .2), dispA = onSet(anchor.position.x + ss.x * .28, anchor.position.y, anchor.position.z);

  const lvl = {
    name: '01 / HEADSET', scene, near: .004 * U, far: 40 * U,
    home: () => pose(origin, homeDir, fit()),
    subject: () => [hero.skin, hero.headset],
    heroPose(t = 0, face = 0) {
      const e = face * face * (3 - 2 * face);
      const ang = .5 + (-.524 - .5) * e + Math.sin(t * .13) * .14 * (1 - .75 * e);
      const d = homeDir.clone().applyAxisAngle(UP, ang); d.y = .05; d.normalize();
      return pose(origin.clone().addScaledVector(UP, .16 * U), d, fit(1.12));
    },
    title: 'The VR headset', sub: 'LEVEL 01 · WHERE THE DATA COMES FROM',
    hotspots: [
      { id: 'imu', label: 'MOTION SENSOR\nGYRO + ACCELEROMETER', anchor: imuA, normal: new THREE.Vector3(0, 1, -1).normalize(),
        title: 'Motion sensor',
        text: 'A gyroscope and an accelerometer measure how the head turns, hundreds of times a second. The headset fuses them into one orientation, a quaternion of four numbers, every 10 ms. That stream is all our model sees.',
        facts: [['RATE', '100 HZ'], ['ONE SAMPLE', 'W, X, Y, Z']] },
      { id: 'disp', label: 'DISPLAY', anchor: dispA, normal: new THREE.Vector3(0, 0, -1), title: 'Display',
        text: 'Drawing a frame takes time, so the headset has to draw it for where the head is about to be, not where it was. Predicting head motion ahead is how that delay is hidden.',
        facts: [['THE CHALLENGE', 'PREDICT 200 MS AHEAD']] },
      { id: 'proc', label: 'PROCESSOR\nXR SOC · RUNS THE MODEL', anchor, normal: new THREE.Vector3(0, 0, -1), dive: 'board', title: 'Processor',
        text: 'The chip that runs the headset: tracking, graphics and small neural networks like ours. Go inside to find where k8 runs.',
        facts: [['INSIDE', 'BOARD → CHIP → NPU']] },
    ],
    exitPose(h) {
      h.anchor.updateWorldMatrix(true, false);
      const p = h.anchor.getWorldPosition(new THREE.Vector3()), n = h.normal.clone().transformDirection(h.anchor.matrixWorld);
      return pose(p, n, .02 * U);
    },
    approach(h) { const e = this.exitPose(h); e.dir.lerp(homeDir, .45).normalize(); e.dist = 1.4 * U * fitScale(); return e; },
    clock: 0, playing: true, hold: false, rate: 0,
    update(dt) {
      const want = this.playing && !this.hold ? +$('tSpeed').value / 100 : 0;
      this.rate += (want - this.rate) * Math.min(1, dt * 8);
      if (this.rate > 1e-4) { this.clock += dt * this.rate; hero.update(this.clock); }
    },
    U,
    setPredict(on) { hero.ghost.visible = on; hero.arc.visible = on; ptr.visible = on; },
    predictPose() { return pose(origin, homeDir, fit(1.08)); },
    readout() { const C = window.K8_HERO_CLIP, k = hero.sampleIndex() - hero.horizon; return k < 0 ? null : { err: C.err[k], hold: C.hold[k] }; },
  };
  return lvl;
}

function labelTexture(lines, w = 512, h = 512) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#8f9295'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(30,32,34,.75)'; g.font = '600 46px GeistMono, monospace';
  lines.forEach((t, i) => g.fillText(t, 48, 120 + i * 62));
  g.beginPath(); g.arc(60, h - 60, 14, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

function buildBoard() {
  const scene = new THREE.Scene(), group = new THREE.Group(); scene.add(group);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const phys = o => new THREE.MeshPhysicalMaterial(o);

  const pcb = new THREE.Mesh(new RoundedBoxGeometry(10, .16, 7, 3, .06), phys({ color: 0x0c1410, roughness: .5, clearcoat: .7, clearcoatRoughness: .3 }));
  pcb.position.y = -.08; group.add(pcb);
  const top = 0;

  const soc = new THREE.Mesh(new THREE.BoxGeometry(2.2, .16, 2.2), phys({ color: 0x141516, roughness: .7 }));
  soc.position.set(0, top + .08, 0); group.add(soc);
  const lidMat = [phys({ color: 0x9a9c9f, metalness: 1, roughness: .35 })]; const lidTop = phys({ map: labelTexture(['XR-SOC', 'K8 · NPU', '2027 / 4NM']), metalness: .9, roughness: .4 });
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.6, .06, 1.6), [lidMat[0], lidMat[0], lidTop, lidMat[0], lidMat[0], lidMat[0]]);
  lid.position.set(0, top + .19, 0); group.add(lid);

  const chip = (w, d, x, z, h = .12) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), phys({ color: 0x101112, roughness: .55, clearcoat: .3 })); m.position.set(x, top + h / 2, z); group.add(m); return m; };
  chip(1.1, 1.5, -2.2, -.2); const mem = chip(1.1, 1.5, 2.2, -.2); const imu = chip(.45, .45, 3.6, 2.4, .08);

  const segs = [];
  for (let i = 0; i < 90; i++) {
    const side = i % 4, k = (Math.floor(i / 4) / 22 - .5) * 2;
    let x = side < 2 ? (side ? 1.12 : -1.12) : k * 1.0, z = side < 2 ? k * 1.0 : (side === 2 ? 1.12 : -1.12);
    for (let s = 0; s < 3; s++) {
      const horiz = (side < 2) === (s % 2 === 0), len = .4 + rnd() * 1.8, sign = side === 0 || side === 3 ? -1 : 1;
      const nx = horiz ? x + sign * len : x, nz = horiz ? z : z + (rnd() < .5 ? -1 : 1) * len * .6;
      if (Math.abs(nx) > 4.8 || Math.abs(nz) > 3.3) break;
      segs.push([x, z, nx, nz]); x = nx; z = nz;
    }
  }
  const tr = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .012, 1), phys({ color: 0x6b6247, metalness: .8, roughness: .45 }), segs.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  segs.forEach(([x0, z0, x1, z1], i) => { P.set((x0 + x1) / 2, top + .006, (z0 + z1) / 2); S.set(Math.abs(x1 - x0) + .03, 1, Math.abs(z1 - z0) + .03); tr.setMatrixAt(i, M.compose(P, Q, S)); });
  group.add(tr);

  const pas = new THREE.InstancedMesh(new THREE.BoxGeometry(.14, .07, .07), phys({ color: 0xffffff, roughness: .6 }), 160), col = new THREE.Color();
  for (let i = 0; i < 160; i++) {
    let x, z; do { x = (rnd() - .5) * 9.2; z = (rnd() - .5) * 6.2; } while (Math.abs(x) < 1.4 && Math.abs(z) < 1.4);
    Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() < .5 ? 0 : Math.PI / 2);
    pas.setMatrixAt(i, M.compose(P.set(x, top + .035, z), Q, S.set(1, 1, 1)));
    pas.setColorAt(i, col.set(rnd() < .6 ? 0x6e5a3c : 0x1b1b1c));
  }
  group.add(pas); Q.identity();
  const via = new THREE.InstancedMesh(new THREE.CylinderGeometry(.03, .03, .01, 10), phys({ color: 0xb79a5b, metalness: 1, roughness: .3 }), 220);
  for (let i = 0; i < 220; i++) via.setMatrixAt(i, M.compose(P.set((rnd() - .5) * 9.4, top + .005, (rnd() - .5) * 6.4), Q, S.set(1, 1, 1)));
  group.add(via);

  scene.add(new THREE.HemisphereLight(0xe8eef5, 0x080808, .45));
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(-5, 7, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd2ff, 2.2); rim.position.set(3, 4, -7); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffe6c8, .6); fill.position.set(7, 2, 3); scene.add(fill);
  boardEnvironment(scene, 1.1);

  const anchorOn = (obj, y) => { const a = new THREE.Object3D(); a.position.set(0, y, 0); obj.add(a); return a; };
  const up = new THREE.Vector3(0, 1, 0);
  const homeDir = new THREE.Vector3(.35, 1, .75).normalize();
  const lvl = {
    name: '02 / BOARD', scene, near: .01, far: 100, U: 10, title: 'Inside the headset', sub: 'LEVEL 02 · THE CIRCUIT BOARD',
    home: () => pose(new THREE.Vector3(0, 0, .3), homeDir, fitDist(11, 8)),
    subject: () => [lvl.realBoard ? flip : group],
    hotspots: [
      { id: 'wifi', label: 'WI-FI 6E\nWCN6856', anchor: anchorOn(mem, .06), normal: up, zoom: 2.6, title: 'Wi-Fi 6E',
        text: 'Qualcomm WCN6856 with its two Qorvo front ends (2.4 and 5 GHz), under the right-hand shield frame. Prediction does not need it: a model as small as k8 can run on the headset itself, with no round trip to a server.',
        facts: [['PART', 'WCN6856-102'], ['FRONT ENDS', 'QORVO QM42391 · QM45392']] },
      { id: 'mem', label: 'MEMORY\n8 GB LPDDR5', anchor: anchorOn(mem, .06), normal: up, zoom: 3.4, title: 'Memory',
        text: '8 GB of LPDDR5 working memory for the operating system, apps and frames (SK hynix, per iFixit\'s chip ID). k8 barely needs it: its weights are 44 KB, small enough to sit in the chip\'s own on-chip memory.',
        facts: [['PART', 'H58G66BK8BX105'], ['K8 WEIGHTS', '44,196 BYTES']] },
      { id: 'soc', label: 'XR2 GEN 2\nCPU · GPU · NPU', anchor: anchorOn(lid, .03), normal: up, zoom: 3.4, dive: 'die', title: 'Processor: Snapdragon XR2 Gen 2',
        text: 'Qualcomm\'s Snapdragon XR2 Gen 2: CPU, GPU and a neural processing unit on one chip. A model the size of k8 would fit on its NPU. Go inside the chip.',
        facts: [['PART', 'SXR2230P-100-AB'], ['INSIDE', 'ILLUSTRATED, NOT A DIE PHOTO']] },
    ],
    approach(h) { const p = h.anchor.getWorldPosition(new THREE.Vector3()); return pose(p, homeDir.clone().lerp(up, .4), h.zoom * fitScale()); },
    exitPose(h) { const p = h.anchor.getWorldPosition(new THREE.Vector3()); return pose(p, new THREE.Vector3(.02, 1, .03), .05); },
    update(dt) { this.t = (this.t || 0) + dt; group.rotation.y = Math.sin(this.t * .25) * .015; group.rotation.x = Math.sin(this.t * .19) * .008; },
  };
  const down = new THREE.Vector3(0, -1, 0), SIDE1 = lvl.hotspots, flip = new THREE.Group(); flip.name = 'board-flip';
  const SIDE2 = [
    { id: 'mcu', label: 'STM32G071\nST · CORTEX-M0+', anchor: anchorOn(mem, .06), normal: down, zoom: 2.4, title: 'Microcontroller: STMicroelectronics STM32G071',
      text: 'A small Arm Cortex-M0+ microcontroller from STMicroelectronics, the company running this challenge. It sits beside the main processor; its exact job in the headset is not public.',
      facts: [['PART', 'STM32G071EB'], ['MAKER', 'STMICROELECTRONICS']] },
    { id: 'nand', label: 'STORAGE\n128 GB', anchor: anchorOn(mem, .06), normal: down, zoom: 3.0, title: 'Storage: 128 GB',
      text: 'SK hynix flash storage for the operating system, apps and games. A model file like k8 (44 KB) would be stored here, next to the apps, and loaded into the processor\'s memory to run.',
      facts: [['PART', 'HN8T05DEHKX073'], ['K8 FILE', '44,196 BYTES']] },
    { id: 'pmic', label: 'POWER\n4 QUALCOMM PMICS', anchor: anchorOn(mem, .06), normal: down, zoom: 2.4, title: 'Power management',
      text: 'Four Qualcomm power-management chips, under the tin frames, make the voltages the processor, memory and displays run on.',
      facts: [['PARTS', 'PMXR2230 · B · VE · VS']] },
  ];
  let side = 1, flipAnim = null;
  lvl.side = () => side;
  lvl.setSide = n => {
    if (n === side || busy) return; side = n;
    flipAnim = { t: 0, from: flip.rotation.z, to: n === 2 ? Math.PI : 0 };
    lvl.hotspots = n === 2 ? SIDE2 : SIDE1;
    mountDots(lvl); mountPanel(lvl); markOpen(null);
    document.querySelectorAll('#bswitch button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.s === n)));
    lvl.zoomed = false; showBack(); busy = true; flyTo(lvl.home(), 1300, ease.inOut).then(() => { busy = false; });
  };
  const baseUpdate = lvl.update;
  lvl.update = function (dt) {
    baseUpdate.call(this, dt);
    if (flipAnim) { flipAnim.t = Math.min(1, flipAnim.t + dt / 1.2); const e = ease.inOut(flipAnim.t);
      flip.rotation.z = flipAnim.from + (flipAnim.to - flipAnim.from) * e; if (flipAnim.t >= 1) flipAnim = null; }
  };
  lvl.ready = makeGLTFLoader().loadAsync(BOARD_URL).then(gltf => {
    for (const c of group.children) c.visible = false;
    flip.add(gltf.scene); group.add(flip);
    gltf.scene.updateMatrixWorld(true);
    for (const h of [...SIDE1, ...SIDE2]) { const a = gltf.scene.getObjectByName('anchor_' + h.id); if (a) h.anchor = a; }
    $('bswitch').hidden = false;
    gltf.scene.traverse(o => {
      if (!o.isMesh) return; const m = o.material, n = m.name;
      if (n === 'solder_mask') { m.color.set(0x15140f); m.roughness = .45; m.clearcoat = .8; m.clearcoatRoughness = .12; }
      else if (n === 'mask_over_copper') { m.color.set(0x1c1a14); m.clearcoat = .8; m.clearcoatRoughness = .12; }
      else if (n === 'shield_tin') { m.roughness = .38; }
      else if (n === 'standoff_steel') { m.roughness = .38; }
      else if (n === 'capacitor_can') { m.roughness = .4; }
      else if (n === 'chip_epoxy') { m.color.set(0x161618); m.roughness = .78; }
      else if (n === 'soc_top') { m.color.set(0x0b0c0e); m.roughness = .18; m.metalness = .1; }
      else if (n === 'connector_plastic') { m.roughness = .7; }
      m.needsUpdate = true;
    });
    applyBoardTextures(THREE, gltf.scene, renderer);
    lvl.realBoard = true;
  }).catch(e => console.warn('board_q3.glb did not load; keeping the placeholder board', e));
  return lvl;
}

const SMALL_SCREEN = Math.min(screen.width, screen.height) <= 768;
const DIE_PALETTE = (new URLSearchParams(location.search).get('die') || 'pastel').toLowerCase() === 'tactical' ? 'tactical' : 'pastel';

const CYCLE_MS = 10;
function dataPath(group, k8c) {
  const [kx, kz] = k8c, cache = [-2.8, .3], gpu = [1.95, -2.1];
  const route = [
    { p: [-4.9, 1.7], step: 0, hold: .35 }, { p: [-2.8, 1.7] }, { p: cache, step: 1, hold: .55 }, { p: [-2.8, 1.7] },
    { p: [-.85, 1.7] }, { p: [-.85, .61] }, { p: [kx, .61] }, { p: [kx, kz], step: 2, hold: .8 }, { p: [kx, .61] },
    { p: [gpu[0], .61] }, { p: gpu, step: 3, hold: .55 }, { p: [gpu[0], -.4] }, { p: [4.9, -.4], step: 4, hold: .3 },
  ];
  const Y = .012, acid = new THREE.Color(0xdff140);
  const trackMat = new THREE.MeshBasicMaterial({ color: acid, transparent: true, opacity: .22, depthWrite: false });
  for (let i = 0; i < route.length - 1; i++) {
    const [x0, z0] = route[i].p, [x1, z1] = route[i + 1].p, len = Math.hypot(x1 - x0, z1 - z0); if (len < 1e-3) continue;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len + .05, .05), trackMat);
    m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(z1 - z0, x1 - x0); m.position.set((x0 + x1) / 2, Y, (z0 + z1) / 2); group.add(m);
  }
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const q = c.getContext('2d');
    const gr = q.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(223,241,64,.8)'); gr.addColorStop(1, 'rgba(223,241,64,0)');
    q.fillStyle = gr; q.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const sprite = o => new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: o }));
  const head = sprite(1); head.scale.setScalar(.7); group.add(head);
  const TRAIL = 18, trail = []; for (let i = 0; i < TRAIL; i++) { const t = sprite(.5 * (1 - i / TRAIL)); t.scale.setScalar(.32 * (1 - i / TRAIL * .6)); group.add(t); trail.push(t); }
  const stopBox = [[-4.95, 1.45, -4.55, 1.95], [-4.5, -.9, -1.1, 1.5], [kx - .26, kz - .23, kx + .26, kz + .23], [-.6, -4.5, 4.5, .3], [4.55, -.65, 4.95, -.15]];
  const glows = stopBox.map(([x0, z0, x1, z1]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ color: acid, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, Y + .002, (z0 + z1) / 2); group.add(m); return m;
  });
  const cum = [0]; for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + Math.hypot(route[i].p[0] - route[i - 1].p[0], route[i].p[1] - route[i - 1].p[1]));
  const pointAt = d => {
    d = Math.max(0, Math.min(cum[cum.length - 1], d)); let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
    const f = cum[i] > cum[i - 1] ? (d - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0, a = route[i - 1].p, b = route[i].p;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  const SPEED = 7.5;
  const ease = x => x < .5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
  const stops = route.map((r, i) => ({ i, d: cum[i], step: r.step, hold: r.hold || 0 })).filter(r => r.step !== undefined);
  const plan = []; let t = 0;
  stops.forEach((st, k) => {
    if (k) { const prev = stops[k - 1], dur = (st.d - prev.d) / SPEED; plan.push({ t0: t, t1: t + dur, d0: prev.d, d1: st.d, step: -1 }); t += dur; }
    plan.push({ t0: t, t1: t + st.hold, d0: st.d, d1: st.d, step: st.step }); t += st.hold;
  });
  const total = t + .7;
  const slow = Math.round(total / (CYCLE_MS / 1000) / 50) * 50;
  const cap = document.querySelector('#flow p'); if (cap) cap.textContent = `One 10 ms cycle · shown ${slow}× slower`;
  const at = time => {
    for (const seg of plan) if (time < seg.t1) {
      if (seg.d0 === seg.d1) return { d: seg.d0, v: 0, step: seg.step };
      const x = (time - seg.t0) / (seg.t1 - seg.t0), e = ease(x), v = 1 - Math.abs(2 * x - 1);
      return { d: seg.d0 + (seg.d1 - seg.d0) * e, v, step: -1, last: plan[plan.indexOf(seg) - 1].step };
    }
    return { d: cum[cum.length - 1], v: 0, step: -1, done: true };
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rows = [...document.querySelectorAll('#flow li')];
  let clock = 0, shown = -2;
  return {
    update(dt) {
      if (reduced) { head.visible = false; trail.forEach(s => (s.visible = false)); return; }
      clock = (clock + dt) % total;
      const now = at(clock);
      head.visible = !now.done; const hp = pointAt(now.d); head.position.set(hp[0], Y + .02, hp[1]);
      head.scale.setScalar(.42 + .12 * now.v);
      const len = .16 * now.v;
      trail.forEach((s, i) => { const q = pointAt(now.d - (i + 1) * len); s.visible = !now.done && now.v > .02; s.position.set(q[0], Y + .015, q[1]); });
      glows.forEach((g, i) => { const target = now.step === i ? (i === 3 ? .14 : .26) : 0; g.material.opacity += (target - g.material.opacity) * Math.min(1, dt * 8); });
      const step = now.done ? -1 : now.step >= 0 ? now.step : (now.last ?? -1);
      if (step !== shown) { shown = step; rows.forEach((r, i) => r.classList.toggle('now', i === step)); }
    },
  };
}

function buildDie() {
  const scene = new THREE.Scene(), group = new THREE.Group(); scene.add(group);
  const tex = dieTexture(THREE, DIE_PALETTE, SMALL_SCREEN ? 2048 : 4096);
  const sub = new THREE.Mesh(new RoundedBoxGeometry(14, .4, 14, 3, .08), new THREE.MeshPhysicalMaterial({ color: 0x0d1210, roughness: .6 }));
  sub.position.y = -.28; group.add(sub);
  const side = new THREE.MeshPhysicalMaterial({ color: 0x2a2c31, metalness: .6, roughness: .4 });
  const face = new THREE.MeshPhysicalMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: DIE_PALETTE === 'tactical' ? .35 : .6,
    metalness: .15, roughness: .38, iridescence: .35, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 480] });
  const die = new THREE.Mesh(new THREE.BoxGeometry(10, .08, 10), [side, side, face, side, side, side]);
  die.position.y = -.04; group.add(die);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x0b0c0d, .2));
  const key = new THREE.DirectionalLight(0xfff1e0, 2.2); key.position.set(-8, 4, -3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd2ff, 1.4); rim.position.set(7, 5, 6); scene.add(rim);
  addEnvironment(scene, 1.1);

  const up = new THREE.Vector3(0, 1, 0), homeDir = new THREE.Vector3(.18, 1, .55).normalize();
  const at = (x, z) => { const a = new THREE.Object3D(); a.position.set(x, .01, z); group.add(a); return a; };
  const mid = b => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const k8 = npuTile(...NPU_K8), k8c = mid(k8);
  const flow = dataPath(group, k8c);
  return {
    name: '03 / SOC DIE', scene, near: .005, far: 120, title: 'The processor', sub: 'LEVEL 03 · THE SILICON DIE, ILLUSTRATIVE',
    home: () => pose(new THREE.Vector3(0, 0, .2), homeDir, fitDist(11, 11)),
    subject: () => [die],
    hotspots: [
      { id: 'cpu', label: 'CPU\n6 CORES', anchor: at(...mid(DIE.cpu)), normal: up, zoom: 7, title: 'CPU',
        text: 'Six general-purpose Kryo cores: the operating system, the app and its logic. Each core is a mirrored layout, as on real dies.', facts: [['CORES', '6'], ['LAYOUT', 'ILLUSTRATIVE']] },
      { id: 'gpu', label: 'ADRENO GPU\nDRAWS THE VR SCENE', anchor: at(...mid(DIE.gpu)), normal: up, zoom: 8, title: 'GPU',
        text: 'Draws the scene, once for each eye. It is the part that needs to know where the head will be.', facts: [['NEEDS', 'THE PREDICTED POSE']] },
      { id: 'sram', label: 'SYSTEM CACHE\nON-CHIP MEMORY', anchor: at(...mid(DIE.sram)), normal: up, zoom: 6, title: 'System cache',
        text: 'Fast memory on the chip itself. The memory pattern on a die shot is this regular woven grid. k8\'s 7,555 weights and the past values its blocks wait on are small enough to keep here.',
        facts: [['K8 PARAMETERS', '7,555']] },
      { id: 'npu', label: 'HEXAGON NPU · K8\n44 KB · EVERY 10 MS', anchor: at(...k8c), normal: up, zoom: 3.2, dive: 'model', title: 'Neural processing unit (Hexagon)',
        text: 'A grid of multiply-add tiles built for small neural networks. One tile is plenty for k8. Go into the yellow tile to see the model run.',
        facts: [['ONE CALL', '≈78 µS, MEASURED ON A PC CPU'], ['CALLS', 'EVERY 10 MS']] },
    ],
    approach(h) { const p = h.anchor.getWorldPosition(new THREE.Vector3()); return pose(p, homeDir.clone().lerp(up, .5), h.zoom * fitScale()); },
    exitPose(h) { const p = h.anchor.getWorldPosition(new THREE.Vector3()); return pose(p, new THREE.Vector3(.02, 1, .03), .12); },
    update(dt) { this.t = (this.t || 0) + dt; group.rotation.y = Math.sin(this.t * .22) * .012; flow.update(dt); },
  };
}

const STAGES = { input: 'INPUT\nQUATERNIONS IN', feat: 'FEATURES\n7 MEASUREMENTS', proj: 'PROJECTION\n7 → 32', mirror: 'MIRROR\nLEFT/RIGHT, SHARED WEIGHTS',
  blk0: 'BLOCK 1\nDILATION 1', blk1: 'BLOCK 2\nDILATION 8', blk2: 'BLOCK 3\nDILATION 47', head: 'READOUT\nNINE DIALS',
  traj: 'TRAJECTORY\nPRIOR + CORRECTION', out: 'FORECAST\n20 POSES, 200 MS' };
const HIDE_CHROME = `body > *:not(#scene):not(#labels) { display: none !important; }
  #labels .lbl { visibility: hidden !important; }
  html, body { background: #010101 !important; }`;

function buildModel() {
  const frame = document.createElement('iframe');
  frame.title = 'The k8 model in 3D';
  Object.assign(frame.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', border: '0', opacity: '0', visibility: 'hidden', background: '#010101' });
  glCanvas.after(frame);
  let loading = null, V = null, doc = null;
  const lvl = {
    name: '04 / MODEL · 3D VIEWER', external: true, frame, layer: frame,
    enter() { V.setPlaying(true); }, leave() { V.setPlaying(false); }, reset() { V.showStep('whole'); }, unzoom() { V.showStep('whole'); },
    get viewer() { return V; },
    load() {
      if (loading) return loading;
      $('stat').textContent = 'loading model…';
      frame.src = '../index.html?explore=1';
      loading = new Promise(ok => frame.addEventListener('load', ok, { once: true })).then(async () => {
        const w = frame.contentWindow; doc = frame.contentDocument;
        const st = doc.createElement('style'); st.textContent = HIDE_CHROME; doc.head.append(st);
        for (let i = 0; i < 400 && !(w.K8Viewer && w.K8Viewer.ready); i++) await new Promise(r => setTimeout(r, 50));
        V = w.K8Viewer; await V.ready;
        V.showStep('whole'); V.setPlaying(false);
        $('stat').textContent = 'model ready';
      });
      return loading;
    },
    hotspots: Object.entries(STAGES).map(([key, label]) => ({ id: key, label, stage: key,
      screen() {
        const el = doc && doc.querySelector(`#labels .lbl.stage[data-key="${key}"]`);
        if (!el || el.style.display === 'none') return null;
        const r = el.getBoundingClientRect(); if (!r.width) return null;
        return { x: r.left + 6, y: r.top + r.height / 2 };
      } })),
    update() {},
  };
  return lvl;
}

const v = new THREE.Vector3(), n = new THREE.Vector3(), toCam = new THREE.Vector3();
let dots = [];
function mountDots(lvl) {
  dotsEl.replaceChildren(); dots = [];
  for (const h of lvl.hotspots) {
    const b = document.createElement('button'); b.className = 'dot'; b.type = 'button';
    b.setAttribute('aria-label', h.label.replace('\n', ', '));
    const s = document.createElement('span'); s.textContent = h.label; b.append(s);
    b.addEventListener('click', () => onHotspot(h));
    const hold = on => () => { lvl.hold = on; };
    b.addEventListener('pointerenter', hold(true)); b.addEventListener('pointerleave', hold(false));
    b.addEventListener('focus', hold(true)); b.addEventListener('blur', hold(false));
    b.addEventListener('pointerenter', () => hilite(h.id, true)); b.addEventListener('pointerleave', () => hilite(h.id, false));
    dotsEl.append(b); dots.push({ h, b });
  }
}
function placeDots() {
  const lay = layout(), { W: w, H: hgt, model: m } = lay, pad = lay.form === 'phone' ? -22 : 24;
  for (const { h, b } of dots) {
    let x, y, on;
    if (h.screen) {
      const p = h.screen(); on = !!p && !busy && !finaleRun; if (p) { x = p.x; y = p.y; }
    } else {
      h.anchor.updateWorldMatrix(true, false);
      h.anchor.getWorldPosition(v);
      n.copy(h.normal).transformDirection(h.anchor.matrixWorld);
      toCam.subVectors(camera.position, v).normalize();
      const facing = n.dot(toCam) > .15;
      v.project(camera);
      on = facing && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 && !busy && !finaleRun && !predict;
      x = (v.x * .5 + .5) * w; y = (-v.y * .5 + .5) * hgt;
    }
    if (on && (x < m.x - pad || x > m.x + m.w + pad || y < m.y - pad || y > m.y + m.h + pad)) on = false;
    b.classList.toggle('hidden', !on);
    if (lay.form === 'phone' && x !== undefined) {
      const s = b.firstChild, sw = s._w || (s._w = s.offsetWidth);
      s.style.setProperty('--lx', (Math.max(8, Math.min(w - 8 - sw, x - sw / 2)) - x).toFixed(0) + 'px');
    }
    if (x !== undefined) b.style.transform = `translate(${x}px, ${y}px)`;
  }
}

const levels = {}; let L = null, busy = false; const stack = [];
const T = () => { const k = finaleRun ? .6 : 1; return { dive: +$('tDive').value * k, cut: +$('tCut').value * k, flash: $('tFlash').checked }; };
let finaleRun = false, predict = false;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function setLevel(lvl) {
  L = lvl;
  if (!lvl.external) { camera.near = lvl.near; camera.far = lvl.far; camera.updateProjectionMatrix(); }
  $('lvl').textContent = lvl.name; mountDots(lvl); mountPanel(lvl);
  lvl.zoomed = false; showBack();
  $('tune').style.display = lvl.external ? 'none' : '';
  $('finale').classList.toggle('on', lvl === levels.model);
  $('mswitch').hidden = lvl !== levels.model;
  $('bswitch').classList.toggle('on', lvl === levels.board);
  if (lvl === levels.die) levels.model.load();
  $('flow').classList.toggle('on', lvl === levels.die);
}

const fadeEl = $('fade');
function fadeTo(o, ms, easing = 'ease-in-out') {
  const from = +getComputedStyle(fadeEl).opacity;
  const a = fadeEl.animate([{ opacity: from }, { opacity: o }], { duration: ms, easing, fill: 'forwards' });
  return a.finished.then(() => { fadeEl.style.opacity = o; a.cancel(); });
}
async function diveInto(h) {
  busy = true; const t = T(); const from = L, next = levels[h.dive];
  markOpen(null); hidePanel();
  if (from.external) {
    from.leave(); stack.push({ lvl: from, h }); await next.load();
    from.layer.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.8)' }], { duration: t.cut * 1.4, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' });
    setLevel(next); next.layer.style.visibility = 'visible';
    next.layer.animate([{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1)' }], { duration: t.cut * 1.6, easing: 'cubic-bezier(.2,0,.1,1)', fill: 'forwards' });
    if (t.flash) flash.animate([{ opacity: .9 }, { opacity: 0 }], { duration: t.cut * .8, easing: 'ease-out' });
    next.enter(); await sleep(t.cut * 1.6); from.layer.style.visibility = 'hidden';
    busy = false; return;
  }
  if (from.playing !== undefined) from.playing = false;
  const exit = from.exitPose(h), D = t.dive / 1000, vEnd = 2 * Math.log(cur.dist / exit.dist) / D;
  const FADE = Math.min(650, t.dive * .45);
  const fadeOut = sleep(t.dive - FADE).then(() => fadeTo(1, FADE, 'ease-in'));
  await flyTo(exit, t.dive, turnFirst, ease.in2); await fadeOut;
  stack.push({ lvl: from, h });
  const t0 = performance.now(); let swapMs = 0;
  if (next.external) {
    const slow = setTimeout(() => fadeEl.classList.add('loading'), 200);
    const failed = await next.load().then(() => null, e => e);
    clearTimeout(slow); fadeEl.classList.remove('loading');
    if (failed) {
      console.warn('model view did not load', failed); stack.pop();
      $('fadeMsg').textContent = 'The model view did not load. Try again.'; fadeEl.classList.add('loading');
      await sleep(1600); fadeEl.classList.remove('loading');
      mountPanel(from); if (from.playing !== undefined) from.playing = true;
      fadeTo(0, 600, 'ease-out'); await flyTo(from.home(), 900, ease.out);
      $('fadeMsg').textContent = 'Loading…'; busy = false; return;
    }
    setLevel(next); glCanvas.style.visibility = 'hidden';
    next.layer.getAnimations().forEach(a => a.cancel()); next.layer.style.visibility = 'visible'; next.layer.style.opacity = 1;
    next.layer.animate([{ transform: 'scale(.95)' }, { transform: 'scale(1)' }], { duration: 1000, easing: 'cubic-bezier(.2,0,.1,1)' });
    next.enter(); swapMs = performance.now() - t0;
    await sleep(40); await fadeTo(0, 700, 'ease-out');
  } else {
    await renderer.compileAsync(next.scene, camera);
    setLevel(next);
    const home = next.home(), Tarr = 1.2, k = matchK(vEnd, Tarr, 3);
    Object.assign(cur, pose(home.target, home.dir, home.dist * k));
    applyPose(cur); renderer.render(L.scene, camera); swapMs = performance.now() - t0; await sleep(40);
    const fadeIn = fadeTo(0, 700, 'ease-out');
    await flyTo(home, Tarr * 1000, ease.out); await fadeIn;
  }
  $('stat').textContent = `swap ${swapMs.toFixed(0)} ms, in the dark`;
  busy = false;
}

async function backOut() {
  if (busy || !stack.length) return;
  busy = true; const t = T(); const { lvl: prev, h } = stack.pop(), from = L;
  const FADE = Math.min(600, t.cut);
  if (from.external) {
    if (prev.external) {
      from.leave();
      from.layer.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.55)' }], { duration: t.cut * 1.2, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' });
      setTimeout(() => { from.layer.style.visibility = 'hidden'; from.reset(); }, t.cut * 1.2);
      setLevel(prev); prev.layer.style.visibility = 'visible';
      prev.layer.animate([{ opacity: 0, transform: 'scale(1.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: t.cut * 1.4, easing: 'cubic-bezier(.2,0,.1,1)', fill: 'forwards' });
      prev.enter(); await sleep(t.cut * 1.4); busy = false; return;
    }
    from.layer.animate([{ transform: 'scale(1)' }, { transform: 'scale(.94)' }], { duration: FADE, easing: 'ease-in', fill: 'forwards' });
    await fadeTo(1, FADE, 'ease-in');
    from.leave(); from.layer.getAnimations().forEach(a => a.cancel()); from.layer.style.visibility = 'hidden'; from.layer.style.opacity = ''; from.reset();
    glCanvas.style.visibility = '';
  } else {
    const span = Math.log(prev.home().dist / prev.exitPose(h).dist), vStart = 2 * span / (t.dive / 1000);
    const fadeOut = sleep(Math.max(0, t.cut - FADE)).then(() => fadeTo(1, FADE, 'ease-in'));
    await flyTo(pose(cur.target, cur.dir, cur.dist * matchK(vStart, t.cut / 1000, 2)), t.cut, ease.in2); await fadeOut;
  }
  await renderer.compileAsync(prev.scene, camera);
  setLevel(prev);
  Object.assign(cur, prev.exitPose(h));
  applyPose(cur); renderer.render(L.scene, camera); await sleep(40);
  const fadeIn = fadeTo(0, 700, 'ease-out');
  await flyTo(prev.home(), t.dive, ease.out2, ease.out2); await fadeIn;
  if (prev.playing !== undefined) prev.playing = true;
  busy = false;
}

async function onHotspot(h, fromRow = false) {
  if (busy) return;
  if (h.stage) { L.viewer.showStep(h.stage); L.zoomed = true; showBack(); return; }
  if (h.dive && !fromRow && (layout().form !== 'phone' || openId === h.id)) return diveInto(h);
  if (L.playing !== undefined) L.playing = false;
  markOpen(h.id);
  busy = true; L.zoomed = true; showBack(); await flyTo(L.approach(h), 1100); busy = false;
}

function mountPanel(lvl) {
  panelOn = !lvl.external && lvl.hotspots.length > 0 && !finaleRun;
  $('panel').classList.toggle('off', !panelOn); $('pnav').classList.toggle('off', !panelOn); $('panel').classList.remove('is-ending');
  openId = null;
  credit(lvl);
  if (!panelOn) return;
  $('psub').textContent = lvl.sub || ''; $('ptitle').textContent = lvl.title || '';
  const rows = $('rows'); rows.replaceChildren();
  lvl.hotspots.forEach((h, i) => {
    const r = document.createElement('div'); r.className = 'prow'; r.dataset.id = h.id;
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-expanded', 'false');
    b.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}<i>/${String(lvl.hotspots.length).padStart(2, '0')}</i></span><span></span><span class="pm">+</span>`;
    b.children[1].textContent = h.title || h.label.split('\n')[0];
    const body = document.createElement('div'); body.className = 'body';
    const pp = document.createElement('p'); pp.textContent = h.text || ''; body.append(pp);
    if (h.facts) { const f = document.createElement('div'); f.className = 'facts';
      for (const [k, v] of h.facts) { const d = document.createElement('div'); d.append(k + ' · '); const bb = document.createElement('b'); bb.textContent = v; d.append(bb); f.append(d); }
      body.append(f); }
    if (h.dive) { const d = document.createElement('button'); d.type = 'button'; d.className = 'divebtn'; d.textContent = 'DIVE IN  →';
      d.addEventListener('click', () => { if (!busy) diveInto(h); }); body.append(d); }
    b.addEventListener('click', () => { if (openId === h.id) back(); else onHotspot(h, true); });
    r.addEventListener('pointerenter', () => hilite(h.id, true)); r.addEventListener('pointerleave', () => hilite(h.id, false));
    r.append(b, body); rows.append(r);
  });
}
function credit(lvl) {
  const old = document.getElementById('pcredit'); if (old) old.remove();
  if (lvl !== levels.head) return;
  const c = document.createElement('p'); c.id = 'pcredit'; c.className = 'pcredit';
  c.innerHTML = 'Headset: "<a href="https://sketchfab.com/3d-models/meta-quest-3-65a813833dc04eeeb7d33bdca58c184c" target="_blank" rel="noopener">Meta Quest 3</a>" by <a href="https://sketchfab.com/ElinHohler" target="_blank" rel="noopener">Elin</a>, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>, modified (logo removed, fitted). Not affiliated with Meta.';
  $('panel').append(c);
}
function markOpen(id) {
  openId = id;
  const H = L ? L.hotspots : [], i = H.findIndex(h => h.id === id), dive = i >= 0 && !!H[i].dive && layout().form === 'phone';
  $('panel').classList.toggle('has-open', i >= 0); $('prule').style.setProperty('--p', i < 0 ? 0 : (i + 1) / H.length);
  dots.forEach(d => d.b.classList.toggle('on', d.h.id === id));
  $('pnav').classList.toggle('dive', dive); $('pnav').lastElementChild.setAttribute('aria-label', dive ? 'Dive in' : 'Next part');
  setMore(false);
  document.querySelectorAll('.prow').forEach(r => { const on = r.dataset.id === id; r.classList.toggle('open', on);
    r.querySelector('button').setAttribute('aria-expanded', on); r.querySelector('.pm').textContent = on ? '—' : '+'; });
}
function hilite(id, on) {
  const r = document.querySelector(`.prow[data-id="${id}"]`); if (r) r.classList.toggle('hl', on);
  const d = dots.find(x => x.h.id === id); if (d) d.b.classList.toggle('hl', on);
}
function hidePanel() { panelOn = false; $('panel').classList.add('off'); $('pnav').classList.add('off'); }
function setMore(on) { document.body.classList.toggle('more', on); $('pmore').textContent = on ? 'LESS —' : 'MORE +'; $('pmore').setAttribute('aria-expanded', on); }
$('pmore').addEventListener('click', () => setMore(!document.body.classList.contains('more')));
$('rows').addEventListener('click', e => { if (layout().form === 'phone' && e.target.closest('.body p, .ending p')) setMore(!document.body.classList.contains('more')); });
document.querySelectorAll('#pnav .circ').forEach(b => b.addEventListener('click', () => {
  if (!panelOn || busy) return;
  const H = L.hotspots, n = H.length, d = +b.dataset.d, i = H.findIndex(h => h.id === openId);
  if (d > 0 && i >= 0 && H[i].dive && layout().form === 'phone') return diveInto(H[i]);
  const from = i < 0 ? (d > 0 ? -1 : 0) : i;
  onHotspot(H[((from + d) % n + n) % n], true);
}));

function showBack() {
  const close = HERO && mode === 'live' && !stack.length && !L.zoomed && layout().form !== 'phone';
  $('close').classList.toggle('on', HERO && mode === 'live');
  $('back').style.display = stack.length || L.zoomed || close ? 'block' : 'none';
  $('back').textContent = close ? '✕' : '←'; $('back').setAttribute('aria-label', close ? 'Close the interactive view' : 'Back out one level');
}
async function back() {
  if (busy) return;
  if (predict) return closeView();
  if (HERO && mode === 'live' && !stack.length && !L.zoomed) return closeView();
  if (L.zoomed) {
    L.zoomed = false; showBack(); markOpen(null);
    if (L.external) return L.unzoom();
    if (L.playing !== undefined) L.playing = true;
    busy = true; await flyTo(L.home(), 900); busy = false; return;
  }
  return backOut();
}
$('back').addEventListener('click', back);

async function finale() {
  if (busy || L !== levels.model) return;
  busy = true; finaleRun = true; $('finale').classList.remove('on');
  const from = L, H = levels.head, E = 'cubic-bezier(.65,0,.35,1)', MS = 1100;
  stack.length = 0;
  await renderer.compileAsync(H.scene, camera);
  predict = true; H.setPredict(true); H.playing = true;
  setLevel(H); markOpen(null);
  finaleRun = false; mountEnding();
  const p = H.predictPose(); Object.assign(cur, pose(p.target, p.dir, p.dist * 1.12));
  applyPose(cur); renderer.render(L.scene, camera);
  glCanvas.style.visibility = '';
  from.leave(); from.layer.getAnimations().forEach(a => a.cancel()); from.layer.style.opacity = 1;
  const out = from.layer.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }], { duration: MS, easing: E, fill: 'forwards' });
  glCanvas.animate([{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], { duration: MS, easing: E });
  $('panel').animate([{ transform: 'translateX(40%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: MS * .8, delay: MS * .35, easing: 'cubic-bezier(.2,0,.1,1)', fill: 'backwards' });
  flyTo(p, MS + 400, ease.out);
  await out.finished;
  from.layer.style.visibility = 'hidden'; from.layer.style.opacity = ''; out.cancel(); from.reset();
  busy = false; showBack();
}
function mountEnding() {
  panelOn = true; $('panel').classList.remove('off'); $('panel').classList.add('is-ending'); $('pnav').classList.add('off');
  $('psub').textContent = 'LEVEL 01 · 200 MS AHEAD'; $('ptitle').textContent = 'The prediction';
  const rows = $('rows'); rows.replaceChildren();
  const d = document.createElement('div'); d.className = 'ending';
  const p1 = document.createElement('p'); p1.textContent = 'The solid headset is a real player\'s head: 12 s of Beat Saber from the public QuestSet dataset (CC BY 4.0), which k8 never trained on. The yellow ghost is where k8 says it will be 200 ms from now, drawn before it gets there. The arc between the two pointers is the error.';
  const p2 = document.createElement('p'); p2.className = 'dim'; p2.textContent = 'The error shown is for the prediction that has just come due, the one made 200 ms ago.';
  const ro = document.createElement('div'); ro.className = 'facts ro';
  ro.innerHTML = '<div>ERROR NOW · <b data-r="err">–</b></div><div>IF THE HEAD HELD STILL · <b data-r="hold">–</b></div><div>TEST-SET MEAN, 1,049 PLAYERS · <b>4.50°</b></div>';
  const again = document.createElement('button'); again.type = 'button'; again.className = 'divebtn'; again.textContent = 'GO INSIDE AGAIN  →';
  again.addEventListener('click', exitPredict);
  d.append(p1, ro, p2, again); rows.append(d);
}
async function exitPredict() {
  if (busy) return;
  predict = false; levels.head.setPredict(false); mountPanel(levels.head);
  busy = true; await flyTo(levels.head.home(), 1100, ease.inOut); busy = false; showBack();
}
let roAt = 0;
function updateReadout(now) {
  if (!predict || now - roAt < 250) return; roAt = now;
  const r = levels.head.readout(); if (!r) return;
  const e = document.querySelector('.ro [data-r="err"]'), h = document.querySelector('.ro [data-r="hold"]');
  if (e) e.textContent = r.err.toFixed(1) + '°'; if (h) h.textContent = r.hold.toFixed(1) + '°';
}
$('finale').addEventListener('click', finale);
addEventListener('k8:finale', finale);

const EMBED = new URLSearchParams(location.search).has('embed');
if (!new URLSearchParams(location.search).has('tune')) document.documentElement.classList.add('notune');
if (EMBED) document.documentElement.classList.add('embed');
const toPage = msg => { if (EMBED && parent !== window) parent.postMessage({ k8journey: msg }, location.origin); };
const HERO = !new URLSearchParams(location.search).has('nohero') && (location.hash !== '#model' || EMBED);
let mode = 'live';
let looping = true, last = performance.now();
function play(on) { if (on === looping) return; looping = on; last = performance.now(); renderer.setAnimationLoop(on ? loop : null); }
function enterHero() {
  mode = 'hero'; document.body.classList.add('hero'); hidePanel(); markOpen(null);
  renderer.setClearColor(0x010101, 0);
  if (levels.head) levels.head.playing = true;
}
async function launch() {
  if (busy || mode !== 'hero') return;
  play(true);
  busy = true; mode = 'live'; document.body.classList.remove('hero');
  setTimeout(() => { if (mode === 'live') renderer.setClearColor(0x010101, 1); }, 650);
  mountPanel(levels.head);
  await flyTo(levels.head.home(), 1700, ease.inOut);
  busy = false; showBack(); $('back').focus({ preventScroll: true });
}
async function closeView() {
  while (busy) await sleep(50);
  busy = true; markOpen(null); hidePanel(); showBack();
  if (predict) { predict = false; levels.head.setPredict(false); }
  if (L !== levels.head) {
    await fadeTo(1, 450, 'ease-in');
    if (L.external) { L.leave(); L.layer.getAnimations().forEach(a => a.cancel()); L.layer.style.visibility = 'hidden'; L.layer.style.opacity = ''; L.reset(); glCanvas.style.visibility = ''; }
    stack.length = 0; setLevel(levels.head); hidePanel(); markOpen(null);
    Object.assign(cur, levels.head.home()); applyPose(cur); renderer.render(L.scene, camera);
    fadeTo(0, 600, 'ease-out');
  }
  levels.head.zoomed = false;
  await flyTo(levels.head.heroPose(performance.now() / 1000, face), 1400, ease.inOut);
  enterHero(); busy = false; showBack();
  if (EMBED) toPage('closed'); else $('launch').focus({ preventScroll: true });
}
let closing = false;
function requestClose() {
  if (mode !== 'live') { toPage('closed'); return; }
  if (closing) return; closing = true; closeView().finally(() => { closing = false; });
}
$('close').addEventListener('click', requestClose);
$('launch').addEventListener('click', launch);
let face = 0, faceTo = EMBED ? 0 : 1;
addEventListener('message', e => { if (e.origin !== location.origin || !e.data) return;
  const m = e.data.k8journey;
  if (m === 'launch') { play(true); launch(); }
  else if (m === 'face') faceTo = Math.max(0, Math.min(1, +e.data.p || 0));
  else if (m === 'pause') play(false);
  else if (m === 'play') play(true);
  else if (m === 'close') requestClose(); });
addEventListener('keydown', e => { if (e.key === 'Escape') back(); });

resize();
levels.head = buildHeadset();
levels.board = buildBoard();
levels.die = buildDie();
const ctx = { setZoomed(z) { if (L && L.external) { L.zoomed = z; showBack(); } },
  dive(key) { if (!busy) diveInto({ id: 'into-' + key, dive: key }); } };
levels.model = MODEL === 'b' ? makeB(ctx) : MODEL === '3d' ? buildModel() : makeA(ctx);
if (levels.model.layer !== levels.model.frame) glCanvas.after(levels.model.layer);
setLevel(levels.head);
Object.assign(cur, levels.head.home());
if (HERO && location.hash !== '#model') { enterHero(); face = faceTo; Object.assign(cur, levels.head.heroPose(0, face)); }
await levels.board.ready;
await renderer.compileAsync(levels.board.scene, camera);
await renderer.compileAsync(levels.die.scene, camera);
{ const rt = new THREE.WebGLRenderTarget(64, 64), keep = { ...cur };
  for (const lv of [levels.head, levels.board, levels.die]) { Object.assign(cur, lv.home()); applyPose(cur); renderer.setRenderTarget(rt); renderer.render(lv.scene, camera); }
  renderer.setRenderTarget(null); rt.dispose(); Object.assign(cur, keep); applyPose(cur); }

if (location.hash === '#model') {
  const target = levels.model;
  await target.load();
  for (const [lv, id] of [[levels.head, 'proc'], [levels.board, 'soc'], [levels.die, 'npu']]) stack.push({ lvl: lv, h: lv.hotspots.find(h => h.id === id) });
  levels.head.playing = false;
  setLevel(target); target.layer.style.visibility = 'visible'; target.layer.style.opacity = '1'; target.enter();
}
document.querySelectorAll('#bswitch button').forEach(b => b.addEventListener('click', () => levels.board.setSide && levels.board.setSide(+b.dataset.s)));
document.querySelectorAll('#mswitch button').forEach(b => {
  b.setAttribute('aria-pressed', b.dataset.m === MODEL);
  b.addEventListener('click', () => { const u = new URL(location.href); u.searchParams.set('model', b.dataset.m); u.hash = L.external ? 'model' : '';
    location.href = u.href; if (u.hash && u.pathname + u.search === location.pathname + location.search) location.reload(); });
});

renderer.setAnimationLoop(looping ? loop : null);
function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  updateReadout(now);
  if (tween) tween.step(now);
  else if (mode === 'hero') {
    face += (faceTo - face) * Math.min(1, dt * 4);
    Object.assign(cur, levels.head.heroPose(now / 1000, face));
  }
  const want = offsetFor(layout());
  if (Math.abs(want.x - off.x) > .5 || Math.abs(want.y - off.y) > .5) { const a = Math.min(1, dt * 5); setOffset(off.x + (want.x - off.x) * a, off.y + (want.y - off.y) * a); }
  if (reframe && !busy && !tween && mode === 'live' && !L.external) {
    reframe = false; const h = L.zoomed && L.hotspots.find(x => x.id === openId);
    Object.assign(cur, predict ? levels.head.predictPose() : h ? L.approach(h) : L.home());
  }
  if (!L.external) {
    L.update(dt);
    applyPose(cur);
    renderer.render(L.scene, camera);
  }
  placeDots();
}
toPage('ready');
window.DIVE = { levels, camera, cur, renderer, layout, get level() { return L; }, get busy() { return busy; },
  subjectBox() {
    if (!L || L.external || !L.subject) return null;
    const p = new THREE.Vector3(), { W, H, model: m } = layout();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const r of L.subject()) r.traverseVisible(o => { if (!o.isMesh) return; const n = o.geometry.attributes.position.count;
      for (let i = 0; i < n; i += Math.max(1, n >> 14)) { o.getVertexPosition(i, p); p.applyMatrix4(o.matrixWorld).project(camera);
        const x = (p.x * .5 + .5) * W, y = (-p.y * .5 + .5) * H; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
    const r = v => Math.round(v);
    return { box: [r(x0), r(y0), r(x1), r(y1)], rect: [r(m.x), r(m.y), r(m.x + m.w), r(m.y + m.h)],
      inside: x0 >= m.x - 2 && y0 >= m.y - 2 && x1 <= m.x + m.w + 2 && y1 <= m.y + m.h + 2 };
  } };
