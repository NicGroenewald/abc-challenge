import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeHead, lookLights } from './head3d.js';

const INDEX = window.TRACE_INDEX || [];
window.TRACES = window.TRACES || {};
let D = null, shown, S, meanErr, maxDiff = 0;
let CALL = null, PICK = null, GMIX = null, guideInset = null, glowDom = null, glowSel = null;
const U = { hov: null, fpick: null, ppick: null, hpick: null, fexp: false, btab: 'dw', htab: 'w', swapped: false, pick: null };
let LB = 1, ONE = false, tourDirty = true, tourT = 0;
function fetchTrace(id) {
  return new Promise((ok, bad) => {
    if (window.TRACES[id]) return ok(window.TRACES[id]);
    const s = document.createElement('script'); s.src = `traces/${id}.js?r=q1`;
    s.onload = () => window.TRACES[id] ? ok(window.TRACES[id]) : bad(new Error(`traces/${id}.js loaded but defined no trace`)); s.onerror = () => bad(new Error(`traces/${id}.js`)); document.head.appendChild(s);
  });
}

const TS = 0.025, NP = 400;
const ZP = 0.06, Z0 = 0.25;
const zc = (s, c) => (s ? -1 : 1) * (Z0 + c * ZP);
const zr = (r, n, p = .09) => (r - (n - 1) / 2) * p;
const DIL = [1, 8, 47], SIGNS = [1, -1, -1, 1, -1, 1, 1], H = 20, TAU = 10;
const LY = { in: 0, feat: 1.1, proj: 2.3, dw: b => 3.05 + 2.1 * b, upd: b => 3.75 + 2.1 * b, out: b => 4.4 + 2.1 * b, head: 9.8, prior: 10.9, corr: 11.25, r: 11.6 };
const yIn = b => b === 0 ? LY.proj : LY.out(b - 1);
const FY = LY.r + 1.1;
const CX = .35;
const ELAPSED = Array.from({ length: H }, (_, i) => -TAU * Math.expm1(-(i + 1) / TAU) / 100);

const K = window.K8I;
const SRGB = THREE.SRGBColorSpace, rampC = t => new THREE.Color().setRGB(...K.ramp(t), SRGB);
const tmpF = new THREE.Color(), cNeg = rampC(-.64), cZero = rampC(0), cPos = rampC(.64), cNone = new THREE.Color('#0c1018'), tmpC = new THREE.Color();
const DIM = .25;
const LIVE = { input: 1, feat: 0, proj: 7, blk0: 56, blk1: 329, blk2: 0 };
const dimC = (col, live) => live ? col : col.lerp(cZero, 1 - DIM);
const _rgb = [0, 0, 0], divColor = (v, s) => { K.ramp3(v / (s || 1), _rgb); return tmpC.setRGB(_rgb[0], _rgb[1], _rgb[2], SRGB); };
const pct = (a, p) => { const b = new Float64Array(a.length); for (let i = 0; i < b.length; i++) b[i] = Math.abs(a[i]); b.sort(); return b[Math.floor(p * (b.length - 1))] || 1; };
const blockIn = (b, i) => K.blockIn(D, b, i);
const depthwise = (b, i) => K.depthwise(D, b, i);
const pointwise = (b, h) => K.pointwise(D, b, h);
const relu = v => v.map(r => r.map(x => Math.max(0, x)));
const geo = K.geo;
let RAW = null;
function prepare(raw) {
  RAW = raw; D = window.adaptTrace(raw); shown = D.frames.slice(D.firstShown); HGEN++;
  S = { feat: pct(shown.flatMap(f => f.feat.slice(0, 3)), .98), speed: pct(shown.map(f => f.feat[3]), .98),
    proj: pct(shown.flatMap(f => f.proj.flat()), .98), blk: [0, 1, 2].map(b => pct(shown.flatMap(f => f.blk[b].flat()), .98)),
    coef: pct(shown.flatMap(f => f.coef.flat()), .98), r: pct(shown.flatMap(f => f.r.flat()), .98) };
  meanErr = shown.reduce((a, f) => a + f.err, 0) / shown.length;
  maxDiff = 0;
  const hAll = [[], [], []], uAll = [[], [], []];
  for (let i = D.firstShown; i < D.frames.length; i++) for (let b = 0; b < 3; b++) { const h = depthwise(b, i), u = relu(pointwise(b, h)), x = blockIn(b, i), y = D.frames[i].blk[b];
    hAll[b].push(...h.flat()); uAll[b].push(...u.flat());
    for (let s = 0; s < 2; s++) for (let c = 0; c < 32; c++) maxDiff = Math.max(maxDiff, Math.abs(Math.max(0, x[s][c] + u[s][c]) - y[s][c])); }
  S.dw = hAll.map(a => pct(a, .98)); S.upd = uAll.map(a => pct(a, .98));
  S.err = pct(shown.flatMap(f => f.pred.map((q, t) => geo(q, f.truth[t]))), .98);
}
const featScale = i => i < 3 ? S.feat : i === 3 ? S.speed : 1;

let needsRender = true, wakeLoop = null; const requestRender = () => { needsRender = true; if (wakeLoop) wakeLoop(); };
let renderer;
const BOOT = window.K8_BOOT || { tier: 'full', tierMode: 'auto' };
const EMB = () => window.K8_EMBED || null;
function viewport() {
  const e = EMB(); if (!e || !e.el) return { left: 0, top: 0, width: innerWidth, height: innerHeight };
  const r = e.el.getBoundingClientRect(); return { left: r.left, top: r.top, width: Math.max(1, r.width), height: Math.max(1, r.height) };
}
window.K8Viewport = viewport;
let EMB_ACTIVE = true;
let EMBT = null;
let readyOk, readyBad, readyDone = false; const READY = new Promise((ok, bad) => { readyOk = ok; readyBad = bad; }); READY.catch(() => {});
try { if (window.K8_NOSTART) throw new Error(window.K8_NOSTART); renderer = new THREE.WebGLRenderer({ antialias: BOOT.tier === 'full' || !!BOOT.phone, ...(EMB() && EMB().clear && { alpha: true }) }); }
catch (err) { if (EMB()) { readyBad(err); window.K8Viewer = { ready: READY }; }
  else if (BOOT.startLite) BOOT.startLite('WebGL2 could not start on this computer.'); throw err; }
renderer.localClippingEnabled = true;
 renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(viewport().width, viewport().height);
document.getElementById('scene').appendChild(renderer.domElement);
const labelR = new CSS2DRenderer({ element: document.getElementById('labels') }); labelR.setSize(viewport().width, viewport().height);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#000');
const camera = new THREE.PerspectiveCamera(40, viewport().width / viewport().height, .02, 300);
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, zoomToCursor: true, screenSpacePanning: true, minDistance: .2, maxDistance: 120, rotateSpeed: .8 });
const labelsEl = document.getElementById('labels'), labelsHome = [labelsEl.parentNode, labelsEl.nextSibling];
let domEmbedded = false, embedRO = null;
function placeDom() {
  const e = EMB(), c = renderer.domElement;
  if (e && e.el) {
    if (getComputedStyle(e.el).position === 'static') e.el.style.position = 'relative';
    Object.assign(c.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' }); c.tabIndex = -1;
    Object.assign(labelsEl.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' }); labelsEl.inert = true; labelsEl.setAttribute('aria-hidden', 'true');
    e.el.append(c, labelsEl); controls.enabled = false; domEmbedded = true;
    if (embedRO) embedRO.disconnect(); embedRO = new ResizeObserver(() => onResize()); embedRO.observe(e.el);
  } else if (domEmbedded) {
    Object.assign(c.style, { position: '', left: '', top: '', pointerEvents: '' }); c.tabIndex = 0;
    Object.assign(labelsEl.style, { position: '', left: '', top: '', pointerEvents: '' }); labelsEl.inert = false; labelsEl.removeAttribute('aria-hidden');
    document.getElementById('scene').appendChild(c); labelsHome[0].insertBefore(labelsEl, labelsHome[1]); controls.enabled = true; domEmbedded = false;
    if (embedRO) { embedRO.disconnect(); embedRO = null; }
  }
}
placeDom();
lookLights(scene, renderer, scene);
const floor = new THREE.GridHelper(60, 60, 0x18202d, 0x111823); floor.position.set(6, -3.2, -3); scene.add(floor);
floor.material.vertexColors = false; floor.material.color.set('#1c1c1c'); floor.material.needsUpdate = true;
if (EMB() && EMB().clear) { scene.background = null; renderer.setClearColor(0x000000, 0); floor.layers.set(2); }

const GROUPS = {}; let CUR = null;
const MODEL = new THREE.Group(); MODEL.matrixAutoUpdate = false; MODEL.matrix.set(0, 1, 0, 0,  0, 0, 1, 0,  1, 0, 0, 0,  0, 0, 0, 1); scene.add(MODEL);
const W = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(MODEL.matrix);
const stageGroup = n => { const g = new THREE.Group(); MODEL.add(g); GROUPS[n] = g; CUR = g; return g; };
const add = o => (CUR || scene).add(o);
const inGroup = (n, fn) => { const p = CUR; CUR = GROUPS[n]; fn(); CUR = p; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pickables = [], allLabels = [], lines = [];

function label(html, pos, cls = 'lbl', key = null, parent = null) {
  const el = document.createElement('div'); el.className = cls; el.innerHTML = html;
  if (key) { el.classList.add('click'); el.dataset.key = key; el.setAttribute('role', 'button'); el.tabIndex = 0;
    el.addEventListener('click', e => { e.stopPropagation(); select(key); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); select(key); } }); }
  else el.setAttribute('aria-hidden', 'true');
  const o = new CSS2DObject(el); o.position.copy(pos); const host = parent || CUR || scene; host.add(o);
  allLabels.push({ o, grp: host, small: !/stage|method|tap|layer/.test(cls), tap: /tap/.test(cls), layer: /layer/.test(cls) }); return o;
}
function condLabel(html, pos, cls, cond, parent = null) { const o = label(html, pos, cls, null, parent); allLabels[allLabels.length - 1].cond = cond; return o; }
function slab({ rows, cols, sheets = 1, y, zf, x0 = 0, dx = -TS, h = .1, stage }) {
  const n = rows * cols * sheets, mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(TS * .82, h, ZP * .8), new THREE.MeshBasicMaterial(), n), m = new THREE.Matrix4();
  for (let s = 0; s < sheets; s++) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = (s * rows + r) * cols + c; m.makeTranslation(x0 + c * dx, y, zf(s, r)); mesh.setMatrixAt(k, m); mesh.setColorAt(k, cZero); }
  mesh.userData.stage = stage; if (stage) pickables.push(mesh); add(mesh);
  mesh.userData.grid = { rows, cols, sheets, y, zf, x0, dx, h };
  mesh.set = (s, r, c, col) => mesh.setColorAt((s * rows + r) * cols + c, col);
  return mesh;
}
function lineSet(pairs, opacity = 1, dashed = false) {
  const pos = new Float32Array(pairs.length * 6), col = new Float32Array(pairs.length * 6);
  pairs.forEach(([a, b], i) => pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = dashed ? new THREE.LineDashedMaterial({ vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, dashSize: .025, gapSize: .025 })
                     : new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', '#ifdef USE_FOG\n\tgl_FragColor.rgb *= 1.0 - smoothstep( fogNear, fogFar, vFogDepth );\n#endif'); };
  const l = new THREE.LineSegments(g, mat); l.userData.op = opacity; if (dashed) l.computeLineDistances();
  l.paint = (i, c, k) => { const v = Math.min(1, Math.max(0, k * (l.userData.static ? 1 : LB))), j = i * 6, r = c.r * v, gg = c.g * v, bb = c.b * v;
    col[j] = r; col[j + 1] = gg; col[j + 2] = bb; col[j + 3] = r; col[j + 4] = gg; col[j + 5] = bb; };
  l.done = () => { g.attributes.color.needsUpdate = true; }; add(l); lines.push(l); return l;
}
function tube(pts, color, r = .018, opacity = .8, noFrame = false) {
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(24, pts.length * 20), r, 6),
    new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity })); m.userData.noFrame = noFrame; add(m); return m;
}
const PULSES = [], pulseGeo = new THREE.SphereGeometry(.035, 10, 8);
function pulse(points, t0, dur, color, group) {
  if (reduce || !group || points.length < 2) return null;
  const m = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false }));
  const len = [0]; for (let i = 1; i < points.length; i++) len.push(len[i - 1] + points[i].distanceTo(points[i - 1]));
  m.visible = false; group.add(m); const p = { m, points, len, t0, dur }; PULSES.push(p); return p;
}
function stepPulses(now) {
  for (let k = PULSES.length - 1; k >= 0; k--) { const p = PULSES[k], u = (now - p.t0) / p.dur;
    if (u > 1) { p.m.parent && p.m.parent.remove(p.m); p.m.material.dispose(); PULSES.splice(k, 1); continue; }
    p.m.visible = u >= 0; if (u < 0) continue;
    const L = u * p.len[p.len.length - 1]; let i = 1; while (i < p.len.length - 1 && p.len[i] < L) i++;
    const a = p.len[i - 1], t = (L - a) / ((p.len[i] - a) || 1); p.m.position.lerpVectors(p.points[i - 1], p.points[i], Math.min(1, t)); }
}
const clearPulses = () => { PULSES.forEach(p => { p.m.parent && p.m.parent.remove(p.m); p.m.material.dispose(); }); PULSES.length = 0; };
function edgeBox(x0, x1, y0, y1, z0, z1, color, opacity = .7) {
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0)), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  e.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); add(e); return e;
}
const XL = -NP * TS - .55;

stageGroup('links');
const plane = new THREE.Mesh(new THREE.PlaneGeometry(NP * TS + .9, LY.out(2) - LY.feat + 1.1),
  new THREE.MeshBasicMaterial({ color: '#ffcf6e', transparent: true, opacity: .045, side: THREE.DoubleSide, depthWrite: false }));
plane.position.set(-NP * TS / 2 + .25, (LY.feat + LY.out(2)) / 2, 0); add(plane);
edgeBox(-NP * TS - .2, .7, LY.feat - .5, LY.out(2) + .6, -.001, .001, '#7d6a3e', .5);
label('Mirror plane', V(-NP * TS / 2, LY.out(2) + .75, 0), 'lbl stage', 'mirror');
label('observed stream h⁰', V(0, LY.in - 1.2, Z0 + 16 * ZP), 'lbl');
label('mirrored stream h¹', V(0, LY.in - 1.2, -(Z0 + 16 * ZP)), 'lbl');
for (const [c, t] of [[399, '−4 s'], [300, '−3 s'], [200, '−2 s'], [100, '−1 s'], [0, 'now']]) label(t, V(-c * TS, -.6, 0), 'lbl');
condLabel('200 ms', V(.5, -.6, .35), 'lbl', () => build < 0 || build >= STEPS.indexOf('out'));
const nowLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, -.4, 0), V(0, LY.r + .3, 0)]), new THREE.LineDashedMaterial({ color: '#6b6b6b', dashSize: .08, gapSize: .06 }));
nowLine.computeLineDistances(); add(nowLine);

stageGroup('input');
const SL = {};
SL.input = slab({ rows: 4, cols: NP, y: LY.in, zf: (s, r) => zr(r, 4), stage: 'input' });
label('Input', V(0, LY.in, -.6), 'lbl stage', 'input');
['w', 'x', 'y', 'z'].forEach((c, r) => label(c, V(.06 + r * .06, LY.in, zr(r, 4)), 'lbl row'));

stageGroup('feat');
SL.feat = slab({ rows: 7, cols: NP, sheets: 2, y: LY.feat, zf: zc, stage: 'feat' });
label('Features', V(0, LY.feat, -(Z0 + 32 * ZP + .45)), 'lbl stage', 'feat');
['ωx', 'ωy', 'ωz', 'speed', 'gx', 'gy', 'gz'].forEach((n, r) => { const lx = .1 + (r % 2) * .2; label(n, V(lx, LY.feat, zc(0, r)), 'lbl row'); label((SIGNS[r] < 0 ? '−' : '') + n, V(lx, LY.feat, zc(1, r)), 'lbl row');    });
const FLIPB = [];
SIGNS.forEach((s, r) => { if (s < 0) FLIPB.push(edgeBox(-NP * TS, .02, LY.feat - .07, LY.feat + .07, zc(1, r) - ZP * .5, zc(1, r) + ZP * .5, '#ffcf6e', .9)); });
const forkPts = [V(0, LY.in + .08, 0), V(0, LY.in + .6, .15), V(0, LY.feat - .08, zc(0, 3))], forkT = tube(forkPts, '#e07a5f', .014);
tube([V(0, LY.in + .08, 0), V(0, LY.in + .6, -.15), V(0, LY.feat - .08, zc(1, 3))], '#e07a5f', .014);
label('mirror copy: flip ωy ωz gx', V(.2, (LY.in + LY.feat) / 2, -.55), 'lbl');

stageGroup('proj');
SL.proj = slab({ rows: 32, cols: NP, sheets: 2, y: LY.proj, zf: zc, stage: 'proj' });
label('Projection 7→32 + ReLU', V(0, LY.proj, Z0 + 32 * ZP + 1.35), 'lbl stage', 'proj');
label('projection output', V(-NP * TS - .4, LY.proj, Z0 + 32 * ZP + .3), 'lbl layer v');
const projPairs = [];
for (let s = 0; s < 2; s++) for (let o = 0; o < 32; o++) for (let i = 0; i < 7; i++) projPairs.push([V(0, LY.feat, zc(s, i)), V(0, LY.proj, zc(s, o))]);
const projLines = lineSet(projPairs);
label('[1,7,2,1] → [1,32,2,1]', V(.25, (LY.feat + LY.proj) / 2, 1.6), 'lbl v');

const BL = [];
for (let b = 0; b < 3; b++) {
  stageGroup('blk' + b);
  const d = DIL[b], yi = yIn(b), span = 7 * d * TS, zMax = Z0 + 32 * ZP;
  const out = slab({ rows: 32, cols: NP, sheets: 2, y: LY.out(b), zf: zc, stage: 'blk' + b });
  const dw = slab({ rows: 32, cols: 1, sheets: 2, y: LY.dw(b), zf: zc, x0: CX, stage: 'blk' + b, h: .07 });
  const upd = slab({ rows: 32, cols: 1, sheets: 2, y: LY.upd(b), zf: zc, x0: CX, stage: 'blk' + b, h: .07 });
  const mem = edgeBox(-span - TS / 2, -TS / 2, yi - .09, yi + .09, -zMax, zMax, '#b7a8ff', .75);
  edgeBox(-TS / 2, TS / 2, yi - .1, yi + .1, -zMax - .01, zMax + .01, '#ffffff', .6);
  for (let j = 0; j < 8; j++) { const x = -(7 - j) * d * TS; edgeBox(x - TS * .6, x + TS * .6, yi - .11, yi + .11, -zMax - .02, zMax + .02, '#b7a8ff', .55); }
  label(`memory: last ${7 * d} inputs`, V(-span / 2 - (d === 1 ? .55 : 0), yi + .22, zMax + .05), 'lbl'); label('now', V(d === 1 ? .12 : 0, yi + .22, zMax + .05 + (d === 1 ? .12 : 0)), 'lbl');
  const TAPC = '#b7a8ff';
  if (d > 1) for (let j = 0; j < 7; j++) if (d > 8 || j % 3 === 0) label(`−${(7 - j) * d}`, V(-(7 - j) * d * TS, yi + .02, zMax + .22), 'lbl tap', null);
  const srcName = b === 0 ? 'the projection output' : `Block ${b}'s output`;
  label(`taps ${d * 10} ms apart`, V(-span / 2, yi + .02, zMax + .55), 'lbl tap v');
  const guide = [];
  for (let s = 0; s < 2; s++) for (let j = 0; j < 8; j++) guide.push([V(-(7 - j) * d * TS, yi, zc(s, 31) + (s ? -1 : 1) * .06), V(CX, LY.dw(b), zc(s, 31) + (s ? -1 : 1) * .06)]);
  const gl = lineSet(guide); gl.userData.static = true; guide.forEach((_, i) => gl.paint(i, new THREE.Color(TAPC), 1)); gl.done();
  const tapM = [];
  for (let j = 0; j < 8; j++) { const x = -(7 - j) * d * TS; const m = new THREE.Mesh(new THREE.BoxGeometry(TS * 1.1, .03, 2 * zMax + .1), new THREE.MeshBasicMaterial({ color: TAPC, transparent: true, opacity: .55 })); m.position.set(x, yi + .12, 0); add(m); tapM.push(m); }
  const dwPairs = [];
  for (let s = 0; s < 2; s++) for (let c = 0; c < 32; c++) for (let j = 0; j < 8; j++) dwPairs.push([V(-(7 - j) * d * TS, yi, zc(s, c)), V(CX, LY.dw(b), zc(s, c))]);
  const selfPairs = [], selfMeta = [], crossPairs = [], crossMeta = [];
  for (let so = 0; so < 2; so++) for (let si = 0; si < 2; si++) for (let o = 0; o < 32; o++) for (let c = 0; c < 32; c++) {
    const pr = [V(CX, LY.dw(b), zc(si, c)), V(CX, LY.upd(b), zc(so, o))];
    if (so === si) { selfPairs.push(pr); selfMeta.push([so, si, o, c]); } else { crossPairs.push(pr); crossMeta.push([so, si, o, c]); } }
  const upPairs = []; for (let s = 0; s < 2; s++) for (let c = 0; c < 32; c++) upPairs.push([V(CX, LY.upd(b), zc(s, c)), V(0, LY.out(b), zc(s, c))]);
  const skipT = [];
  const skipPts = [0, 1].map(s => { const z = zc(s, 16), p = [V(0, yi + .06, z), V(-.25, (yi + LY.out(b)) / 2, z), V(0, LY.out(b) - .06, z)]; skipT.push(tube(p, '#8390a8', .014, .9)); return new THREE.CatmullRomCurve3(p).getPoints(24); });
  const flash = new THREE.Mesh(new THREE.BoxGeometry(TS * 1.6, .26, 2 * zMax + .08), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.position.set(0, yi, 0); flash.visible = false; add(flash);
  const leave = new THREE.Mesh(new THREE.BoxGeometry(TS * 1.6, .26, 2 * zMax + .08), new THREE.MeshBasicMaterial({ color: '#ff6b5e', transparent: true, opacity: 0, depthWrite: false }));
  leave.position.set(-7 * d * TS, yi, 0); leave.visible = false; add(leave);
  const bi = b;
  condLabel('⊕ skip + mix, then ReLU', V(-.2, LY.out(b) - .2, zMax + .35), 'lbl', () => CALL && CALL.b === bi && CALL.ph >= 3);
  condLabel(`t−${7 * d} leaves the memory · now joins it`, V(-7 * d * TS, yi - .3, zMax + .35), 'lbl', () => CALL && CALL.b === bi && CALL.ph >= 4);
  const pickBoxes = Array.from({ length: 8 }, (_, j) => { const x = -(7 - j) * d * TS, e = edgeBox(x - TS * .75, x + TS * .75, yi - .09, yi + .09, -ZP * .6, ZP * .6, '#ffffff', 1); e.visible = false; return e; });
  const pickNode = edgeBox(CX - TS * .75, CX + TS * .75, LY.dw(b) - .07, LY.dw(b) + .07, -ZP * .6, ZP * .6, '#ffffff', 1); pickNode.visible = false;
  label(`Block ${b + 1}`, V(CX, (yi + LY.out(b)) / 2, Z0 + 32 * ZP + .85), 'lbl stage', 'blk' + b);
  label(`Block ${b + 1} output`, V(-NP * TS - .4, LY.out(b), Z0 + 32 * ZP + .3), 'lbl layer v');
  { const br = []; for (const z of [Z0 + 32 * ZP + .3]) br.push([V(CX, yi + .05, z), V(CX, LY.out(b) - .05, z)]);
    const bl = lineSet(br); bl.userData.static = true; bl.paint(0, new THREE.Color(TAPC), .6); bl.done(); }
  label(`8 taps, ${d} apart`, V(CX + .3, LY.dw(b), 2.1), 'lbl'); label('mix channels', V(CX + .3, LY.upd(b), 2.1), 'lbl v'); label('skip connection', V(-.35, (yi + LY.out(b)) / 2, 2.1), 'lbl');
  BL.push({ mem, tapM, skipT, zMax, out, dw, upd, d, yi, guide, tapc: TAPC, skipPts, flash, leave, pickBoxes, pickNode, dwLines: lineSet(dwPairs), selfLines: lineSet(selfPairs), crossLines: lineSet(crossPairs, .9, true), selfMeta, crossMeta, upLines: lineSet(upPairs, .5) });
}

inGroup('links', () => { const band = new THREE.Mesh(new THREE.PlaneGeometry(.42, LY.head + .3 - LY.feat), new THREE.MeshBasicMaterial({ color: '#6fa8ff', transparent: true, opacity: .035, side: THREE.DoubleSide, depthWrite: false }));
  band.position.set(CX, (LY.feat + LY.head + .3) / 2, Z0 + 32 * ZP + .15); add(band); label('compute lane (not time)', V(CX, LY.head + .45, Z0 + 32 * ZP + .15), 'lbl v'); });
stageGroup('tree');
const treePairs = [];
for (let j = 0; j < 8; j++) { const x3 = -(7 - j) * 47 * TS; treePairs.push([V(0, LY.out(2), 0), V(x3, LY.out(1), 0)]);
  for (let i = 0; i < 8; i++) { const x2 = x3 - (7 - i) * 8 * TS; treePairs.push([V(x3, LY.out(1), 0), V(x2, LY.out(0), 0)]);
    for (let k = 0; k < 8; k++) treePairs.push([V(x2, LY.out(0), 0), V(x2 - (7 - k) * TS, LY.proj, 0)]); } }
const treeLines = lineSet(treePairs, .9); treeLines.userData.static = true;
treePairs.forEach((_, i) => treeLines.paint(i, new THREE.Color('#9b8cff'), .35)); treeLines.done();
label('one output sees 393 feature steps (3.93 s)', V(-393 * TS / 2, LY.out(1) - .5, 0), 'lbl');

stageGroup('head');
const coefX = p => .22 + p * .12, coefZ = a => zr(a, 3, .14);
SL.coef = slab({ rows: 3, cols: 3, y: LY.head, zf: (s, a) => coefZ(a), x0: coefX(0), dx: .12, h: .12, stage: 'head' });
label('Readout', V(coefX(1), LY.head, coefZ(0) - .32), 'lbl stage', 'head');
['κ', 'κ²', 'κ³'].forEach((t, p) => label(t, V(coefX(p), LY.head, coefZ(2) + .15), 'lbl ax'));
['x', 'y', 'z'].forEach((t, a) => label(t, V(coefX(0) - .14, LY.head, coefZ(a)), 'lbl ax'));
const headPairs = [], headMeta = [];
for (let s = 0; s < 2; s++) for (let p = 0; p < 3; p++) for (let a = 0; a < 3; a++) for (let c = 0; c < 32; c++) {
  headPairs.push([V(0, LY.out(2), zc(s, c)), V(coefX(p), LY.head, coefZ(a))]); headMeta.push([s, p, a, c]); }
const headLines = lineSet(headPairs);

stageGroup('traj');
const fut = { x0: TS, dx: TS, zf: (s, a) => zr(a, 3, .1), h: .09 };
SL.prior = slab({ rows: 3, cols: H, y: LY.prior, ...fut, stage: 'traj' });
SL.corr = slab({ rows: 3, cols: H, y: LY.corr, ...fut, stage: 'traj' });
SL.r = slab({ rows: 3, cols: H, y: LY.r, ...fut, stage: 'traj' });
label('Trajectory', V(.25, LY.r + .45, 0), 'lbl stage', 'traj');
label('damped-velocity prior', V(-.55, LY.prior, 0), 'lbl'); label('learned residual', V(-.6, LY.corr, 0), 'lbl'); label('r = prior + residual', V(-.5, LY.r, 0), 'lbl');
tube([V(coefX(1), LY.head + .08, 0), V(.62, (LY.head + LY.corr) / 2, 0), V(.52, LY.corr, 0)], '#f0b24a', .012);

stageGroup('out');
SL.pred = slab({ rows: 4, cols: H, y: FY, x0: TS, dx: TS, zf: (s, r) => zr(r, 4), stage: 'out' });
SL.truth = slab({ rows: 4, cols: H, y: FY + .25, x0: TS, dx: TS, zf: (s, r) => zr(r, 4), h: .07, stage: 'out' });
label('Forecast', V(0, FY, .6), 'lbl stage', 'out');
SL.err = slab({ rows: 1, cols: H, y: FY + .45, x0: TS, dx: TS, zf: () => 0, h: .07, stage: 'out' });
label('predicted', V(.62, FY, -.3), 'lbl'); label('true', V(.62, FY + .25, -.3), 'lbl'); label('error per step', V(.7, FY + .45, -.3), 'lbl');
const scoredBox = edgeBox(20 * TS - TS * .7, 20 * TS + TS * .7, FY - .08, FY + .51, -.2, .2, '#ffffff', .95);
label('scored: step 20 = 200 ms', V(20 * TS, FY + .25, .32), 'lbl');
{ const seg = []; for (let k = 1; k <= H; k++) { const e = V(k * TS, FY, .16), c = V(k * TS / 2, FY, .2 + .006 * k); let p0 = V(0, FY, .16);
    for (let i = 1; i <= 10; i++) { const t = i / 10, p = V(0, FY, .16).multiplyScalar((1 - t) ** 2).add(c.clone().multiplyScalar(2 * t * (1 - t))).add(e.clone().multiplyScalar(t * t)); seg.push(p0, p); p0 = p; } }
  const a = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg), new THREE.LineBasicMaterial({ color: '#6fa8ff', transparent: true, opacity: .4 })); add(a);
  label('each step starts from now', V(.25, FY, .4), 'lbl v'); }
tube([V(.55, LY.r + .05, 0), V(.6, (LY.r + FY) / 2, 0), V(.52, FY - .05, 0)], '#6fa8ff', .014, .7);
label('Cayley map: turns → rotations', V(.75, (LY.r + FY) / 2, .3), 'lbl v');
tube([V(0, LY.in, -.25), V(.3, LY.in + .3, -2.7), V(.3, FY - .3, -2.7), V(.2, FY, -.25)], '#6fa8ff', .012, .45, true);
label('current pose q[t]', V(.3, (LY.in + FY) / 2, -2.8), 'lbl v');
inGroup('traj', () => { tube([V(0, LY.feat + .05, zc(0, 1)), V(.95, LY.feat + .3, zc(0, 1)), V(.95, LY.prior - .3, 0), V(.5, LY.prior, 0)], '#e58bb0', .012, .6, true);
  label('turning rate ω → prior', V(.95, 3.2, -.2), 'lbl v'); });

const G = new THREE.Group(); G.position.set(FY + 3.4, 0, 0); scene.add(G); GROUPS.gaze = G;
G.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 16), new THREE.MeshBasicMaterial({ color: '#2c2c2c', wireframe: true, transparent: true, opacity: .3 })));
const headM = new THREE.Group(); G.add(headM);
const bustM = new THREE.Group(); G.add(bustM);
const HEAD = makeHead(), HEAD0 = makeHead();
if (HEAD) { bustM.add(HEAD.rig, HEAD.skin); headM.scale.setScalar(.45); bustM.scale.setScalar(.45); }
else {
  const hsBody = new THREE.Mesh(new RoundedBoxGeometry(.62, .34, .3, 4, .07), new THREE.MeshLambertMaterial({ color: '#d9dee8' })); hsBody.position.z = -.04; headM.add(hsBody);
  const hsFace = new THREE.Mesh(new RoundedBoxGeometry(.56, .28, .05, 3, .02), new THREE.MeshLambertMaterial({ color: '#1b2230' })); hsFace.position.z = -.2; headM.add(hsFace);
  const hsStrap = new THREE.Mesh(new THREE.TorusGeometry(.31, .028, 8, 40, Math.PI), new THREE.MeshLambertMaterial({ color: '#3a4458' })); hsStrap.rotation.x = Math.PI / 2; hsStrap.position.z = .02; headM.add(hsStrap);
  const hsTop = new THREE.Mesh(new THREE.TorusGeometry(.2, .022, 8, 32, Math.PI), new THREE.MeshLambertMaterial({ color: '#3a4458' })); hsTop.rotation.set(0, Math.PI / 2, 0); hsTop.position.set(0, .1, .06); headM.add(hsTop);
  const hsLed = new THREE.Mesh(new THREE.SphereGeometry(.018, 10, 8), new THREE.MeshBasicMaterial({ color: '#6fa8ff' })); hsLed.position.set(.2, .08, -.23); headM.add(hsLed);
}
const gazeRay = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, -1.5)]), new THREE.LineBasicMaterial({ color: '#e6ebf2' })); G.add(gazeRay);
function arcArrow(color, cone = true, opacity = 1) {
  const n = 24, line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: n }, () => V(0, 0, 0))), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
  const head = new THREE.Mesh(new THREE.ConeGeometry(.05, .14, 12), new THREE.MeshBasicMaterial({ color })); G.add(line); if (cone) G.add(head);
  const up = V(0, 1, 0), q = new THREE.Quaternion();
  return (a, b) => {
    const ang = a.angleTo(b), pos = line.geometry.attributes.position;
    for (let i = 0; i < n; i++) { const t = i / (n - 1), p = ang < 1e-6 ? a.clone() : a.clone().multiplyScalar(Math.sin((1 - t) * ang)).add(b.clone().multiplyScalar(Math.sin(t * ang))).divideScalar(Math.sin(ang)); pos.setXYZ(i, p.x * 1.5, p.y * 1.5, p.z * 1.5); }
    pos.needsUpdate = true; line.geometry.computeBoundingSphere();
    const end = V(pos.getX(n - 1), pos.getY(n - 1), pos.getZ(n - 1)), prev = V(pos.getX(n - 2), pos.getY(n - 2), pos.getZ(n - 2)), dir = end.clone().sub(prev);
    head.visible = cone && ang > .002; if (head.visible) { head.position.copy(end); head.quaternion.copy(q.setFromUnitVectors(up, dir.normalize())); }
  };
}
const predArc = arcArrow('#6fa8ff'), truthArc = arcArrow('#4fd18b');
const fanArcs = Array.from({ length: H }, () => arcArrow('#6fa8ff', false, .3));
const upOf = q => { const [w, x, y, z] = q; return V(2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)); };
function rollTick(color) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, 0)]), new THREE.LineBasicMaterial({ color })); G.add(l);
  return (q) => { const tip = toScene(fwd(q)).normalize().multiplyScalar(1.5), up = toScene(upOf(q)).normalize().multiplyScalar(.18), a = l.geometry.attributes.position;
    a.setXYZ(0, tip.x, tip.y, tip.z); a.setXYZ(1, tip.x + up.x, tip.y + up.y, tip.z + up.z); a.needsUpdate = true; l.geometry.computeBoundingSphere(); }; }
const predTick = rollTick('#6fa8ff'), truthTick = rollTick('#4fd18b');
const dotG = new THREE.SphereGeometry(.02, 12, 8), mk = c => { const m = new THREE.Mesh(dotG, new THREE.MeshBasicMaterial({ color: c })); G.add(m); return m; };
const dotT = new THREE.OctahedronGeometry(.024), mkT = c => { const m = new THREE.Mesh(dotT, new THREE.MeshBasicMaterial({ color: c })); G.add(m); return m; };
const predDots = Array.from({ length: H }, () => mk('#6fa8ff')), truthDots = Array.from({ length: H }, () => mkT('#4fd18b')), pastDots = Array.from({ length: 41 }, () => mk('#5b6780'));
predDots[H - 1].scale.setScalar(2.2); truthDots[H - 1].scale.setScalar(2.2);
label('Head direction', V(0, 1.85, 0), 'lbl stage', 'gaze', G);
label('<span style="color:#e6ebf2">│</span> now <span style="color:#5b6780">●</span> past 400 ms <span style="color:#6fa8ff">●→</span> predicted <span style="color:#4fd18b">●→</span> true', V(0, -1.8, 0), 'lbl', null, G);
CUR = null;
const HS0 = new THREE.Group(), hs0 = HEAD0 ? new THREE.Group() : headM.clone(); hs0.scale.setScalar(HEAD0 ? 1.7 : 2.4); HS0.add(hs0); const hsBody0 = new THREE.Group(); if (HEAD0) { hsBody0.scale.setScalar(1.7); hsBody0.add(HEAD0.rig, HEAD0.skin); HS0.add(hsBody0); } HS0.position.copy(W(1.5, LY.in, 1.7)); HS0.visible = false; scene.add(HS0);
let HSL = null; inGroup('input', () => { HSL = condLabel('the headset at “now”', V(1.5, LY.in, 2.55), 'lbl', () => build === 0); });
const fwd = q => { const [w, x, y, z] = q; return V(2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)); };
const toScene = v => V(v.x, v.y, -v.z);

const CL = new THREE.Group(); CL.visible = false; MODEL.add(CL);

let idx = 0;
const cP = new THREE.Color('#ffb454'), cN = new THREE.Color('#4ea1ff'), cErr = new THREE.Color('#ff6b5e');
let UPD = 0, OUTS = null;
const shownNow = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
const stamp = (...os) => { for (const o of os) o.userData.upd = UPD; };
function anyStale() {
  if (!OUTS) OUTS = [SL.input, SL.feat, SL.proj, ...BL.map(B => B.out), projLines, ...BL.flatMap(B => [B.dw, B.upd, B.dwLines, B.selfLines, B.crossLines, B.upLines]),
    headLines, SL.coef, SL.prior, SL.corr, SL.r, SL.pred, SL.truth, SL.err, G];
  for (const o of OUTS) if (o.userData.upd !== UPD && shownNow(o)) return true;
  return false;
}
function update() {
  if (!D) return;
  UPD++;
  const f = D.frames[idx], layers = [SL.proj, BL[0].out, BL[1].out, BL[2].out], lsc = [S.proj, ...S.blk];
  const vIn = shownNow(SL.input), vFeat = shownNow(SL.feat), vL = layers.map(shownNow);
  const fM = build >= 0 && /^blk(\d)$/.exec(STEPS[build]), fL = fM ? +fM[1] : -1, fSpan = fL >= 0 ? 7 * DIL[fL] : 0;
  if (vIn) histPaint(SL.input, 4, (g, r) => divColor(g.q[r], 1), LIVE.input, null);
  if (vFeat) histPaint(SL.feat, 14, (g, k) => g.feat ? divColor(g.feat[k % 7] * (k >= 7 ? SIGNS[k % 7] : 1), featScale(k % 7)) : null, LIVE.feat, null);
  for (let L = 0; L < 4; L++) if (vL[L]) histPaint(layers[L], 64, (g, k) => { const a = L === 0 ? g.proj : g.blk[L - 1]; return a ? divColor(a[k >> 5][k & 31], lsc[L]) : null; },
    fL >= 0 && L === fL + 1 ? Math.min([LIVE.proj, LIVE.blk0, LIVE.blk1, LIVE.blk2][L], fSpan + 12) : [LIVE.proj, LIVE.blk0, LIVE.blk1, LIVE.blk2][L], L === fL ? fSpan : fL >= 0 && L === fL + 1 ? fSpan + 12 : null);
  [SL.input, SL.feat, ...layers].forEach((m, i) => { if ([vIn, vFeat, ...vL][i]) { m.instanceColor.needsUpdate = true; stamp(m); } });
  const mir = [f.feat, f.feat.map((v, i) => v * SIGNS[i])]; let k = 0;
  if (shownNow(projLines)) {
  for (let s = 0; s < 2; s++) for (let o = 0; o < 32; o++) for (let i = 0; i < 7; i++) { const v = D.W.proj[o][i] * mir[s][i] / featScale(i); const pp = U.ppick, on = !ONE || s === 0, lit = !pp || (pp.s === s && pp.o === o);
    projLines.paint(k++, v >= 0 ? cP : cN, on && lit ? Math.abs(v) * (pp ? 3 : .9) : 0); }
  projLines.done(); stamp(projLines); }
  for (let b = 0; b < 3; b++) {
    const B = BL[b], d = B.d, w = D.W.dw[b], sc = b === 0 ? S.proj : S.blk[b - 1];
    if (![B.dw, B.upd, B.dwLines, B.selfLines, B.crossLines, B.upLines].some(shownNow)) continue;
    stamp(B.dw, B.upd, B.dwLines, B.selfLines, B.crossLines, B.upLines);
    const h = depthwise(b, idx), u = relu(pointwise(b, h)), hs = S.dw[b], us = S.upd[b];
    for (let s = 0; s < 2; s++) for (let r = 0; r < 32; r++) { B.dw.set(s, r, 0, divColor(h[s][r], hs)); B.upd.set(s, r, 0, divColor(u[s][r], us)); }
    B.dw.instanceColor.needsUpdate = B.upd.instanceColor.needsUpdate = true;
    k = 0;
    const pk = PICK && PICK.b === b ? PICK : null;
    for (let s = 0; s < 2; s++) for (let c = 0; c < 32; c++) for (let j = 0; j < 8; j++) { const x = blockIn(b, idx - (7 - j) * d), v = x ? w[c][j] * x[s][c] / sc : 0;
      B.dwLines.paint(k++, v >= 0 ? cP : cN, (ONE && s) || (pk && (pk.s !== s || pk.c !== c)) ? 0 : Math.abs(v) * (pk ? (pk.tap === j ? 6 : 3) : 1.1)); }
    B.dwLines.done();
    const { A, B: Bm } = D.W.pw[b];
    const gm = GMIX && GMIX.b === b ? GMIX : null;
    const pwPaint = (set, meta, W) => { meta.forEach(([so, si, o, c], i) => { const v = W[o][c] * h[si][c] / hs;
      set.paint(i, v >= 0 ? cP : cN, ONE && (so || si) ? 0 : gm ? (so === 0 && o === gm.o ? Math.max(.25, Math.abs(v) * 1.6) : 0) : Math.abs(v) * .2 * (u[so][o] > 0 ? 1 : .05)); }); set.done(); };
    pwPaint(B.selfLines, B.selfMeta, A); pwPaint(B.crossLines, B.crossMeta, Bm);
    for (let s = 0, i = 0; s < 2; s++) for (let c = 0; c < 32; c++, i++) B.upLines.paint(i, cP, ONE && s ? 0 : u[s][c] / us * .6);
    B.upLines.done();
  }
  if (shownNow(headLines)) { stamp(headLines); headMeta.forEach(([s, p, a, c], i) => { let v = D.W.head[p * 3 + a][c] * f.blk[2][s][c] / S.blk[2]; if (s === 1 && a > 0) v = -v; const hp = U.hpick, lit = !hp || (hp.p === p && hp.a === a);
    headLines.paint(i, v >= 0 ? cP : cN, (ONE && s) || !lit ? 0 : Math.abs(v) * (hp ? 3 : 1.4)); });
  headLines.done(); }
  if (shownNow(SL.coef)) { stamp(SL.coef); for (let p = 0; p < 3; p++) for (let a = 0; a < 3; a++) SL.coef.set(0, a, p, divColor(f.coef[p][a], S.coef));
    SL.coef.instanceColor.needsUpdate = true; }
  if ([SL.prior, SL.corr, SL.r].some(shownNow)) { stamp(SL.prior, SL.corr, SL.r);
    for (let t = 0; t < H; t++) for (let a = 0; a < 3; a++) { const pr = ELAPSED[t] * f.feat[a], r = f.r[t][a];
      SL.prior.set(0, a, t, divColor(pr, S.r)); SL.corr.set(0, a, t, divColor(r - pr, S.r)); SL.r.set(0, a, t, divColor(r, S.r)); } }
  if ([SL.pred, SL.truth, SL.err].some(shownNow)) { stamp(SL.pred, SL.truth, SL.err);
    for (let t = 0; t < H; t++) { for (let r = 0; r < 4; r++) { SL.pred.set(0, r, t, divColor(f.pred[t][r], 1)); SL.truth.set(0, r, t, divColor(f.truth[t][r], 1)); }
      SL.err.set(0, 0, t, tmpC.copy(cZero).lerp(cErr, Math.min(1, geo(f.pred[t], f.truth[t]) / S.err))); } }
  [SL.prior, SL.corr, SL.r, SL.pred, SL.truth, SL.err].forEach(m => m.instanceColor.needsUpdate = true);
  headM.quaternion.set(-f.q[1], -f.q[2], f.q[3], f.q[0]).normalize(); if (HEAD) HEAD.pose(headM.quaternion, bodyRef()); poseHS0();
  const nowD = toScene(fwd(f.q)).normalize(), pD = toScene(fwd(f.pred[19])).normalize(), tD = toScene(fwd(f.truth[19])).normalize();
  if (shownNow(G)) { stamp(G); gazeUpdate(f, nowD, pD, tD); }
  document.getElementById('gkGap').textContent = `${(pD.angleTo(tD) * 180 / Math.PI).toFixed(1)}°`;
  document.getElementById('gkErr').textContent = `${f.err.toFixed(1)}°`;
  document.getElementById('readout').innerHTML = `error at 200 ms <b>${f.err.toFixed(1)}°</b> · no change ${(f.holdErr ?? geo(f.q, f.truth[19])).toFixed(1)}° · mean ${meanErr.toFixed(1)}°`;
  { const ro = document.getElementById('readout'); ro.title = ro.textContent; }
  if (WEAR.on) document.getElementById('wearVals').innerHTML = `error at 200 ms <b>${f.err.toFixed(1)}°</b> (scored, includes roll)<br>pointing gap at 200 ms <b>${(pD.angleTo(tD) * 180 / Math.PI).toFixed(1)}°</b><br>no change (hold the pose) <b>${(f.holdErr ?? geo(f.q, f.truth[19])).toFixed(1)}°</b>`;
  scrub.value = idx;
  drawInset(); requestRender();
}
let HGEN = 0;
function histPaint(mesh, R, cell, live, fadeFrom) {
  const F = D.frames.length, P = F + NP, dst = mesh.instanceColor.array, p0 = F - 1 - idx;
  let hc = mesh.userData.hc; if (!hc || hc.gen !== HGEN) hc = mesh.userData.hc = { gen: HGEN, v: [] };
  const part = (v, c0, c1) => {
    if (c1 <= c0) return;
    const Hc = hc.v[v] || (hc.v[v] = { a: new Float32Array(R * P * 3), ok: new Uint8Array(P) });
    for (let c = c0; c < c1; c++) { const p = p0 + c; if (Hc.ok[p]) continue; Hc.ok[p] = 1; const g = D.frames[idx - c];
      for (let r = 0; r < R; r++) { let col = g ? cell(g, r) : null;
        col = col ? (v ? col.lerp(cZero, 1 - DIM) : col) : cNone;
        if (v === 2) col = tmpF.copy(col).multiplyScalar(.08);
        col.toArray(Hc.a, (r * P + p) * 3); } }
    for (let r = 0; r < R; r++) dst.set(Hc.a.subarray((r * P + p0 + c0) * 3, (r * P + p0 + c1) * 3), (r * NP + c0) * 3);
  };
  const L1 = Math.min(NP, live + 1), L2 = fadeFrom == null ? NP : Math.min(NP, Math.max(L1, fadeFrom + 1));
  part(0, 0, L1); part(1, L1, L2); part(2, L2, NP);
}
function gazeUpdate(f, nowD, pD, tD) {
  for (let t = 0; t < H; t++) { predDots[t].position.copy(toScene(fwd(f.pred[t])).multiplyScalar(1.5)); truthDots[t].position.copy(toScene(fwd(f.truth[t])).multiplyScalar(1.5)); }
  pastDots.forEach((m, j) => { const g = D.frames[idx - j]; m.visible = !!g; if (g) m.position.copy(toScene(fwd(g.q)).multiplyScalar(1.5)); });
  gazeRay.geometry.attributes.position.setXYZ(1, nowD.x * 1.5, nowD.y * 1.5, nowD.z * 1.5); gazeRay.geometry.attributes.position.needsUpdate = true;
  predArc(nowD, pD); truthArc(nowD, tD); fanArcs.forEach((a, t) => a(nowD, toScene(fwd(f.pred[t])).normalize())); predTick(f.pred[19]); truthTick(f.truth[19]);
}

const insetEl = document.getElementById('inset'), captionEl = document.getElementById('caption');
let insetStatic = null, insetHTML = '';
const _tpl = document.createElement('template');
function morphHTML(el, html) { _tpl.innerHTML = html; morphKids(el, _tpl.content); }
function morphKids(a, b) {
  const an = a.childNodes, bn = b.childNodes;
  for (let i = 0; i < bn.length; i++) {
    const x = an[i], y = bn[i];
    if (!x) { a.appendChild(y.cloneNode(true)); continue; }
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName || x.namespaceURI !== y.namespaceURI) { a.replaceChild(y.cloneNode(true), x); continue; }
    if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
    const xa = x.attributes, ya = y.attributes;
    for (let k = xa.length - 1; k >= 0; k--) if (!y.hasAttribute(xa[k].name)) x.removeAttribute(xa[k].name);
    for (let k = 0; k < ya.length; k++) { const at = ya[k]; if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value); }
    morphKids(x, y);
  }
  while (an.length > bn.length) a.removeChild(a.lastChild);
}
const RENDER = { input: 'input', feat: 'feat', proj: 'proj', mirror: 'mirror', blk0: 'block', blk1: 'block', blk2: 'block', reach: 'reach', head: 'head', traj: 'traj', out: 'out', gaze: 'gaze' };
function drawInset() {
  const key = build >= 0 ? STEPS[build] : null, f = D && D.frames[idx]; let html = '';
  if (f && key && RENDER[key]) {
    if (key === 'reach' && insetStatic === 'reach' && insetEl.classList.contains('show')) return;
    U.pick = PICK; U.swapped = swapped;
    const bx = RAW && RAW.weights.head_bias_x ? RAW.weights.head_bias_x.values : null;
    html = K.R[RENDER[key]]({ D, idx, U, S, bx, b: /^blk\d$/.test(key) ? +key[3] : 0, now: performance.now(), reduce });
    if (guideInset) html = guideInset(f) || html;
  }
  insetStatic = key === 'reach' && html ? 'reach' : null;
  if (html) html = html.replace(/<svg width="([\d.]+)" height="([\d.]+)"(?![^>]*viewBox)/g, '<svg width="$1" height="$2" viewBox="0 0 $1 $2"')
    .replace(/font-size="(8|8\.5|9)"/g, 'font-size="9.5"');
  if (html) html = html.replace(/<rect data-grid="/g, '<rect tabindex="0" role="button" aria-label="heatmap: arrow keys move the selected cell" data-grid="').replace(/ data-hx="/g, ' tabindex="0" aria-label="chart: ← → pick a step" data-hx="');
  if (html) html = PW(html);
  insetEl.classList.toggle('show', !!html); if (html && html !== insetHTML) { insetHTML = html; morphHTML(insetEl, html); }
  if (glowSel && glowSel.startsWith('#inset')) { const el = document.querySelector(glowSel); if (el) { el.classList.add('gHL'); glowDom = el; } }
}
const refresh = () => { if (D) update(); else drawInset(); applyHL(); };
const PW = s => window.K8Phone ? window.K8Phone.words(s) : s;
const clamp01 = v => Math.max(0, Math.min(1, v));
const hxMove = e => {
  const t = e.target.closest && e.target.closest('[data-hx]'); let v = null;
  if (t) { const r = t.getBoundingClientRect(), n = +t.dataset.n, i = Math.round(clamp01((e.clientX - r.left) / r.width) * (n - 1)); v = t.dataset.rev === '1' ? n - 1 - i : i + (+t.dataset.off || 0); }
  if (v !== U.hov) { U.hov = v; drawInset(); applyHL(); poseHS0(); }
};
let TT = null;
insetEl.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') return hxMove(e);
  if (!TT || e.pointerId !== TT.id) return;
  if (!TT.slide) { const dx = e.clientX - TT.x, dy = e.clientY - TT.y; if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return; TT.slide = true; }
  hxMove(e);
});
insetEl.addEventListener('pointerleave', e => { if (e.pointerType !== 'mouse') return; if (U.hov !== null) { U.hov = null; drawInset(); applyHL(); poseHS0(); } });
insetEl.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  if (e.pointerType === 'mouse') return insetAct(e.target, e.clientX, e.clientY);
  const g = e.target.closest && e.target.closest('[data-grid]');
  TT = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.target, r: g && g.getBoundingClientRect(), slide: false };
});
addEventListener('pointerup', e => {
  const t = TT; if (!t || e.pointerId !== t.id) return; TT = null;
  if (t.slide || Math.hypot(e.clientX - t.x, e.clientY - t.y) >= 8) return;
  hxMove({ target: t.t, clientX: t.x }); insetAct(t.t, t.x, t.y, t.r);
});
insetEl.addEventListener('pointercancel', e => { if (TT && e.pointerId === TT.id) TT = null; });
function insetAct(target, x, y, rect) {
  const g = target.closest && target.closest('[data-grid]');
  if (g) { const r = rect || g.getBoundingClientRect(), rows = +g.dataset.rows, cols = +g.dataset.cols;
    return gridPick(g.dataset.grid, Math.min(rows - 1, Math.floor(clamp01((y - r.top) / r.height) * rows)), Math.min(cols - 1, Math.floor(clamp01((x - r.left) / r.width) * cols))); }
  const a = target.closest && target.closest('[data-act]'); if (!a) return;
  const [k, v] = a.dataset.act.split(':');
  if (k === 'frow') U.fpick = U.fpick === +v ? null : +v;
  else if (k === 'fexp') U.fexp = !U.fexp;
  else if (k === 'pstream' && U.ppick) U.ppick = { ...U.ppick, s: +v };
  else if (k === 'btab') { U.btab = v; const m = build >= 0 && /^blk(\d)$/.exec(STEPS[build]);
    if (v === 'ch' && m && !(PICK && PICK.b === +m[1])) return setPick(mostActive(+m[1])); }
  else if (k === 'htab') U.htab = v;
  refresh();
}
function mostActive(b) { const h = depthwise(b, idx); let best = { s: 0, c: 0, v: -1 };
  for (let s = 0; s < (ONE ? 1 : 2); s++) for (let c = 0; c < 32; c++) if (Math.abs(h[s][c]) > best.v) best = { s, c, v: Math.abs(h[s][c]) };
  return { b, s: best.s, c: best.c, t0: performance.now() }; }
function gridPick(name, row, col) {
  const m = build >= 0 && /^blk(\d)$/.exec(STEPS[build]), b = m ? +m[1] : -1, s = PICK && PICK.b === b ? PICK.s : 0;
  if (name === 'pch') U.ppick = { s: U.ppick ? U.ppick.s : 0, o: col };
  else if (name === 'hw') U.hpick = { p: Math.floor(row / 3), a: row % 3 };
  else if (name === 'dw' && b >= 0) return setPick({ b, s, c: col, tap: row, t0: performance.now() });
  else if (/^pw[AB]$/.test(name) && b >= 0) return setPick({ b, s, c: col, t0: performance.now() });
  refresh();
}

const HLG = new THREE.Group(); MODEL.add(HLG); const HLM = [];
function hlClear() { for (const o of HLG.children.slice()) { HLG.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); } HLM.length = 0; }
function hlBox(x0, x1, y0, y1, z0, z1, color = '#ffd166') {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), c = V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const fill = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false }));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: '#ffffff' }));
  fill.position.copy(c); edge.position.copy(c); HLG.add(fill, edge); HLM.push(fill);
}
function hlLabel(html, pos) { const el = document.createElement('div'); el.className = 'lbl hl'; el.innerHTML = html; const o = new CSS2DObject(el); o.position.copy(pos); HLG.add(o); }
const zSpan = (s, r0, r1) => [Math.min(zc(s, r0), zc(s, r1)) - ZP * .62, Math.max(zc(s, r0), zc(s, r1)) + ZP * .62];
function applyHL() {
  requestRender(); hlClear(); if (build < 0 || !D) return;
  const key = STEPS[build], hv = U.hov, PW = ['κ', 'κ²', 'κ³'];
  if (key === 'input' && hv > 0) { const x = -hv * TS; hlBox(x - TS * .9, x + TS * .9, LY.in - .1, LY.in + .1, zr(0, 4) - .07, zr(3, 4) + .07); hlLabel(`t−${hv} · ${hv * 10} ms ago`, V(x, LY.in + .32, zr(3, 4) + .1)); }
  if (key === 'feat' && U.fpick !== null) { const r = U.fpick, nm = K.FEAT[r];
    for (let s = 0; s < (ONE ? 1 : 2); s++) hlBox(-NP * TS - TS * .5, TS * .6, LY.feat - .08, LY.feat + .08, ...zSpan(s, r, r));
    hlLabel(`h⁰: ${nm}`, V(.8, LY.feat, zc(0, r))); if (!ONE) hlLabel(`h¹: ${SIGNS[r] < 0 ? `−${nm} (mirror flips it)` : `${nm} (same)`}`, V(.8, LY.feat, zc(1, r))); }
  if (key === 'proj' && U.ppick) { const { s, o } = U.ppick;
    hlBox(-NP * TS - TS * .5, TS * .6, LY.proj - .08, LY.proj + .08, ...zSpan(s, o, o));
    hlBox(-TS * .9, TS * .9, LY.feat - .09, LY.feat + .09, ...zSpan(s, 0, 6), '#8fe3ff');
    hlLabel(`channel ${o + 1} · h${s ? '¹' : '⁰'}`, V(.8, LY.proj, zc(s, o))); }
  const bm = /^blk(\d)$/.exec(key);
  if (bm && PICK && PICK.b === +bm[1] && !(ONE && PICK.s)) { const b = +bm[1], d = DIL[b], yi = yIn(b), [z0, z1] = zSpan(PICK.s, PICK.c, PICK.c);
    hlBox(CX - TS, CX + TS, LY.dw(b) - .08, LY.dw(b) + .08, z0, z1);
    for (let j = 0; j < 8; j++) { const x = -(7 - j) * d * TS; hlBox(x - TS * .9, x + TS * .9, yi - .1, yi + .1, z0, z1, j === PICK.tap ? '#ffffff' : '#ffd166'); }
    hlBox(-TS * .9, TS * .9, LY.out(b) - .08, LY.out(b) + .08, z0, z1);
    hlLabel(`channel ${PICK.c + 1} · h${PICK.s ? '¹' : '⁰'}${PICK.tap !== undefined && PICK.tap !== null ? ` · tap t−${(7 - PICK.tap) * d}` : ''}`, V(CX + .5, LY.dw(b), zc(PICK.s, PICK.c))); }
  if (key === 'head' && U.hpick) { const { p, a } = U.hpick;
    hlBox(coefX(p) - .075, coefX(p) + .075, LY.head - .09, LY.head + .09, coefZ(a) - .075, coefZ(a) + .075);
    hlLabel(`c ${'xyz'[a]}·${PW[p]}`, V(coefX(p), LY.head + .3, coefZ(a))); }
  if (key === 'traj' && hv >= 1 && hv <= H) { const x = hv * TS; hlBox(x - TS * .62, x + TS * .62, LY.prior - .08, LY.r + .08, -.17, .17); hlLabel(`step ${hv} · ${hv * 10} ms`, V(x, LY.r + .32, .2)); }
  if (key === 'out' && hv >= 1 && hv <= H) { const x = hv * TS; hlBox(x - TS * .62, x + TS * .62, FY - .1, FY + .52, -.22, .22); hlLabel(`step ${hv} · ${hv * 10} ms`, V(x, FY + .75, .2)); }
}
function bodyRef() { if (!D || !window.K8HeadPose) return 0; if (D._ref === undefined) D._ref = window.K8HeadPose.meanHeading(D.frames.map(fr => 2 * Math.atan2(-fr.q[2], fr.q[0]))); return D._ref; }
function poseHS0() {
  if (!D) return; const lag = build >= 0 && STEPS[build] === 'input' && U.hov > 0 && D.frames[idx - U.hov] ? U.hov : 0, g = D.frames[idx - lag];
  hs0.quaternion.set(-g.q[1], -g.q[2], g.q[3], g.q[0]).normalize(); if (HEAD0) HEAD0.pose(hs0.quaternion, bodyRef());
  if (HSL) HSL.element.textContent = lag ? `the headset ${lag * 10} ms ago` : 'the headset at “now”';
}

const FOCUS_DIM = .2, FOCUS_GROUPS = { mirror: ['feat', 'proj', 'links'], reach: ['tree'] };
const focusKeep = key => ({ feat: [SL.input], proj: [SL.feat], blk0: [SL.proj], blk1: [BL[0].out], blk2: [BL[1].out], head: [BL[2].out], traj: [SL.coef, SL.feat], out: [SL.r, SL.input] }[key] || []);
function applyFocus() {
  requestRender();
  const key = build >= 0 ? STEPS[build] : null, on = document.getElementById('tFocus').checked && !!key && key !== 'gaze';
  const cur = new Set((FOCUS_GROUPS[key] || [key]).map(k => GROUPS[k])), keep = new Set(on ? focusKeep(key) : []);
  for (const [k, g] of Object.entries(GROUPS)) { if (k === 'gaze') continue; const dim = on && !cur.has(g);
    g.traverse(o => { const m = o.material; if (!m || !m.color) return; if (!m.userData.base) m.userData.base = m.color.clone();
      m.color.copy(m.userData.base).multiplyScalar(dim && !keep.has(o) ? (key === 'reach' ? (o.isLineSegments ? 0 : .1) : FOCUS_DIM) : 1); }); }
  for (const l of lines) if (!l.userData.static) l.material.opacity = l.userData.op * (key ? 1 : .45);
  for (const L of allLabels) { const p = L.o.parent, own = cur.has(L.grp) || (p && cur.has(p.parent));
    L.other = on && L.grp !== CL && L.grp !== GROUPS.links && !own; }
  labelFog();
}
function setStreamOnly(on) {
  ONE = on; const z = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const mesh of [SL.feat, SL.proj, ...BL.flatMap(B => [B.out, B.dw, B.upd])]) {
    const half = mesh.count / 2, arr = mesh.instanceMatrix.array;
    if (!mesh.userData.orig) mesh.userData.orig = arr.slice();
    if (on) for (let k = half; k < mesh.count; k++) mesh.setMatrixAt(k, z); else arr.set(mesh.userData.orig);
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  }
  FLIPB.forEach(e => { e.visible = !on; });
  applyClip();
  refresh();
}
const SPLIT = ['feat', 'proj', 'blk0', 'blk1', 'blk2'];
const PLANE_H1 = new THREE.Plane(V(0, 1, 0), .012), PLANE_LIVE = new THREE.Plane(V(0, 0, 1), 0);
let CLIP_LIVE = null;
function applyClip() {
  for (const [k, g] of Object.entries(GROUPS)) {
    const pl = []; if (ONE && SPLIT.includes(k)) pl.push(PLANE_H1); if (CLIP_LIVE && CLIP_LIVE.groups.has(k)) pl.push(PLANE_LIVE);
    const key = pl.map(q => q === PLANE_H1 ? 'h' : 'l').join('');
    g.traverse(o => { if (o.userData.glow || o.userData.noClip) return; for (const m of [].concat(o.material || [])) if ((m.userData.clipKey || '') !== key) { m.userData.clipKey = key; m.clippingPlanes = pl.length ? pl : null; m.needsUpdate = true; } });
  }
  requestRender();
}
const labelClipped = L => {
  if (!ONE && !CLIP_LIVE) return false;
  const k = L.gk !== undefined ? L.gk : (L.gk = Object.keys(GROUPS).find(n => GROUPS[n] === L.grp) || ''), w = L.w || (L.w = L.o.getWorldPosition(V(0, 0, 0)));
  return (ONE && SPLIT.includes(k) && w.y < -.012) || (!!CLIP_LIVE && CLIP_LIVE.groups.has(k) && w.z < -CLIP_LIVE.z);
};
document.getElementById('tFocus').onchange = () => applyFocus();
document.getElementById('tOne').onchange = e => { if (e.target.checked && swapped) setSwap(false); setStreamOnly(e.target.checked); };
document.getElementById('lineB').oninput = e => { LB = +e.target.value; refresh(); };

const CALL_PH = [350, 1100, 1700, 2400, 3200];
const PH_TXT = ['① new sample in', '② sum over 8 taps', '③ mix channels', '④ add the skip', '⑤ oldest leaves memory'];
function blkCaption() {
  const m = build >= 0 && /^blk(\d)$/.exec(STEPS[build]); captionEl.classList.toggle('show', !!m); if (!m) return;
  const ph = CALL ? CALL.ph : -1;
  captionEl.innerHTML = `Press <b style="color:var(--fg)">One call ▶</b> (C) to follow one new sample through the block · click the 8-tap node to follow one channel<br>${PH_TXT.map((t, i) => `<span class="ph${i === ph ? ' on' : ''}">${t}</span>`).join(' ')}`;
}
function setLineOps(B, dw, mix, up) { B.dwLines.material.opacity = dw; B.selfLines.material.opacity = mix; B.crossLines.material.opacity = mix * .9; B.upLines.material.opacity = up; }
function endCall() { if (!CALL) return; const B = BL[CALL.b]; setLineOps(B, B.dwLines.userData.op, B.selfLines.userData.op, B.upLines.userData.op); B.flash.visible = B.leave.visible = false; CALL = null; clearPulses(); blkCaption(); }
function oneCall() {
  const m = build >= 0 && /^blk(\d)$/.exec(STEPS[build]); if (!m || !D || idx >= D.frames.length - 1) return;
  endCall(); if (!EMB()) setPlay(false); if (!playing) setIdx(idx + 1);
  const b = +m[1], B = BL[b], g = GROUPS['blk' + b], t0 = performance.now(), z16 = s => zc(s, 16);
  CALL = { b, t0, ph: reduce ? 4 : 0 };
  B.guide.forEach(([a, e]) => pulse([a, e], t0 + CALL_PH[0], CALL_PH[1] - CALL_PH[0], B.tapc, g));
  for (let s = 0; s < 2; s++) {
    pulse([V(CX, LY.dw(b), z16(s)), V(CX, LY.upd(b), z16(s))], t0 + CALL_PH[1], CALL_PH[2] - CALL_PH[1], '#ffb454', g);
    pulse([V(CX, LY.dw(b), z16(s)), V(CX, LY.upd(b), z16(1 - s))], t0 + CALL_PH[1], CALL_PH[2] - CALL_PH[1], '#6fa8ff', g);
    pulse(B.skipPts[s], t0 + CALL_PH[2], CALL_PH[3] - CALL_PH[2], '#e6ebf2', g);
    pulse([V(CX, LY.upd(b), z16(s)), V(0, LY.out(b) - .06, z16(s))], t0 + CALL_PH[2], CALL_PH[3] - CALL_PH[2], '#ffb454', g);
  }
  if (reduce) { B.leave.visible = true; B.leave.material.opacity = .45; }
  blkCaption();
}
function stepCall(now) {
  if (!CALL) return; const B = BL[CALL.b], el = now - CALL.t0;
  if (el > CALL_PH[4] + (reduce ? 2500 : 900)) { endCall(); if (EMB()) embCallAgain(now); return; }
  if (reduce) return;
  const ph = Math.min(4, CALL_PH.findIndex(e => el < e) < 0 ? 4 : CALL_PH.findIndex(e => el < e));
  if (ph !== CALL.ph) { CALL.ph = ph; blkCaption(); }
  B.flash.visible = ph === 0; B.flash.material.opacity = .7 * Math.sin(Math.PI * Math.min(1, el / CALL_PH[0]));
  B.leave.visible = ph === 4; B.leave.material.opacity = .8 * (1 - (el - CALL_PH[3]) / (CALL_PH[4] - CALL_PH[3]));
  setLineOps(B, ph === 1 ? 1 : .12, ph === 2 ? 1 : .12, ph === 3 ? .9 : .1);
}
let SWAP = null, swapped = false;
const applySwap = z => ['feat', 'proj'].forEach(k => { GROUPS[k].scale.z = z; });
function setSwap(on) {
  swapped = on; const from = GROUPS.feat.scale.z, to = on ? -1 : 1;
  if (reduce) applySwap(to); else SWAP = { from, to, t0: performance.now() };
  const bt = document.getElementById('swapBtn'); if (bt) bt.textContent = on ? 'Back to the original ⇄' : 'Mirror the motion ⇄';
  const ex = document.getElementById('swapTxt'); if (ex) ex.style.display = on ? 'block' : 'none';
  drawInset();
}
function stepSwap(now) { if (!SWAP) return; const u = Math.min(1, (now - SWAP.t0) / 1000), e = u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2; applySwap(SWAP.from + (SWAP.to - SWAP.from) * e); if (u === 1) SWAP = null; }
let GROW = null;
const cTree = new THREE.Color('#9b8cff');
function paintTree(u) {
  const lv = L => u === null ? .35 : Math.max(0, Math.min(1, u - L)) * .95; let n = 0;
  for (let j = 0; j < 8; j++) { treeLines.paint(n++, cTree, lv(0)); for (let i = 0; i < 8; i++) { treeLines.paint(n++, cTree, lv(1)); for (let k = 0; k < 8; k++) treeLines.paint(n++, cTree, lv(2)); } }
  treeLines.done();
}
function stepGrow(now) { if (!GROW) return; const u = (now - GROW.t0) / 700; paintTree(Math.min(3, u)); if (u >= 3) GROW = null; }
let gazeFollow = false;
function stepGaze(dt) {
  if (!gazeFollow || camTween || !D || build < 0 || STEPS[build] !== 'gaze') return;
  const f = D.frames[idx], nd = toScene(fwd(f.q)).normalize(), gp = G.position;
  const sd = V(nd.z, 0, -nd.x).normalize();
  const gk = window.K8Phone ? Math.min(2.2, window.K8Phone.distK()) : 1;
  const tgt = gp.clone().addScaledVector(nd, 1.5), pos = gp.clone().addScaledVector(nd, -1.6 * gk).addScaledVector(sd, .25 * gk).add(V(0, .7 * gk, 0)), k = reduce ? 1 : 1 - Math.exp(-dt * 4);
  const d0 = camera.position.distanceToSquared(pos) + controls.target.distanceToSquared(tgt);
  camera.position.lerp(pos, k); controls.target.lerp(tgt, k); if (d0 > 1e-8) requestRender();
}
function setPick(p) {
  PICK = p; BL.forEach((B, b) => { const on = p && p.b === b; B.pickBoxes.forEach(e => { e.visible = !!on; if (on) e.position.z = zc(p.s, p.c); }); B.pickNode.visible = !!on; if (on) B.pickNode.position.z = zc(p.s, p.c); });
  if (D) update(); else drawInset(); applyHL();
}
const TA = (obj, x, y, z, vis = obj) => ({ obj, vis, local: V(x, y, z) });
const CTX_N = [8, 64, 393], CTX_M = [1, 8, 64];
const ctxRowZ = (B, j) => -(B.zMax + .6 + j * .42);
const ctxLags = k => { const hits = new Map(); for (let a = 0; a < 8; a++) for (let q = 0; q < (k >= 1 ? 8 : 1); q++) for (let r = 0; r < (k >= 2 ? 8 : 1); r++) { const lag = a + 8 * q + 47 * r; hits.set(lag, (hits.get(lag) || 0) + 1); } return hits; };
for (let b = 0; b < 3; b++) { const B = BL[b];
  const ctx = new THREE.Group(); ctx.visible = false; GROUPS['blk' + b].add(ctx); let own = null;
  for (let j = 0; j <= b; j++) { const zS = ctxRowZ(B, j), hits = ctxLags(j), lags = [...hits.keys()].sort((x, y) => x - y); console.assert(lags.length === CTX_N[j], 'context lag count');
    const bg = new THREE.Mesh(new THREE.BoxGeometry(393 * TS, .03, .2), new THREE.MeshBasicMaterial({ color: '#3a3a3a', transparent: true, opacity: .9 }));    bg.position.set(-392 * TS / 2, B.yi, zS); bg.userData.noClip = true; ctx.add(bg);
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(TS * .9, .06, .26), new THREE.MeshBasicMaterial(), lags.length), m4 = new THREE.Matrix4(), cOne = new THREE.Color(j === b ? '#9b8cff' : '#6f63b8'), cTwo = new THREE.Color('#ffd166');
    lags.forEach((lag, i) => { m4.makeTranslation(-lag * TS, B.yi, zS); inst.setMatrixAt(i, m4); inst.setColorAt(i, hits.get(lag) > 1 ? cTwo : cOne); });
    inst.userData.noClip = true; inst.userData.noFrame = true; ctx.add(inst); if (j === b) own = inst;
    label(`Block ${j + 1}: ${CTX_N[j]} samples (${(CTX_N[j] / 100).toFixed(2)} s)`, V(.45, B.yi, zS), 'lbl layer', null, ctx); }
  const zB = ctxRowZ(B, b) - .32;
  for (const [n, t] of [[0, 'now'], ...(b ? [[CTX_N[b], `−${(CTX_N[b] / 100).toFixed(2)} s`]] : [])]) label(t, n ? V(-n * TS - .3, B.yi, ctxRowZ(B, b)) : V(0, B.yi, -(B.zMax + .28)), 'lbl layer', null, ctx);
  label(b === 0 ? 'reads the projection' : `reads Block ${b}: ${CTX_M[b]} samples each${b === 2 ? ' · amber = reached twice' : ''}`, V(-196 * TS, B.yi, zB - .6), 'lbl layer v', null, ctx);
  Object.assign(B, { ctx, ctxInst: own }); }
const ctxA = b => TA(BL[b].ctxInst, 0, BL[b].yi, ctxRowZ(BL[b], b), BL[b].ctx);
const memA = b => TA(BL[b].mem, 0, 0, BL[b].zMax);
const tapA = b => TA(BL[b].tapM[0], 0, 0, BL[b].zMax);
const mixA = b => GMIX && GMIX.b === b ? TA(BL[b].selfLines, CX, LY.upd(b), zc(0, GMIX.o))
  : TA(BL[b].selfLines, CX, (LY.dw(b) + LY.upd(b)) / 2, zc(0, 24));
const skipA = b => { const p = BL[b].skipPts[0][12]; return TA(BL[b].skipT[0], p.x, p.y, p.z); };
const TOUR_ANCHORS = {
  'blk0.ctx': () => ctxA(0), 'blk1.ctx': () => ctxA(1), 'blk2.ctx': () => ctxA(2),
  'input.now': () => TA(SL.input, 0, LY.in, zr(1, 4)),
  'input.rows': () => TA(SL.input, -2.5, LY.in, 0),
  'input.headset': () => TA(hs0, 0, .2, 0, HS0),
  'feat.rows': () => TA(SL.feat, -1.2, LY.feat, zc(0, 3)),
  'feat.fork': () => { const p = new THREE.CatmullRomCurve3(forkPts).getPoint(.35); return TA(forkT, p.x, p.y, p.z); },
  'feat.flip': () => TA(FLIPB[0], -.8 - FLIPB[0].position.x, 0, 0),
  'proj.fan': () => TA(projLines, 0, (LY.feat + LY.proj) / 2, zc(0, 8)),
  'proj.cells': () => TA(SL.proj, 0, LY.proj, zc(0, 16)),
  'mirror.top': () => TA(MODEL, -1.2, LY.proj, zc(0, 20), SL.proj),
  'mirror.bottom': () => ONE ? null : TA(MODEL, -1.2, LY.proj, zc(1, 20), SL.proj),
  'blk0.mem': () => memA(0), 'blk0.taps': () => tapA(0), 'blk0.mix': () => ONE ? null : mixA(0), 'blk0.skip': () => skipA(0),
  'blk1.mem': () => memA(1), 'blk1.taps': () => tapA(1), 'blk1.mix': () => ONE ? null : mixA(1), 'blk1.skip': () => skipA(1),
  'blk2.mem': () => memA(2), 'blk2.taps': () => tapA(2), 'blk2.mix': () => ONE ? null : mixA(2), 'blk2.skip': () => skipA(2),
  'reach.tree': () => TA(treeLines, 0, LY.out(2), 0),
  'head.grid': () => TA(SL.coef, coefX(1), LY.head, coefZ(1)),
  'traj.prior': () => TA(SL.prior, 10 * TS, LY.prior, 0),
  'traj.corr': () => TA(SL.corr, 10 * TS, LY.corr, 0),
  'traj.r': () => TA(SL.r, 10 * TS, LY.r, 0),
  'out.pred': () => TA(SL.pred, 8 * TS, FY, 0),
  'out.truth': () => TA(SL.truth, 8 * TS, FY + .25, 0),
  'out.err': () => TA(SL.err, 8 * TS, FY + .45, 0),
  'out.scored': () => TA(scoredBox, 0, 0, 0),
  'gaze.headset': () => TA(headM, 0, .2, 0),
  'gaze.dots': () => TA(predDots[H - 1], 0, 0, 0),
  'wear.dots': () => TA(predDots[H - 1], 0, 0, 0),
};
const GLOW = {
  'input.now': () => ({ boxes: [[-TS * 1.6, TS * .6, LY.in - .1, LY.in + .1, zr(0, 4) - .07, zr(3, 4) + .07]], host: [SL.input] }),
  'input.rows': () => ({ objs: [SL.input] }),
  'input.headset': () => ({ objs: [HEAD0 ? hsBody0 : hs0] }),
  'feat.rows': () => ({ boxes: [[-NP * TS - TS / 2, TS * .6, LY.feat - .08, LY.feat + .08, ...zSpan(0, 0, 6)]], host: [SL.feat] }),
  'feat.fork': () => ({ objs: [forkT] }),
  'feat.flip': () => ({ objs: FLIPB.slice() }),
  'proj.fan': () => ({ objs: [projLines] }),
  'proj.cells': () => ({ boxes: [[-TS * .7, TS * .7, LY.proj - .08, LY.proj + .08, ...zSpan(0, 0, 31)]], host: [SL.proj] }),
  'mirror.top': () => ({ boxes: [[-NP * TS - TS / 2, TS * .6, LY.proj - .09, LY.proj + .09, ...zSpan(0, 0, 31)]], host: [SL.proj, SL.feat] }),
  'mirror.bottom': () => ONE ? null : ({ boxes: [[-NP * TS - TS / 2, TS * .6, LY.proj - .09, LY.proj + .09, ...zSpan(1, 0, 31)]], host: [SL.proj, SL.feat] }),
  'reach.tree': () => ({ boxes: [[-TS * 2, TS * 2, LY.out(2) - .1, LY.out(2) + .1, -.1, .1]], host: [treeLines] }),
  'head.grid': () => ({ objs: [SL.coef] }),
  'traj.prior': () => ({ objs: [SL.prior] }), 'traj.corr': () => ({ objs: [SL.corr] }), 'traj.r': () => ({ objs: [SL.r] }),
  'out.pred': () => ({ objs: [SL.pred] }), 'out.truth': () => ({ objs: [SL.truth] }), 'out.err': () => ({ objs: [SL.err] }), 'out.scored': () => ({ objs: [scoredBox] }),
  'gaze.headset': () => ({ objs: [HEAD ? bustM : headM] }), 'gaze.dots': () => ({ objs: [predDots[H - 1], truthDots[H - 1]] }), 'wear.dots': () => ({ objs: [predDots[H - 1], truthDots[H - 1]] }),
};
[0, 1, 2].forEach(b => Object.assign(GLOW, {
  [`blk${b}.mem`]: () => { const B = BL[b], sp = 7 * B.d * TS; return { boxes: [[-sp - TS / 2, -TS / 2, B.yi - .1, B.yi + .1, B.zMax - .35, B.zMax + .02]], host: [B.mem] }; },
  [`blk${b}.taps`]: () => { const B = BL[b]; return { boxes: B.tapM.map((_, j) => { const x = -(7 - j) * B.d * TS; return [x - TS * .3, x + TS * .3, B.yi + .09, B.yi + .15, B.zMax - .35, B.zMax + .06]; }), host: B.tapM.slice(), pad: .002 }; },
  [`blk${b}.mix`]: () => { const zM = BL[b].zMax, o = GMIX && GMIX.b === b ? GMIX.o : null;
    return { boxes: [o !== null ? [CX - TS * 1.4, CX + TS * 1.4, LY.upd(b) - .07, LY.upd(b) + .07, ...zSpan(0, o, o)] : [CX - TS * 1.5, CX + TS * 1.5, LY.dw(b) - .06, LY.upd(b) + .06, -zM, zM]], host: [BL[b].dw, BL[b].upd] }; },
  [`blk${b}.skip`]: () => ({ objs: [BL[b].skipT[0]] }),
  [`blk${b}.ctx`]: () => ({ objs: [BL[b].ctxInst], pad: .03 }),
}));
const GLD = new THREE.Group(); MODEL.add(GLD); const GLM = []; let glowParts = [], glowDim = false;
function glowMesh(box, pad0) {
  const sz = box.getSize(V(0, 0, 0)), pad = pad0 != null ? pad0 : Math.max(.012, .04 * Math.max(sz.x, sz.y, sz.z)); box.expandByScalar(pad); box.getSize(sz);
  const g = new THREE.BoxGeometry(Math.max(sz.x, .01), Math.max(sz.y, .01), Math.max(sz.z, .01)), c = box.getCenter(V(0, 0, 0));
  const fill = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false }));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: '#ffffff' }));
  for (const o of [fill, edge]) { o.position.copy(c); o.userData.glow = o.userData.noFrame = true; o.raycast = () => {}; }
  const big = Math.max(sz.x, sz.y, sz.z); fill.userData.k = big > 1.5 ? .2 : big > .5 ? .5 : 1; GLM.push(fill); return [fill, edge];
}
function glowClear() {
  glowSel = null; if (!glowParts.length && !glowDim && !glowDom) return;
  for (const o of glowParts) { if (o.parent) o.parent.remove(o); o.geometry.dispose(); o.material.dispose(); } glowParts = []; GLM.length = 0;
  if (glowDim) { glowDim = false; applyFocus(); }
  if (glowDom) { glowDom.classList.remove('gHL'); glowDom = null; }
  requestRender();
}
const _rq = new THREE.Quaternion();
function ringGlow(o) {
  if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const r = o.geometry.boundingSphere.radius, parts = [];
  for (const [r0, r1, c] of [[r * 1.9, r * 2.3, '#ffd166'], [r * 2.3, r * 2.45, '#ffffff']]) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 40), new THREE.MeshBasicMaterial({ color: c, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    m.userData.glow = m.userData.noFrame = true; m.raycast = () => {}; m.renderOrder = 10;
    m.onBeforeRender = (rr, sc, cam) => { o.getWorldQuaternion(_rq).invert(); m.quaternion.copy(_rq).multiply(cam.quaternion); m.updateMatrixWorld(); };
    o.add(m); parts.push(m);
  }
  return parts;
}
function glowTip(t) {
  glowClear(); if (!t) return;
  if (t.dom) { glowSel = t.dom.replace(/:not\([^)]*\)/g, ''); const el = document.querySelector(glowSel); if (el) { el.classList.add('gHL'); glowDom = el; } return; }
  const spec = GLOW[t.at] && GLOW[t.at](); if (!spec) return;
  scene.updateMatrixWorld(true);
  for (const o of spec.objs || []) {
    if (WEAR.on && o.geometry) { glowParts.push(...ringGlow(o)); continue; }
    let b;
    if (o.isInstancedMesh) { o.computeBoundingBox(); b = o.boundingBox.clone(); }
    else if (o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b = o.geometry.boundingBox.clone(); }
    if (b) { const parts = glowMesh(b, spec.pad); o.add(...parts); glowParts.push(...parts); }
    else { const wb = new THREE.Box3().setFromObject(o), parts = glowMesh(wb); scene.add(...parts); glowParts.push(...parts); }
  }
  for (const bx of spec.boxes || []) { const parts = glowMesh(new THREE.Box3(V(bx[0], bx[2], bx[4]), V(bx[1], bx[3], bx[5])), spec.pad); GLD.add(...parts); glowParts.push(...parts); }
  const tg = new Set([...(spec.objs || []), ...(spec.host || [])]), grp = Object.values(GROUPS).find(g => [...tg].some(o => { for (let p = o; p; p = p.parent) if (p === g) return true; return false; }));
  if (grp) grp.traverse(o => { if (o.userData.glow || tg.has(o) || !(o.isMesh || o.isInstancedMesh) || o.isLineSegments) return; let p = o; for (; p; p = p.parent) if (tg.has(p)) return;
    const m = o.material; if (m && m.color) { if (!m.userData.base) m.userData.base = m.color.clone(); m.color.multiplyScalar(.35); glowDim = true; } });
  requestRender();
}
const shownIn3D = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
const _tp = new THREE.Vector3(), _tc = new THREE.Vector3();
const TOUR = window.K8TOUR.create({
  reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, highlight: t => glowTip(t),
  beginner: () => LEVEL === 'beginner', step: () => WEAR.on ? 'wear' : build >= 0 ? STEPS[build] : null,
  moving: name => WEAR.on || /^(gaze\.|wear\.|input\.headset)/.test(name),
  point(name) {
    const f = TOUR_ANCHORS[name], a = f && f(); if (!a || !a.obj) return null;
    a.obj.localToWorld(_tp.copy(a.local)); _tc.copy(_tp).applyMatrix4(camera.matrixWorldInverse); _tp.project(camera);
    const v = viewport();
    return { x: v.left + (_tp.x + 1) / 2 * v.width, y: v.top + (1 - _tp.y) / 2 * v.height, behind: _tc.z > 0, vis: shownIn3D(a.vis) };
  },
});
async function tourCheck() {
  const was = build, frames = n => new Promise(r => { const k = () => --n ? requestAnimationFrame(k) : r(); requestAnimationFrame(k); }), out = [];
  for (let i = 0; i < STEPS.length; i++) { showBuild(i); TOUR.close(); await frames(3);
    for (const [n, t] of (window.K8TOUR.TIPS[STEPS[i]] || []).entries()) {
      let ok, why = '';
      if (t.dom) { const el = document.querySelector(t.dom), r = el && el.getBoundingClientRect(); ok = !!(r && (r.width || r.height)); if (!ok) why = el ? 'zero size' : 'no element'; }
      else { const a = TOUR_ANCHORS[t.at] && TOUR_ANCHORS[t.at](); ok = !!(a && a.obj && shownIn3D(a.vis)); if (!ok) why = a && a.obj ? 'hidden' : 'no object'; }
      out.push({ step: STEPS[i], tip: n + 1, anchor: t.dom || t.at, ok, why }); } }
  was >= 0 ? showBuild(was) : home(); console.table(out); return out.filter(r => !r.ok);
}
function resetProposal() { Object.assign(U, { hov: null, fpick: null, ppick: null, hpick: null, fexp: false }); endCall(); clearPulses(); setPick(null); SWAP = null; swapped = false; applySwap(1); GROW = null; paintTree(null); gazeFollow = false; }

const P = window.PLAIN || {};
const TECH = {
  input: [['shape', '[1,400,4], w x y z, 100 Hz'], ['per call', 'only the newest two poses are read; history lives in the block memories']],
  feat: [['out', '[1,1,7]: ωx ωy ωz, |ω|₁, gx gy gz; then copied into 2 streams → [1,7,2,1]'], ['mirror', 'h¹ = h⁰ with ωy, ωz, gx negated'], ['params', '0']],
  mirror: [['idea', 'model(mirror(x)) = mirror(model(x)) by construction'], ['effect', 'every weight is shared by both streams: 15,113 → 7,555 params'], ['source', '15,113: jacob/ablations/README.md:406 (counted, untrained no_mirror build); trained evidence: v6 Exp 2, +0.029° without mirroring']],
  proj: [['op', '1×1 conv, then ReLU'], ['weights', 'W [32×7] + 32 bias = 256, shared'], ['shape', '[1,7,2,1] → [1,32,2,1]']],
  head: [['weights', 'W_head [9×32] = 288 + 3 x-biases, shared'], ['readout', 'c = W h⁰ + S W h¹ + b_x (S negates y, z)'], ['out', '[1,3,3]: c1..c3 for x, y, z']],
  traj: [['prior', 'Δ·τ(1−e^(−k/τ)), k in samples, τ = 10 samples (100 ms), 0 params'], ['learned residual', 'c1·κ + c2·κ² + c3·κ³ (c includes b_x), κ = k/20'], ['out', 'r [1,20,3]']],
  out: [['map', 'Cayley (2, r), then q[t] ⊗, then unit norm'], ['out', '[1,20,4]; scored at step 20 (200 ms)'], ['rows', 'predicted, true, then angular error per step (0 to the trace’s 98th percentile)']],
  gaze: [['dots', 'head forward axis for predicted, true and past poses'], ['arcs', 'one per step k: now → q[t] ⊗ (2, r_k), normalised; independent of step k−1']],
  reach: [['formula', '1 + 7·(1 + 8 + 47) = 393 feature steps'], ['raw poses', '394: each feature step uses a pair of poses'], ['paths', '8 × 8 × 8 = 512 root-to-leaf, lag = a + 8b + 47c']],
};
[0, 1, 2].forEach(b => { const d = DIL[b]; TECH['blk' + b] = [['memory', `state_in_${b} [1,32,2,${7 * d}]`], ['depthwise', `k=8, dilation ${d}, 256 params shared`], ['pointwise', '[A|B] 2,048 + 32 bias: A to itself, B to the twin'], ['update', 'x ← ReLU(x + ReLU(mix))'], ['own span', `${7 * d + 1} samples`], ['sees (with the layers before it)', `${[8, 64, 393][b]} feature steps${b === 2 ? ' = 394 raw poses (each step uses a pair of poses)' : ''}`]]; });
const FALLBACK = { overview: { title: 'k8_combined', oneLine: 'Predicts where a head will point 200 ms from now.',
  simple: 'Left to right: through the network. Up and down: the 32 channels, with the observed stream h⁰ above the mirror plane and the mirrored stream h¹ reflected below. Into the screen: the past; the future comes toward you.', numbers: ['7,555 parameters', '44,196 bytes'] } };
const card = document.getElementById('card');
function cardOffset(on) { requestRender();
  if (EMB()) { const l = EMB().lens; return l ? camera.setViewOffset(l.w, l.h, l.w / 2 - l.cx, 0, l.w, l.h) : camera.clearViewOffset(); }
  const { width: VW, height: VH } = viewport();
  const po = window.K8Phone && window.K8Phone.offset(); if (po) return camera.setViewOffset(VW, VH, po.x, po.y, VW, VH);
  if (window.K8Phone && window.K8Phone.form()) return camera.clearViewOffset();
  on = on &&!card.classList.contains('min') && !card.classList.contains('cmp'); if (on) camera.setViewOffset(VW, VH, -200, 0, VW, VH); else camera.clearViewOffset(); }
let LEVEL = 'standard';
try { const saved = localStorage.getItem('k8level'); if (['beginner', 'standard', 'expert'].includes(saved)) LEVEL = saved; } catch {  }
function showCard(key) {
  card.classList.remove('cmp', 'cmpd'); cardOffset(true);
  document.getElementById('gazeKey').classList.toggle('show', key === 'gaze');
  const p = P[key] || FALLBACK[key] || { title: key }, t = TECH[key];
  const legend = key === 'overview' ? `<details><summary>How to read the colours</summary><table>
    <tr><td>cells</td><td>orange +, blue −; dark ≈ 0, saturated, then pale = at the clip; colour = √(value / 98th percentile over this trace), clipped. Exceptions: quaternions (input, forecast) and gravity use a fixed ±1 (they are unit length); the error row is red, linear, 0 to its 98th percentile; inset weight heatmaps use ±max |w| (shown in each inset)</td></tr>
    <tr><td>glow</td><td>amber pulsing box with a white outline = what you picked or are hovering in the inset</td></tr>
    <tr><td>focus mode</td><td>on a build step, parts that are not the step (or what it reads) are drawn at 20% (menu ⋯)</td></tr>
    <tr><td>bright vs dim</td><td>bright = values the model holds or reads this call (its caches); dim = past values kept only by this viewer</td></tr>
    <tr><td>lines</td><td>|weight × input|, orange/blue by sign; light adds where lines meet, the node colour is the net value (biases included)</td></tr>
    <tr><td>latency</td><td>77.5 µs median, 1 ORT thread, AMD Ryzen 7 5800X3D (Nic's PC), 11 Nov session; relative only</td></tr></table></details>` : '';
  const startG = key === 'overview' && !GUIDE.on() ? `<p style="margin-top:8px"><button id="guideCard" aria-keyshortcuts="G">Start guided tour (G)</button> <button id="cmpCard">Compression view</button></p><p class="why" style="font-size:12.5px;margin-top:4px">The tour: ${GUIDE.SHOTS.length - 1} short tips from input to forecast; the camera moves for you</p>` : '';
  const nums = Array.isArray(p.numbers) ? p.numbers : [];
  const lvlBar = `<div class="lvl" role="group" aria-label="Explanation level">${['beginner', 'standard', 'expert'].map(l => `<button data-l="${l}" aria-pressed="${LEVEL === l}">${l[0].toUpperCase() + l.slice(1)}</button>`).join('')}</div>`;
  const chips = nums.length ? `<div class="chips">${nums.map(n => `<span class="chip">${n}</span>`).join('')}</div>` : '';
  const techT = t ? `<table>${t.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>` : '';
  const b = (window.BEGINNER || {})[key], e = (window.EXPERT || {})[key];
  const tipsBtn = build >= 0 && key === STEPS[build] && window.K8TOUR.TIPS[key] && !GUIDE.on() ? `<p style="margin-top:8px"><button id="tourAgain" aria-keyshortcuts="T">Show tips again (T)</button></p>` : '';
  const moreBox = h => h ? `<details class="more"${MORE ? ' open' : ''}><summary>Read more</summary>${h}</details>` : '', ovExtra = [];
  const more = h => key === 'overview' ? (h && ovExtra.push(h), '') : moreBox(h);
  let body, title;
  if (LEVEL === 'beginner' && b) { title = b.title; body = `<h2>${b.title}</h2><div class="one">${b.idea}</div><p>${b.analogy}</p>`
    + more(`<div class="lab">Look</div><p>${b.look}</p><div class="lab">Try</div><p>${b.try}</p>`) + `${chips}${tipsBtn}`; }
  else if (LEVEL === 'expert' && e) { title = e.title; const mathBox = h => key === 'overview' ? more(h) : h ? `<details class="more"${MORE ? ' open' : ''}><summary>Maths and ONNX</summary>${h}</details>` : '';
    body = `<h2>${e.title}</h2>` + (e.prose ? `<p class="prose">${e.prose}</p>` : `<div class="one">${e.summary}</div>`)
    + mathBox((e.prose ? `<div class="one">${e.summary}</div>` : '') + (e.math && e.math.length ? `<pre>${e.math.join('\n')}</pre>` : '')
      + (e.shapes && e.shapes.length ? `<div class="lab">shapes</div><pre>${e.shapes.join('\n')}</pre>` : '')
      + (e.params ? `<div class="lab">parameters</div><p>${e.params}</p>` : '')
      + (e.caveat ? `<p class="why">${e.caveat}</p>` : '')
      + (e.onnx && e.onnx.length ? `<div class="lab">ONNX nodes</div><div class="chips">${e.onnx.map(n => `<span class="chip">${n}</span>`).join('')}</div>` : '')
      + (techT ? `<details><summary>Technical table</summary>${techT}</details>` : '')
      + (e.refs && e.refs.length ? `<div class="src">${e.refs.join(' · ')}</div>` : '')); }
  else { title = p.title || ''; body = `<h2>${p.title || ''}</h2><div class="one">${p.oneLine || ''}</div><p>${p.simple || ''}</p>${chips}`
    + (key === 'overview' ? '' : more((p.why ? `<p class="why">${p.why}</p>` : '') + (techT ? `<details><summary>Technical details</summary>${techT}</details>` : ''))); }
  const ovMore = key === 'overview' ? moreBox(ovExtra.join('') + (p.why ? `<p class="why">${p.why}</p>` : '') + legend + (D ? `<div class="src">${D.meta.user} · JS recompute vs ONNX, all shown frames: max |Δ| ${maxDiff.toExponential(1)}</div>` : '')) : '';
  const fk = focusKeyIn(card);
  card.innerHTML = cardHTML(lvlBar, title, PW(body + (key === 'overview' ? startG + ovMore : '')));
  card.querySelectorAll('.lvl button').forEach(btn => btn.onclick = () => { LEVEL = btn.dataset.l; try { localStorage.setItem('k8level', LEVEL); } catch {  } showCard(key);
    if (GUIDE.on()) return GUIDE.refresh();
    if (build >= 0 && key === STEPS[build]) { if (LEVEL === 'beginner') TOUR.enter(key); else TOUR.close(); } });
  const gc = document.getElementById('guideCard'); if (gc) gc.onclick = () => GUIDE.start(0);
  const cc = document.getElementById('cmpCard'); if (cc) cc.onclick = () => { tC.checked = true; tC.onchange(); };
  const ta = document.getElementById('tourAgain'); if (ta) ta.onclick = () => TOUR.start(key);
  if (key === 'mirror' && build >= 0) {
    card.querySelector('.bd').insertAdjacentHTML('beforeend', `<p style="margin-top:10px"><button id="swapBtn">${swapped ? 'Back to the original ⇄' : 'Mirror the motion ⇄'}</button></p>
      <p id="swapTxt" class="why" style="display:${swapped ? 'block' : 'none'}">Mirror the head motion, and the two streams simply swap: the sheet above now holds what the one below held. One weight set serves both, so every later layer swaps too, and the readout then flips the y and z of the forecast. (Shown from the features up; the raw input would be the mirrored motion.)</p>`);
    document.getElementById('swapBtn').onclick = () => { if (document.getElementById('tOne').checked) return; setSwap(!swapped); };
    if (document.getElementById('tOne').checked) { const sb = document.getElementById('swapBtn'); sb.disabled = true; sb.title = 'turn off one-stream mode to see the swap'; }
  }
  card.classList.add('show'); cardWire(fk);
  document.querySelectorAll('.lbl.click').forEach(e => e.classList.toggle('on', e.dataset.key === key));
}
let MORE = false; try { MORE = sessionStorage.getItem('k8more') === '1'; } catch {  }
const cardHTML = (lvlBar, title, body) => `<div class="hd">${lvlBar}<span class="ttl">${title || ''}</span><span class="sp"></span>`
  + `<button class="min b-ghost" aria-label="Minimise explanation" data-tip="Minimise" data-kbd="I">${svgI('minus')}</button>`
  + `<button class="x b-ghost" aria-label="Close explanation" data-tip="Close">${svgI('x')}</button></div><div class="bd">${body}</div>`;
function focusKeyIn(root) { const f = document.activeElement; if (!f || !root.contains(f)) return null;
  return f.dataset && f.dataset.l ? `[data-l="${f.dataset.l}"]` : f.id ? `#${f.id}` : f.classList.contains('min') ? '.min' : f.tagName === 'SUMMARY' ? 'details.more > summary' : null; }
function cardWire(fk) {
  card.querySelector('.x').onclick = () => { card.classList.remove('show'); cardOffset(false); };
  card.querySelector('.min').onclick = e => { e.stopPropagation(); setCardMin(!card.classList.contains('min')); };
  card.querySelector('.hd').onclick = e => { if (card.classList.contains('min') && !e.target.closest('.x')) setCardMin(false); };
  card.querySelectorAll('details.more').forEach(d => d.addEventListener('toggle', () => { MORE = d.open; try { sessionStorage.setItem('k8more', MORE ? '1' : '0'); } catch {  } fadeBd(); }));
  const bd = card.querySelector('.bd'); bd.scrollTop = 0; bd.onscroll = fadeBd; fadeBd();
  if (fk) { const el = card.querySelector(fk); if (el) el.focus(); }
}
function fadeBd() { const bd = card.querySelector('.bd'); if (bd) bd.classList.toggle('fade', bd.scrollTop + bd.clientHeight < bd.scrollHeight - 4); }
function setCardMin(on, focus = true) {
  if (!card.querySelector('.hd')) return;
  card.classList.toggle('min', on); cardOffset(card.classList.contains('show'));
  const h = card.querySelector('.hd'); h.setAttribute('role', on ? 'button' : ''); h.tabIndex = on ? 0 : -1; if (!on) h.removeAttribute('role');
  h.onkeydown = ev => { if (on && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); ev.stopPropagation(); setCardMin(false); } };
  if (focus) (on ? h : card.querySelector('.min')).focus();
  fadeBd();
}
const CMP = {
  layers: [['proj', 'Projection', 256, '#3fb8a3'], ['blk0', 'Block 1', 2336, '#9b8cff'], ['blk1', 'Block 2', 2336, '#9b8cff'], ['blk2', 'Block 3', 2336, '#9b8cff'], ['head', 'Readout', 291, '#f0b24a']],
  say: {
    beginner: { proj: 'One small table of weights is used for both the recorded and the mirrored motion, so it is stored once.',
      blk0: 'Each block first looks along time one channel at a time, then mixes channels: far fewer weights than doing both at once.',
      head: 'Nine dials shape a smooth curve instead of twenty separate guesses.',
      tie: 'The mirrored copy reuses every weight, which halves the count.', sep: 'Looking along time and mixing channels as two cheap steps.', poly: 'Three curve dials per axis instead of 60 outputs.',
      zero: 'The momentum guess and the seven measurements need no learned weights at all.' },
    standard: { proj: 'Mirror tying: one 7→32 projection serves both streams (256 instead of 512 untied).',
      blk0: 'Depthwise-separable conv: an 8-tap depthwise filter, then a pointwise mix (2,336 instead of 16,416 as a dense tied conv).',
      head: 'Polynomial readout: 9 coefficients (c1–c3 per axis) instead of a 60-output readout (291 instead of 1,940).',
      tie: 'Mirror tying: both streams share every weight.', sep: 'Depthwise-separable blocks instead of dense dilated convs.', poly: 'Cubic basis readout instead of 60 outputs.',
      zero: 'Damped-velocity prior and the hand-made features: 0 parameters.' },
    expert: { proj: 'tied 1×1 conv: 7·32 + 32 = 256; untied (7→64): 7·64 + 64 = 512.',
      blk0: 'separable K·k + 2K² + K = 32·8 + 2·32² + 32 = 2,336 vs dense tied 2K²k + K = 16,416 (K = 32, k = 8).',
      head: 'W_head 9×32 + 3 x-biases = 291 vs Linear(32, 60, bias=False) + 20 head_bias_x = 1,940.',
      tie: 'h¹ = S·h⁰ shared weights; k8 untied: 15,113 (ablations/README.md:406).', sep: '3 × (16,416 − 2,336) = 42,240 fewer.', poly: '1,940 − 291 = 1,649 fewer.',
      zero: 'prior Δ·τ(1−e^(−k/τ)), τ = 10 samples; features ω, |ω|₁, g: no weights.' },
  },
};
function compressionCard() {
  card.classList.remove('cmp'); card.classList.add('cmpd'); cardOffset(true);
  const L = CMP.say[LEVEL] || CMP.say.standard, fmt = n => n.toLocaleString('en');
  const W = 340, X0 = 70, X1 = W - 6, RH = 32, sc = v => (v / 51444) * (X1 - X0);
  const steps = [['start', 'dense blocks + 60-output readout (tied)', 51444, 0, '#5b6780'],
    ['sep', 'depthwise-separable blocks (×7.0 each)', 9204, -42240, '#9b8cff'],
    ['poly', 'polynomial readout (1,940 → 291)', 7555, -1649, '#f0b24a'],
    ['zero', 'damped prior + cheap features (0 params)', 7555, 0, '#e58bb0']];
  let wf = '';
  steps.forEach(([k, t, total, delta, col], i) => { const y = 6 + i * RH, from = total - delta;
    wf += `<g data-cmp="${k}" style="cursor:pointer"><text x="0" y="${y + 9}" fill="#a6a6a6" font-size="12.5">${k === 'start' ? 'start' : delta ? '− ' + fmt(-delta) : '± 0'}</text>`
      + (k === 'start' ? `<rect x="${X0}" y="${y}" width="${sc(total)}" height="11" rx="2" fill="${col}"/>`
        : `<rect x="${X0 + sc(total)}" y="${y}" width="${Math.max(1.5, sc(from - total))}" height="11" rx="2" fill="${col}" opacity=".85"/><rect x="${X0}" y="${y + 4}" width="${sc(total)}" height="3" fill="#2c2c2c"/>`)
      + `<text x="0" y="${y + 24}" fill="#8f8f8f" font-size="11">${t} → ${fmt(total)}</text></g>`; });
  wf += `<text x="0" y="${6 + 4 * RH + 6}" fill="#eaeaea" font-size="13" font-weight="500">= 7,555 parameters</text>`;
  let x = 0, bar = '';
  CMP.layers.forEach(([k, name, n, col]) => { const w = n / 7555 * W; bar += `<g data-cmp="${k}" style="cursor:pointer"><rect x="${x.toFixed(1)}" y="0" width="${(w - 1).toFixed(1)}" height="16" rx="2" fill="${col}"/>`
    + (w > 40 ? `<text x="${(x + 4).toFixed(1)}" y="28" fill="#a6a6a6" font-size="9.5">${name}</text><text x="${(x + 4).toFixed(1)}" y="40" fill="#808080" font-size="9.5">${fmt(n)}</text>`
      : `<text x="${k === 'proj' ? 0 : W}" y="54" fill="#a6a6a6" font-size="9.5" text-anchor="${k === 'proj' ? 'start' : 'end'}">${k === 'proj' ? '↑ ' : ''}${name} ${fmt(n)}${k === 'proj' ? '' : ' ↑'}</text>`) + '</g>'; x += w; });
  const rows = [['v5 TCNN', 51900, 228455, 4.4534], ['v6 mirror+grav', 26012, 136606, 4.3584], ['v7 compress', 6651, 52243, 4.4186], ['v8 sep+angular', 6651, 52243, 4.3289], ['v9 k8', 7555, 44196, 4.2666], ['k8 final', 7555, 44196, 4.1836]];
  let h = ''; rows.forEach((r, i) => { const y = 14 + i * 22; h += `<text x="0" y="${y + 9}" fill="${i === 5 ? '#eaeaea' : '#808080'}" font-size="9">${r[0]}</text>
    <rect x="86" y="${y}" width="${r[1] / 51900 * 90}" height="8" rx="2" fill="#3fb8a3"/><rect x="190" y="${y}" width="${r[2] / 228455 * 70}" height="8" rx="2" fill="#9b8cff"/>
    <rect x="272" y="${y}" width="${(r[3] - 4.1) / .36 * 60}" height="8" rx="2" fill="#6fa8ff"/><text x="336" y="${y + 9}" fill="#c2c2c2" font-size="10">${r[3].toFixed(3)}°</text>`; });
  const lvlBar = `<div class="lvl" role="group" aria-label="Explanation level">${['beginner', 'standard', 'expert'].map(l => `<button data-l="${l}" aria-pressed="${LEVEL === l}">${l[0].toUpperCase() + l.slice(1)}</button>`).join('')}</div>`;
  card.innerHTML = cardHTML(lvlBar, 'How it got this small', `<h2>How it got this small</h2>
    <div class="one">${LEVEL === 'beginner' ? 'Each bar takes away one trick’s savings; hover a part to see it in 3D.' : 'Each step removes ONE method from the bar above it; every count is a real layer total.'}</div>
    <p class="cstep"><button id="cmpNext" class="b-primary">Compress ▶</button> <button id="cmpReset">⟲ Reset</button> <span id="cmpState" class="why"></span></p>
    <div class="lab">waterfall (all mirror-tied) · click a row to jump there</div>
    <svg width="${W}" height="${6 + 4 * RH + 12}" viewBox="0 0 ${W} ${6 + 4 * RH + 12}" role="img" aria-label="parameter waterfall from 51,444 to 7,555">${wf}</svg>
    <p class="why" style="margin:2px 0 6px"><button id="cmpMirror" style="min-height:28px;font-size:12px">Show mirror tying</button> <b style="color:#3fb8a3">Mirror tying (×2, beside the waterfall):</b> ${LEVEL === 'expert' ? L.tie : 'without it this same model would have 15,113 parameters; the projection alone would be 512 instead of 256.'}</p>
    <div class="lab">per layer (hover one)</div>
    <svg width="${W}" height="60" viewBox="0 0 ${W} 60" role="img" aria-label="parameters per layer: projection 256, blocks 2,336 each, readout 291" id="cmpBar">${bar}</svg>
    <p id="cmpSay" aria-live="polite" style="min-height:38px">${L.zero}</p>
    <div class="lab">lineage v5 → v9, then more training data</div>
    <svg width="340" height="133" viewBox="0 0 384 150" role="img" aria-label="params, bytes and test error per version"><text x="86" y="8" fill="#808080" font-size="9.5">params</text><text x="190" y="8" fill="#808080" font-size="9.5">ONNX bytes</text><text x="272" y="8" fill="#808080" font-size="9.5">test error</text>${h}</svg>
    <div class="src">MODELS.md, LEADERBOARD.md, ablations/README.md:406, ablations/results/v8_bench, review/numbers_findings.md M1, nic/pc_runs/PC_RUNS.md (errors, PC runs) · test set, 20 unseen users · error axis starts at 4.1°</div>`);
  card.classList.add('show'); cardWire(null);
  document.getElementById('cmpNext').onclick = () => cmpGo(Math.min(4, CMPS.st + 1)); document.getElementById('cmpReset').onclick = () => cmpGo(0);
  document.getElementById('cmpMirror').onclick = () => cmpGo(4);
  card.querySelectorAll('svg [data-cmp]').forEach(g => g.addEventListener('click', () => { const st = { start: 0, sep: 1, poly: 2, zero: 3 }[g.dataset.cmp]; if (st !== undefined) cmpGo(st); }));
  cmpLabel();
  card.querySelectorAll('.lvl button').forEach(b => b.onclick = () => { LEVEL = b.dataset.l; try { localStorage.setItem('k8level', LEVEL); } catch {  } compressionCard(); });
  const sayEl = card.querySelector('#cmpSay'), SAY = { proj: L.proj, blk0: L.blk0, blk1: L.blk0, blk2: L.blk0, head: L.head, start: LEVEL === 'expert' ? '256 + 3 × 16,416 + 1,940 = 51,444 (every layer tied, no other method).' : 'The same model with dense blocks and a 60-output readout.', sep: L.sep, poly: L.poly, zero: L.zero };
  card.querySelectorAll('[data-cmp]').forEach(g => {
    g.addEventListener('pointerenter', () => { const k = g.dataset.cmp; sayEl.textContent = SAY[k] || ''; glowGroups(k === 'sep' ? ['blk0', 'blk1', 'blk2'] : k === 'poly' ? ['head'] : k === 'zero' ? ['traj', 'feat'] : GROUPS[k] ? [k] : []); });
    g.addEventListener('pointerleave', () => { glowGroups([]); });
    g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', (SAY[g.dataset.cmp] || g.dataset.cmp).slice(0, 120));
    g.addEventListener('focus', () => g.dispatchEvent(new PointerEvent('pointerenter'))); g.addEventListener('blur', () => glowGroups([]));
  });
}
function glowGroups(keys) {
  glowClear(); if (!keys.length) return;
  for (const k of keys) { if (!GROUPS[k] || !GROUPS[k].visible) continue; _box.makeEmpty(); boxOf(k); if (_box.isEmpty()) continue;
    const parts = glowMesh(_box.clone()); scene.add(...parts); glowParts.push(...parts); }
  requestRender();
}

let camTween = null, solo = null, focused = null;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const HOME = [V(5.5, 8.5, 19), V(4.2, -.3, -3.5)];
let atHome = false;
let atStep = false;
const _qI = new THREE.Quaternion(), _qT = new THREE.Quaternion(), _od = new THREE.Vector3();
function fly(p, t, fog) {
  setFog(fog);
  atHome = atStep = false;
  if (reduce) { camTween = null; camera.position.copy(p); controls.target.copy(t); requestRender(); return; }
  const p0 = camera.position.clone(), t0 = controls.target.clone(), o0 = p0.clone().sub(t0), o1 = p.clone().sub(t);
  const l0 = Math.max(1e-3, o0.length()), l1 = Math.max(1e-3, o1.length()), n0 = o0.clone().divideScalar(l0), n1 = o1.clone().divideScalar(l1);
  const d = t0.distanceTo(t) + Math.abs(l1 - l0) + n0.angleTo(n1) * Math.min(l0, l1);
  camTween = { t0, t, p: p.clone(), n0, l0, l1, q: new THREE.Quaternion().setFromUnitVectors(n0, n1), s: performance.now(), dur: Math.min(2000, Math.max(800, 800 + d * 110)), cont: !!camTween && performance.now() - camTween.s > 60 };
  requestRender();
}
function stepTween(now) {
  const T = camTween, u = Math.min(1, (now - T.s) / T.dur), e = T.cont ? 1 - (1 - u) ** 3 : u < .5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
  controls.target.lerpVectors(T.t0, T.t, e);
  _qT.slerpQuaternions(_qI, T.q, e); _od.copy(T.n0).applyQuaternion(_qT);
  camera.position.copy(controls.target).addScaledVector(_od, T.l0 + (T.l1 - T.l0) * e);
  if (u === 1) { camTween = null; requestRender(); }
}
function setSolo(name) {
  guideUnstage();
  requestRender();
  solo = name;
  const feeds = { blk0: ['proj'], blk1: ['blk0'], blk2: ['blk1'], proj: ['feat'], feat: ['input'], head: ['blk2'], traj: ['head', 'feat'], out: ['traj', 'input'] };
  for (const [k, g] of Object.entries(GROUPS)) g.visible = k === 'tree' ? tTree.checked && !name : (!name || k === name || (feeds[name] || []).includes(k));
  floor.visible = !name;
  soloTrim(name ? feeds[name] || [] : []);
}
let SOLOHIDE = [];
function soloTrim(feedKeys) {
  for (const o of SOLOHIDE) { o.visible = true; o.userData.soloHide = false; } SOLOHIDE = [];
  if (!feedKeys.length) return;
  scene.updateMatrixWorld(true); const wp = V(0, 0, 0), bb = new THREE.Box3();
  for (const k of feedKeys) {
    const g = GROUPS[k]; if (!g || k === 'input') continue;
    let gMax = -Infinity; const ext = [];
    for (const c of g.children) {
      if (c.userData.glow) continue;
      let lo, hi;
      if (c.isInstancedMesh) { c.computeBoundingBox(); bb.copy(c.boundingBox).applyMatrix4(c.matrixWorld); lo = hi = bb.max.x; }
      else if (c.geometry) { if (!c.geometry.boundingBox) c.geometry.computeBoundingBox(); bb.copy(c.geometry.boundingBox).applyMatrix4(c.matrixWorld); lo = bb.min.x; hi = bb.max.x; }
      else { c.getWorldPosition(wp); lo = hi = wp.x; }
      ext.push([c, lo]); if (!c.isCSS2DObject && c.geometry) gMax = Math.max(gMax, hi);
    }
    const lim = gMax - .25;
    for (const [c, lo] of ext) if (c.visible && lo < lim) { c.visible = false; c.userData.soloHide = true; SOLOHIDE.push(c); }
  }
  requestRender();
}
const _box = new THREE.Box3();
function boxOf(name) {
  const g = GROUPS[name]; if (!g) return; scene.updateMatrixWorld(true); const b0 = _box.clone(); _box.makeEmpty();
  const bm = /^blk(\d)$/.exec(name);
  if (name === 'proj') { const zM = Z0 + 32 * ZP; _box.set(V(-7 * TS - .3, LY.feat - .2, -zM), V(CX + .3, LY.proj + .2, zM)); _box.applyMatrix4(MODEL.matrix); _box.union(b0); return; }
  if (name === 'out') { [SL.pred, SL.truth, SL.err].forEach(m => { m.computeBoundingBox(); _box.union(m.boundingBox.clone().applyMatrix4(m.matrixWorld)); }); _box.union(b0); return; }
  if (bm) { const b = +bm[1], zM = Z0 + 32 * ZP; _box.set(V(-7 * DIL[b] * TS - .3, yIn(b) - .2, -zM), V(CX + .3, LY.out(b) + .2, zM)); _box.applyMatrix4(MODEL.matrix); }
  else g.traverse(o => { if (o.isInstancedMesh) { o.computeBoundingBox(); _box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } else if ((o.isMesh || o.isLineSegments) && o.geometry && !o.userData.noFrame) _box.expandByObject(o); });
  _box.union(b0);
}
const HOME_DIR = HOME[0].clone().sub(HOME[1]).normalize(), _hc = new THREE.PerspectiveCamera();
function homeView() {
  _box.makeEmpty(); for (const n of Object.keys(GROUPS)) if (GROUPS[n].visible) boxOf(n);
  if (_box.isEmpty()) return { p: HOME[0].clone(), t: HOME[1].clone() };
  return fitView(_box, HOME_DIR);
}
function fitView(_box, HOME_DIR, fill = .94) {
  const C = [], mn = _box.min, mx = _box.max;
  for (let i = 0; i < 8; i++) C.push(V(i & 1 ? mx.x : mn.x, i & 2 ? mx.y : mn.y, i & 4 ? mx.z : mn.z));
  const { width: VW, height: VH } = viewport(), m = 16, rects = [];
  const ef = EMB() && EMB().free;
  if (EMB()) rects.push(ef ? { L: ef.left + m, R: ef.left + ef.width - m, T: ef.top + m, B: ef.top + ef.height - m } : { L: m, R: VW - m, T: m, B: VH - m });
  else {
  const rOf = id => { const el = document.getElementById(id); if (!el) return null; const r = el.getBoundingClientRect(); return r.width && r.height ? r : null; };
  const cr = card.classList.contains('min') ? null : rOf('card'), sr = rOf('side'), br = rOf('bar');
  const top = 44, bot = (br ? br.top : VH) - 12;
  for (const [L, B] of cr ? [[cr.right + m, bot], [m, Math.min(bot, cr.top - m)]] : [[m, bot]])
    for (const [R, T] of sr ? [[sr.left - m, top], [VW - m, Math.max(top, sr.bottom + m)]] : [[VW - m, top]])
      if (R - L > 200 && B - T > 150) rects.push({ L, R, T, B });
  if (!rects.length) rects.push({ L: m, R: VW - m, T: top, B: bot });
  const pf = window.K8Phone && window.K8Phone.free(); if (pf) { rects.length = 0; rects.push(pf); }
  }
  _hc.copy(camera); _hc.updateProjectionMatrix();
  const tanH = Math.tan(_hc.fov * Math.PI / 360), q = V(0, 0, 0);
  let best = null;
  for (const r of rects) {
    const t = _box.getCenter(V(0, 0, 0)); let d = _box.getSize(V(0, 0, 0)).length() / 2 / tanH;
    for (let it = 0; it < 6; it++) {
      _hc.position.copy(t).addScaledVector(HOME_DIR, d); _hc.lookAt(t); _hc.updateMatrixWorld();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const c of C) { q.copy(c).project(_hc); const x = (q.x + 1) / 2 * VW, y = (1 - q.y) / 2 * VH; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const s = Math.max((x1 - x0) / ((r.R - r.L) * fill), (y1 - y0) / ((r.B - r.T) * fill));
      const perPx = 2 * d * tanH / VH, right = V(1, 0, 0).applyQuaternion(_hc.quaternion), up = V(0, 1, 0).applyQuaternion(_hc.quaternion);
      t.addScaledVector(right, ((x0 + x1) / 2 - (r.L + r.R) / 2) * perPx).addScaledVector(up, -((y0 + y1) / 2 - (r.T + r.B) / 2) * perPx);
      d *= s;
    }
    if (!best || d < best.d) best = { d, t, r };
  }
  return { p: best.t.clone().addScaledVector(HOME_DIR, best.d), t: best.t, d: best.d, r: best.r, rects };
}
function refitStep() {
  const v = stepView(STEPS[build]);
  if (camTween) fly(v.p, v.t, v.fog); else { camTween = null; camera.position.copy(v.p); controls.target.copy(v.t); setFog(v.fog); }
  atStep = true; buildView = { p: v.p.clone(), t: v.t.clone(), fog: v.fog };
}
function goHome(instant) { const h = homeView(); if (instant) { setFog(null); camTween = null; camera.position.copy(h.p); controls.target.copy(h.t); requestRender(); } else fly(h.p, h.t); atHome = true; }
function focusGroup(name, keepDir) {
  if (!GROUPS[name]) return; _box.makeEmpty(); boxOf(name);
  const c = _box.getCenter(V(0, 0, 0)), size = Math.max(1.5, _box.getSize(V(0, 0, 0)).length());
  let dir = keepDir ? camera.position.clone().sub(controls.target).normalize() : (/^blk/.test(name) ? V(1, .9, .6) : V(.35, .35, 1)).normalize();
  fly(c.clone().add(dir.multiplyScalar((size * 1.15 + 1.8) * (window.K8Phone ? window.K8Phone.distK() : 1))), c);
}
function select(key, keepDir = false) {
  if (build >= 0 && STEPS.includes(key)) return showBuild(STEPS.indexOf(key));
  focused = key;
  if (key === 'mirror') fly(V(13, 4, 4), V(5, 0, -4)); else focusGroup(key, keepDir);
  if (document.getElementById('tSolo').checked && GROUPS[key]) setSolo(key);
  showCard(key);
}
function home() { UPD++; if (CMPS.on && !tC.checked) cmpShow(false); BL.forEach(B => { B.ctx.visible = false; }); if (FLY.on) setFly(false); if (WEAR.on) setWear(false); guideUnstage(); soloTrim([]); GUIDE.onHome(); build = -1; TOUR.close(); resetProposal(); applyFocus(); focused = null; setSolo(null); showCard('overview'); goHome(); stepUI(); }
const STEPS = ['input', 'feat', 'proj', 'mirror', 'blk0', 'blk1', 'blk2', 'reach', 'head', 'traj', 'out', 'gaze'];
const STEP_NAME = { input: 'Input', feat: 'Features', proj: 'Projection', mirror: 'Mirror', blk0: 'Block 1', blk1: 'Block 2', blk2: 'Block 3', reach: 'Reach', head: 'Readout', traj: 'Trajectory', out: 'Forecast', gaze: 'Head direction' };
const STEP_GROUPS = { mirror: ['feat', 'proj'], reach: ['tree'] };
const stepHas = g => build >= 0 && (STEP_GROUPS[STEPS[build]] || [STEPS[build]]).some(k => GROUPS[k] === g);
const PARAMS = { proj: 256, blk0: 2336, blk1: 2336, blk2: 2336, head: 291 };
const paramsAt = i => STEPS.slice(0, i + 1).reduce((a, k) => a + (PARAMS[k] || 0), 0);
let build = 0;
const ICON = {left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', flag: '<path d="M4 22V4c4-2 8 2 12 0v10c-4 2-8-2-12 0"/>', rot: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', play: '<polygon class="f" points="7 4 20 12 7 20 7 4"/>', pause: '<rect class="f" x="6" y="4" width="4" height="16" rx="1"/><rect class="f" x="14" y="4" width="4" height="16" rx="1"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>', plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>', minus: '<path d="M5 12h14"/>', up: '<path d="m18 15-6-6-6 6"/>'};
const svgI = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
function stepUI() {
  const np = build < 0 ? 7555 : paramsAt(build);
  document.getElementById('stepLbl').textContent = build < 0 ? 'Whole model' : STEP_NAME[STEPS[build]];
  document.getElementById('params').innerHTML = `${build < 0 ? '' : `${build + 1}/${STEPS.length} · `}${np.toLocaleString('en')}${build < 0 ? ' params' : ' / 7,555'}<span class="trk" aria-hidden="true"><i style="--p:${(np / 7555 * 100).toFixed(1)}%"></i></span>`;
  const nx = document.getElementById('next'), nk = build < 0 ? ['rot', 'Start over', 'Start over from the input'] : build === STEPS.length - 1 ? ['flag', 'Finish', 'Finish: show the whole model'] : ['right', 'Next', 'Next step'];
  nx.innerHTML = `${svgI(nk[0])}<span class="bl">${nk[1]}</span>`; nx.dataset.tip = nk[2];
  document.getElementById('all').setAttribute('aria-pressed', build < 0);
  document.getElementById('call').classList.toggle('show', build >= 0 && /^blk\d$/.test(STEPS[build])); blkCaption(); drawInset();
  document.getElementById('back').disabled = build === 0;
}
const ZM = Z0 + 32 * ZP;
const STEP_VIEW = {
  input:  { box: [-2.6, 1.9, -.1, .1, -.4, 2.7], dir: [1, .3, .75], fade: 3 },
  feat:   { box: [-2.2, .25, -.1, 1.25, -.9, .9], dir: [.9, .4, .8] },
  proj:   { box: [-1.0, .3, 1.0, 2.4, -ZM, ZM + 1.5], dir: [.45, .2, 1], fade: 1.6 },
  mirror: { box: [-1.6, .3, -.1, 2.4, -ZM, ZM + 1.5], dir: [.8, .25, .9] },
  blk0:   { box: [-.5, .6, LY.proj - .1, LY.out(0) + .1, -ZM - .85, ZM + 1], dir: [.35, .22, 1], fill: 1, fade: 2.4 },
  blk1:   { box: [-1.6, .6, LY.out(0) - .1, LY.out(1) + .1, -ZM - 1.25, ZM + 1], dir: [.35, .22, 1], fill: 1, fade: 2.4 },
  blk2:   { box: [-8.4, .6, LY.out(1) - .1, LY.out(2) + .1, -ZM - 1.7, ZM + 1], dir: [1, .4, .5], fill: 1 },
  reach:  { box: [-393 * TS - .2, .3, LY.proj - .2, LY.out(2) + .3, -.1, .1], dir: [-.08, 1, 0], fill: .86 },
  head:   { box: [0, .6, LY.head - .8, LY.head + .3, -.7, .6], dir: [.7, .35, 1], pad: .25, fade: .9 },
  traj:   { box: [-.05, .6, LY.prior - .25, LY.r + .3, -.3, .35], dir: [.6, .45, 1], pad: .1, fade: .7 },
  out:    { box: [-.05, .7, FY - .25, FY + .6, -.35, .45], dir: [.6, .45, 1], pad: .1, fade: .7 },
};
window.__k8steps = STEPS; window.__k8sv = STEP_VIEW;
const _sb = new THREE.Box3();
function stepView(key) {
  const s = STEP_VIEW[key], [x0, x1, y0, y1, z0, z1] = s.box, C = []; _sb.makeEmpty();
  for (let i = 0; i < 8; i++) { C.push(W(i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0)); _sb.expandByPoint(C[i]); }
  const v = fitView(_sb, V(...s.dir).normalize(), s.fill || .9), n = v.t.clone().sub(v.p).normalize();
  const far = Math.max(...C.map(c => c.clone().sub(v.p).dot(n)));
  v.fog = { d: v.p.distanceTo(v.t), near: far + (s.pad ?? .3), far: far + (s.pad ?? .3) + (s.fade ?? 2.5) };
  return v;
}
scene.fog = new THREE.Fog('#000', 1e3, 2e3);
if (EMB() && EMB().clear) scene.fog.color.set('#000');
let FOGV = null;
function fogUpdate() {
  const k = FOGV ? camera.position.distanceTo(controls.target) / FOGV.d : 1;
  scene.fog.near = FOGV ? FOGV.near * k : 1e3; scene.fog.far = FOGV ? FOGV.far * k : 2e3;
  labelFog();
}
const _lf = new THREE.Vector3(), _ld = new THREE.Vector3();
function labelFog() {
  if (typeof allLabels === 'undefined' || !scene.fog) return;
  camera.getWorldDirection(_ld);
  for (const L of allLabels) { const el = L.o.element;
    if (L.other && L.small) { el.classList.add('far'); continue; }
    const z = L.o.getWorldPosition(_lf).sub(camera.position).dot(_ld), f = Math.min(1, Math.max(0, (z - scene.fog.near) / (scene.fog.far - scene.fog.near)));
    const a = (L.other ? .6 : 1) * (1 - f); el.style.opacity = a === 1 ? '' : a.toFixed(2); el.classList.toggle('far', a < .15); }
}
function setFog(f) { FOGV = f || null; fogUpdate(); requestRender(); }
controls.addEventListener('change', fogUpdate);
function showBuild(i) {
  if (CMPS.on) { tC.checked = false; document.body.classList.remove('compress'); cmpShow(false); }
  UPD++;
  if (FLY.on) setFly(false); if (WEAR.on) setWear(false);
  guideUnstage(); soloTrim([]);
  build = i; solo = null; resetProposal();
  const built = new Set(STEPS.slice(0, i + 1)), key = STEPS[i], prev = STEPS[Math.max(0, i - 1)];
  for (const [k, g] of Object.entries(GROUPS)) g.visible = key === 'gaze' ? k === 'gaze'
    : k === 'links' ? i >= 1 : k === 'tree' ? key === 'reach' || (tTree.checked && i >= STEPS.indexOf('blk2')) : built.has(k);
  floor.visible = key !== 'gaze'; applyFocus();
  focused = key;
  BL.forEach((B, k) => { B.ctx.visible = key === 'blk' + k; });
  showCard(key); stepUI();
  if (key === 'reach') { GROW = { t0: performance.now() + (reduce ? 0 : 900) }; if (reduce) { GROW = null; paintTree(3); } }
  if (key === 'gaze') { fly(G.position.clone().add(V(1.1, 1.2, 3.4)), G.position.clone()); gazeFollow = true; }
  else { const v = stepView(key); fly(v.p, v.t, v.fog); atStep = true; }
  buildView = camTween ? { p: camTween.p.clone(), t: camTween.t.clone(), fog: FOGV } : { p: camera.position.clone(), t: controls.target.clone(), fog: FOGV };
  applyHL(); poseHS0();
  if (!EMB()) TOUR.enter(key);
  GUIDE.onBuild(i);
}
camera.position.copy(HOME[0]); controls.target.copy(HOME[1]);
const ORDER = ['input', 'feat', 'proj', 'blk0', 'blk1', 'blk2', 'head', 'traj', 'out'];
document.getElementById('next').onclick = () => GUIDE.on() ? GUIDE.jumpStep(1) : build < 0 ? showBuild(0) : build === STEPS.length - 1 ? home() : showBuild(build + 1);
document.getElementById('back').onclick = () => { if (GUIDE.on()) return GUIDE.jumpStep(-1); if (build > 0) showBuild(build - 1); };
document.getElementById('guideBtn').onclick = () => GUIDE.on() ? GUIDE.exit() : GUIDE.start(0);

let GVIEW = null;
let buildView = null;
function guideView(at, pr) {
  if (pr === 'build') return buildView;
  const f = TOUR_ANCHORS[at], a = f && f(); if (!a || !a.obj || !pr || !pr.dir) return null;
  scene.updateMatrixWorld(true);
  const t = pr.mem != null ? BL[pr.mem].mem.getWorldPosition(V(0, 0, 0)) : a.obj.localToWorld(a.local.clone());
  if (pr.blockMid != null) { const b = pr.blockMid, sp = 7 * DIL[b] * TS; t.copy(W(-sp / 2, (yIn(b) + LY.out(b)) / 2, 0)); }
  if (pr.ctxMid != null) { const b = pr.ctxMid; t.copy(W(-196 * TS, BL[b].yi, (ctxRowZ(BL[b], 0) + ctxRowZ(BL[b], b)) / 2 - .2)); }
  if (pr.mixMid != null) { const b = pr.mixMid; t.copy(W(CX, (LY.dw(b) + LY.upd(b)) / 2, 0)); }
  if (pr.ty != null) t.y = pr.ty;
  if (pr.tz != null) t.z = pr.tz; if (pr.tx != null) t.x = pr.tx;
  const PK = window.K8Phone && window.K8Phone.form() ? window.K8Phone.distK() : 0;
  const dist = (pr.mem != null ? Math.max(pr.dist, 7 * DIL[pr.mem] * TS * 1.45 + .6) : pr.blockMid != null ? pr.dist + 7 * DIL[pr.blockMid] * TS * .6 : pr.dist) * (PK || 1);
  if (pr.mem != null) t.y = Math.max(0, BL[pr.mem].zMax - .5 * dist * Math.tan(camera.fov * Math.PI / 360));
  const p = t.clone().add(V(...pr.dir).normalize().multiplyScalar(dist));
  const { width: VW, height: VH } = viewport(), rOf = id => { const el = document.getElementById(id); return el && el.classList.contains('show') && !el.classList.contains('min') ? el.getBoundingClientRect() : null; };
  const cr = rOf('card'), ir = rOf('inset') || rOf('gazeKey'), natural = VW / 2 + (cr ? 200 : 0), want = PK || EMB() ? natural :((cr ? cr.right : 0) + (ir ? ir.left : VW)) / 2;
  const perPx = 2 * dist * Math.tan(camera.fov * Math.PI / 360) / VH, right = t.clone().sub(p).cross(V(0, 1, 0)).normalize();
  const t0 = t.clone(), sh = right.multiplyScalar((natural - want) * perPx); p.add(sh); t.add(sh);
  const fog = /^(head|traj|out)\./.test(at) ? { d: dist, near: dist + .8, far: dist + 2.3 } : null;
  return (GVIEW = { p, t, t0, fog });
}
let GSTAGE = [], GLB = null, GDIM = [];
const GXL = new THREE.Group(); MODEL.add(GXL);
function guideUnstage() {
  for (const o of GXL.children.slice()) { GXL.remove(o); if (o.element) o.element.remove(); }
  for (const [m, c] of GDIM) m.color.copy(c); GDIM = [];
  if (!GSTAGE.length && !CLIP_LIVE && GLB === null && !GMIX) return;
  for (const [o, v] of GSTAGE) { o.visible = v; o.userData.gHide = false; } GSTAGE = [];
  if (CLIP_LIVE) { CLIP_LIVE = null; applyClip(); }
  if (GLB !== null) { LB = GLB; GLB = null; }
  GMIX = null; if (D) update(); requestRender();
}
function guideStage(at, pr, t) {
  guideUnstage(); if (!pr || !(pr.keep || pr.live != null || pr.hide || pr.lb || pr.mix != null || pr.feedKey)) return;
  const a = at && TOUR_ANCHORS[at] && TOUR_ANCHORS[at](), groups = Object.values(GROUPS), keep = new Set((pr.keep || []).map(k => GROUPS[k]));
  const holds = (c, o) => { for (; o; o = o.parent) if (o === c) return true; return false; };
  if (a) for (let o = a.obj; o; o = o.parent) if (groups.includes(o)) keep.add(o);
  const hide = o => { GSTAGE.push([o, o.visible]); o.visible = false; o.userData.gHide = true; };
  if (pr.keep) for (const g of groups) if (g.visible && !keep.has(g)) hide(g);
  if (pr.trim && t) {
    scene.updateMatrixWorld(true); const lim = t.x - .25, wp = V(0, 0, 0);
    for (const g of keep) for (const c of g.children) {
      if (!c.visible || (a && holds(c, a.obj))) continue;
      let maxX;
      if (c.isInstancedMesh) { c.computeBoundingBox(); maxX = c.boundingBox.clone().applyMatrix4(c.matrixWorld).max.x; }
      else if (c.geometry) { if (!c.geometry.boundingBox) c.geometry.computeBoundingBox(); maxX = c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld).max.x; }
      else { c.getWorldPosition(wp); maxX = wp.x; }
      if (maxX < lim) hide(c);
    }
  }
  if (pr.live != null) { CLIP_LIVE = { z: pr.live * TS + TS / 2, groups: new Set(Object.keys(GROUPS).filter(k => k !== 'gaze')) }; PLANE_LIVE.constant = CLIP_LIVE.z; applyClip(); }
  for (const k of pr.hide || []) if (GROUPS[k] && GROUPS[k].visible) hide(GROUPS[k]);
  if (pr.lb) { GLB = LB; LB = LB * pr.lb; }
  if (pr.feedKey && GROUPS[pr.feedKey]) GROUPS[pr.feedKey].traverse(o => { const m = o.material; if (!m || !m.color || o.userData.glow) return; GDIM.push([m, m.color.clone()]); m.color.multiplyScalar(.3); });
  if (pr.mix != null && D) { const b = pr.mix, u = relu(pointwise(b, depthwise(b, idx))); let o = 0; u[0].forEach((v, i) => { if (v > u[0][o]) o = i; }); if (!(u[0][o] > 0)) { const h0 = depthwise(b, idx)[0]; h0.forEach((v, i) => { if (Math.abs(v) > Math.abs(h0[o])) o = i; }); } GMIX = { b, o };
    for (const [txt, z] of [['h⁰ observed stream · solid A lines mix within it', zc(0, 14)], ['h¹ mirrored stream · dashed B lines cross the mirror plane', zc(1, 14)]]) {
      const el = document.createElement('div'); el.className = 'lbl hl'; el.textContent = txt; const o2 = new CSS2DObject(el); o2.position.set(CX, LY.dw(b) - .35, z); GXL.add(o2); } }
  if (D) update();
  requestRender();
}
function guideFx(s) {
  const had = !!guideInset; guideInset = null; sideEl.classList.remove('gwide');
  if (s && s.t && s.t.at === 'head.grid') { guideInset = basis3; sideEl.classList.add('gwide'); }
  if (had || guideInset) drawInset();
}
function basis3(f) {
  if (!f || !f.coef) return '';
  const KS = Array.from({ length: H + 1 }, (_, k) => k), cols = ['#8fe3ff', '#c9a6ff', '#ff9ad5'], PW = ['κ', 'κ²', 'κ³'];
  const w = 336, h = 78, X0 = 22, X1 = 210, X = k => X0 + k / H * (X1 - X0), f3 = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(3);
  const tx = (x, y, t, c, sz = 10, a = 'start') => `<text x="${x}" y="${y}" fill="${c}" font-size="${sz}" text-anchor="${a}">${t}</text>`;
  const path = (vals, Y) => 'M' + vals.map((v, k) => `${X(k).toFixed(1)},${Y(v).toFixed(1)}`).join('L');
  let out = `<h3>Readout: 3 curves → 1 per axis (this call)</h3><div class="m">each dial c scales one basic curve (κ = k/20, k = 0…20 steps ahead); added together they give the learned correction for that axis</div>`;
  for (let a = 0; a < 3; a++) {
    const cur = [0, 1, 2].map(p => KS.map(k => f.coef[p][a] * (k / H) ** (p + 1))), sum = KS.map((_, i) => cur[0][i] + cur[1][i] + cur[2][i]);
    const m = Math.max(1e-9, ...cur.flat().map(Math.abs), ...sum.map(Math.abs)), Y = v => h / 2 - v / m * (h / 2 - 7);
    let g = `<line x1="${X0}" x2="${X1}" y1="${Y(0)}" y2="${Y(0)}" stroke="#2c2c2c"/>` + tx(2, h / 2 + 4, 'xyz'[a], '#eaeaea', 13);
    cur.forEach((c, p) => { g += `<path d="${path(c, Y)}" fill="none" stroke="${cols[p]}" stroke-width="1.3" stroke-dasharray="${p ? '4 2' : ''}" opacity=".9"/>`
      + tx(X1 + 8, 13 + p * 14, `${f3(f.coef[p][a])}·${PW[p]}`, cols[p], 10.5); });
    g += `<path d="${path(sum, Y)}" fill="none" stroke="#f0b24a" stroke-width="2.4"/>` + tx(X1 + 8, 13 + 3 * 14 + 4, `= ${f3(sum[H])} at 200 ms`, '#f0b24a', 10);
    out += `<svg width="${w}" height="${h}" role="img" aria-label="axis ${'xyz'[a]}: three scaled basis curves and their sum">${g}</svg>`;
  }
  return out + `<div class="m">thin: c1·κ, c2·κ², c3·κ³ · thick amber: their sum, the learned residual (0 at now) · scale per axis · x includes the bias b_x</div>`;
}
const GUIDE = window.K8GUIDE.create({
  reduce, tips: window.K8TOUR.TIPS, steps: STEPS, tour: TOUR,
  stepName: k => STEP_NAME[k] || k, level: () => LEVEL, expert: k => ((window.EXPERT || {})[k] || {}).summary || '',
  build: () => build, showBuild, home, view: guideView, stage: (at, pr, t) => at ? guideStage(at, pr, t) : guideUnstage(), fx: guideFx, fly: (p, t) => fly(p, t, buildView && p === buildView.p ? buildView.fog : GVIEW && p === GVIEW.p ? GVIEW.fog : null), flying: () => !!camTween, render: requestRender,
  follow: () => { gazeFollow = true; requestRender(); },
  swap: on => { if (on !== swapped && !document.getElementById('tOne').checked) setSwap(on); },
  started: on => { if (on) { if (FLY.on) setFly(false); if (WEAR.on) setWear(false); } const b = document.getElementById('guideBtn'); b.innerHTML = `${svgI(on ? 'x' : 'route')}<span class="bl">Tour</span>`; b.setAttribute('aria-pressed', on);
    b.setAttribute('aria-label', on ? 'Exit guided tour' : 'Guided tour'); b.dataset.tip = on ? 'Exit the guided tour' : 'Guided tour: the whole model, one tip at a time';
    flyBtn.disabled = on; flyBtn.dataset.tip = on ? 'Exit the tour to fly (Esc)' : 'Fly through the model with W A S D and the mouse';
    if (card.classList.contains('show')) showCard(build >= 0 ? STEPS[build] : 'overview'); },
});
async function guideCheck() {
  const was = GUIDE.on(), frames = k => new Promise(r => { const f = () => --k ? requestAnimationFrame(f) : r(); requestAnimationFrame(f); }), out = [];
  const fin = v => !!v && [v.p.x, v.p.y, v.p.z, v.t.x, v.t.y, v.t.z].every(Number.isFinite);
  GUIDE.start(0);
  for (let m = 0; m < GUIDE.SHOTS.length; m++) {
    GUIDE.go(m); await frames(3);
    for (let t = 0; t < 360 && GUIDE.state().waiting; t++) await frames(1);
    const s = GUIDE.SHOTS[m]; let anchorOk = true, camOk = true;
    const glowOk = s.end ? true : s.t.dom ? !!document.querySelector('.gHL') : GLM.length > 0;
    let onGlow = true;
    if (!s.end && !s.t.dom && s.t.at) { const a = TOUR_ANCHORS[s.t.at] && TOUR_ANCHORS[s.t.at](); if (a && a.obj) { const P = a.obj.localToWorld(a.local.clone());
      onGlow = GLM.some(m => new THREE.Box3().setFromObject(m).expandByScalar(.03).containsPoint(P)); } }
    if (s.t.dom) { const el = document.querySelector(s.t.dom), r = el && el.getBoundingClientRect(); anchorOk = !!(r && (r.width || r.height)); }
    else if (s.t.at) { const a = TOUR_ANCHORS[s.t.at] && TOUR_ANCHORS[s.t.at](); anchorOk = !!(a && a.obj && shownIn3D(a.vis)); }
    if (s.preset !== 'keep' && s.preset !== 'follow') camOk = fin(guideView(s.t.at, s.preset));
    else if (s.preset === 'follow') camOk = gazeFollow;
    out.push({ shot: m + 1, step: s.k, anchor: s.t.dom || s.t.at || '(summary)', preset: typeof s.preset === 'string' ? s.preset : s.preset ? 'orbit' : 'MISSING', anchorOk, camOk, glowOk, onGlow });
  }
  if (!was) GUIDE.exit(); console.table(out); return out.filter(r => !r.anchorOk || !r.camOk || !r.glowOk || !r.onGlow);
}
document.getElementById('all').onclick = home;
document.getElementById('call').onclick = () => oneCall();

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
const toNDC = e => { const v = viewport(); return mouse.set((e.clientX - v.left) / v.width * 2 - 1, -(e.clientY - v.top) / v.height * 2 + 1); };
renderer.domElement.addEventListener('dblclick', e => {
  toNDC(e); ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(pickables.filter(m => m.parent.visible))[0]; if (hit) select(hit.object.userData.stage, true);
});
let downXY = null;
renderer.domElement.addEventListener('pointerdown', e => { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('click', e => {
  if (FLY.on || WEAR.on || !downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 5 || build < 0 || !D) return;
  const key = STEPS[build], m = /^blk(\d)$/.exec(key), B = m ? BL[+m[1]] : null;
  const targets = key === 'feat' ? [SL.feat] : key === 'proj' ? [SL.proj] : key === 'head' ? [SL.coef] : B ? [B.dw, B.upd, B.out] : null;
  if (!targets) return;
  toNDC(e); ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(targets)[0], id = hit && hit.instanceId != null ? hit.instanceId : null;
  if (key === 'feat') { U.fpick = id === null ? null : Math.floor(id / NP) % 7; return refresh(); }
  if (key === 'proj') { U.ppick = id === null ? null : { s: Math.floor(id / (32 * NP)), o: Math.floor(id / NP) % 32 }; return refresh(); }
  if (key === 'head') { U.hpick = id === null ? null : { p: id % 3, a: Math.floor(id / 3) }; if (id !== null) U.htab = 'w'; return refresh(); }
  if (id === null) return setPick(null);
  const k = Math.floor(id / (hit.object === B.out ? NP : 1));
  U.btab = 'ch'; setPick({ b: +m[1], s: Math.floor(k / 32), c: k % 32, t0: performance.now() });
});
controls.addEventListener('start', () => { atHome = atStep = false; gazeFollow = false; GUIDE.userCamera(); });
controls.addEventListener('change', requestRender);

const scrub = document.getElementById('scrub'), playB = document.getElementById('play'), speed = document.getElementById('speed');
const tC = document.getElementById('tCompress'), tTree = document.getElementById('tTree'), menu = document.getElementById('menu'), more = document.getElementById('more');
let playing = !reduce && !EMB(), acc = 0;
const setPlay = v => { playing = v; for (const b of [playB, document.getElementById('wearPlay')]) if (b) { b.innerHTML = svgI(v ? 'pause' : 'play'); b.setAttribute('aria-label', v ? 'Pause' : 'Play'); } };
const setIdx = i => { if (!D) return; idx = Math.max(D.firstShown, Math.min(D.frames.length - 1, i)); update(); };
const REAL_RATE = 100, EFT = []; let embRate = REAL_RATE;
const rate = () => EMB() ? embRate : +speed.value;
function embedRateWatch(gapMs) {
  if (!EMB() || !playing || embRate !== REAL_RATE) { EFT.length = 0; return; }
  EFT.push(gapMs); if (EFT.length < 30) return;
  const med = EFT.slice().sort((a, b) => a - b)[EFT.length >> 1]; EFT.length = 0;
  if (med > 1000 / 30) embRate = +speed.max;
}
playB.onclick = () => setPlay(!playing);
scrub.oninput = () => setIdx(+scrub.value);
function setMenu(on, keys = false) { menu.classList.toggle('show', on); more.setAttribute('aria-expanded', on); more.setAttribute('aria-pressed', on);
  if (on) { if (keys) document.getElementById('keysHelp').open = true; (menu.querySelector('input') || menu).focus(); } else if (menu.contains(document.activeElement)) more.focus(); }
more.onclick = () => setMenu(!menu.classList.contains('show'));
menu.querySelector('.mx').onclick = () => setMenu(false);
addEventListener('pointerdown', e => { if (menu.classList.contains('show') && !menu.contains(e.target) && !more.contains(e.target)) setMenu(false); }, true);
for (const [id, f] of [['lineB', v => (+v).toFixed(1)], ['speed', v => v]]) { const el = document.getElementById(id), out = document.getElementById(id + 'v'); el.addEventListener('input', () => { out.textContent = f(el.value); }); }
document.getElementById('tLines').onchange = e => lines.forEach(l => { if (!l.userData.static) l.visible = e.target.checked; });
tTree.onchange = () => build >= 0 ? showBuild(build) : setSolo(solo);
document.getElementById('tLabels').onchange = e => document.body.classList.toggle('nolabels', !e.target.checked);
document.getElementById('tAllLabels').onchange = e => { document.body.classList.toggle('alllabels', e.target.checked); requestRender(); };
tC.onchange = () => { document.body.classList.toggle('compress', tC.checked); if (tC.checked) { if (GUIDE.on()) GUIDE.exit(); home(); compressionCard(); goHome(); cmpShow(true); } else { cmpShow(false); glowGroups([]); showCard(focused || 'overview'); } };
document.getElementById('tSolo').onchange = e => setSolo(e.target.checked && focused && GROUPS[focused] ? focused : null);
addEventListener('keydown', e => {
  if (EMB()) return;
  if (e.target.tagName === 'SELECT' || (e.target.tagName === 'INPUT' && (e.target.type !== 'checkbox' || e.key === ' ' || e.key === 'Enter'))) return;
  if ((e.target.tagName === 'SUMMARY' || e.target.tagName === 'A') && (e.key === 'Enter' || e.key === ' ')) return;
  if (e.key === 'Escape') hideTip();
  if (e.key === 'Escape' && menu.classList.contains('show')) { setMenu(false); return; }
  if (!e.metaKey && !e.ctrlKey && !e.altKey && !FLY.on) {
    if (e.key === '?') { setMenu(true, true); return; }
    if (e.key === 'i' || e.key === 'I') { if (card.classList.contains('show')) setCardMin(!card.classList.contains('min')); return; }
    if (e.key === 'k' || e.key === 'K') { setSide(!sideEl.classList.contains('collapsed')); return; }
  }
  if (e.target.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
  if (FLY.on && flyKey(e, true)) return;
  if (WEAR.on && e.key === 'Escape') { setWear(false); return; }
  if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) { setFly(!FLY.on); return; }
  if (GUIDE.onKey(e)) return;
  if (TOUR.onKey(e)) return;
  if (e.code === 'Space') { e.preventDefault(); setPlay(!playing); }
  else if (e.key === 'ArrowRight') setIdx(idx + 1); else if (e.key === 'ArrowLeft') setIdx(idx - 1);
  else if (e.key === 'n' || e.key === 'Enter') document.getElementById('next').click(); else if (e.key === 'b') document.getElementById('back').click();
  else if (e.key === 'Escape') home();
  else if (e.key === 'c' || e.key === 'C') oneCall();
  else if (e.key === 's') { const t = document.getElementById('tSolo'); t.checked = !t.checked; t.onchange({ target: t }); }
  else if (/^[1-9]$/.test(e.key)) select(ORDER[+e.key - 1]);
});
async function loadUser(id) {
  document.getElementById('readout').textContent = 'loading user…';
  try { prepare(await fetchTrace(id)); } catch (err) { if (EMB()) { readyBad(err); return; }
    const b = document.getElementById('banner'); b.style.display = 'block'; b.textContent = `Could not load traces/${id}.js. Serve the k8_3d folder over http (see proposal/RUN.md: python3 -m http.server 8000 --bind 127.0.0.1 --directory k8_3d), then open http://127.0.0.1:8000/proposal/.`; return; }
  scrub.min = D.firstShown; scrub.max = D.frames.length - 1; idx = D.firstShown; update(); if (!focused) showCard('overview');
}
const sel = document.getElementById('user');
if (INDEX.length) {
  document.getElementById('userbox').style.display = 'flex';
  INDEX.forEach(u => { const o = document.createElement('option'); o.value = u.id; o.textContent = `${u.label} · ${Math.round(u.mean_speed_deg_s)}°/s · avg error ${u.mean_err20_deg.toFixed(1)}°`; sel.appendChild(o); });
  sel.onchange = () => loadUser(sel.value);
  const want = EMB() && EMB().user, u0 = want || INDEX[0].id;
  if (want && !INDEX.some(u => u.id === want)) readyBad(new Error(`K8_EMBED.user: no trace "${want}" in traces/index.js`));
  else { if (u0 !== INDEX[0].id) sel.value = u0; loadUser(u0); }
} else if (EMB()) readyBad(new Error('traces/index.js not found'));
else { const b = document.getElementById('banner'); b.style.display = 'block'; b.textContent = 'traces/index.js not found: run make_trace.py --suite, then reload.'; }
const CMPS = { on: false, st: 0, anim: false, ghosts: null, untied: null, links: null, shown: 51444 };
const CMP_STATES = [[51444, 'dense blocks + 60-output readout, all mirror-tied'], [9204, 'depthwise-separable blocks: each block 16,416 → 2,336'],
  [7555, 'polynomial readout: 1,940 → 291'], [7555, 'damped-velocity prior + hand-made features: 0 parameters'], [7555, 'mirror tying (separate, ×2): untied 15,113 → tied 7,555']];
const CG = new THREE.Group(); CG.visible = false; scene.add(CG);
function cmpBuild() {
  if (CMPS.ghosts) return;
  const mk = (key, ratio, color, dy = 0) => { _box.makeEmpty(); boxOf(key); const c = _box.getCenter(V(0, 0, 0)), sz = _box.getSize(V(0, 0, 0)), g = new THREE.BoxGeometry(sz.x, sz.y, sz.z);
    const fill = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .07, depthWrite: false })), edge = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color, transparent: true, opacity: .85 }));
    const o = new THREE.Group(); o.add(fill, edge); o.position.copy(c).add(V(0, dy, 0)); CG.add(o); const big = Math.cbrt(ratio); o.scale.setScalar(big);
    return { o, fill, edge, big, s: big, a: 1, home: c.clone() }; };
  CMPS.ghosts = { blk0: mk('blk0', 16416 / 2336, '#ff6b5e'), blk1: mk('blk1', 16416 / 2336, '#ff6b5e'), blk2: mk('blk2', 16416 / 2336, '#ff6b5e'), head: mk('head', 1940 / 291, '#f0b24a'), proj: mk('proj', 1, '#3fb8a3') };
  CMPS.untied = ['proj', 'blk0', 'blk1', 'blk2'].map(k => mk(k, 1, '#9b8cff', -5.2));
  const pairs = CMPS.untied.map(u => [u.o.position.clone(), u.home.clone()]);
  CMPS.links = lineSetPlain(pairs, '#9b8cff'); CG.add(CMPS.links);
  condLabel('dense equivalent (red)', CMPS.ghosts.blk1.home.clone().add(V(0, 2.9, 0)), 'lbl stage', () => CMPS.st === 0, CG);
  condLabel('0 params', W(-1.2, LY.feat, .8), 'lbl stage zero', () => CMPS.st === 3, CG);
  condLabel('0 params', W(-.6, LY.prior, 0), 'lbl stage zero', () => CMPS.st === 3, CG);
  condLabel('untied h¹ copies → one weight set, two streams', CMPS.untied[2].o.position.clone().add(V(0, -2.6, 0)), 'lbl stage', () => CMPS.st === 4, CG);
  for (const u of CMPS.untied) { u.a = 0; u.s = 1; u.o.scale.setScalar(1); u.fill.material.opacity = 0; u.edge.material.opacity = 0; }
  CMPS.links.material.opacity = 0;
}
function lineSetPlain(pairs, color) { const pos = new Float32Array(pairs.length * 6); pairs.forEach(([a, b], i) => pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const l = new THREE.LineSegments(g, new THREE.LineDashedMaterial({ color, dashSize: .2, gapSize: .15, transparent: true, opacity: 0 })); l.computeLineDistances(); return l; }
function cmpShow(on) { CMPS.on = on; if (on) { cmpBuild(); cmpGo(0, true); } CG.visible = on; document.getElementById('cmpCount').hidden = !on; if (!on) card.classList.remove('cmpd'); requestRender(); }
function cmpTargets(st) {
  const G = CMPS.ghosts, T = new Map();
  for (const k of ['blk0', 'blk1', 'blk2']) T.set(G[k], st >= 1 ? [1, st >= 1 ? .15 : 1] : [G[k].big, 1]);
  T.set(G.head, st >= 2 ? [1, .15] : [G.head.big, 1]); T.set(G.proj, [1, st >= 1 ? .15 : .6]);
  for (const u of CMPS.untied) T.set(u, [1, st === 4 && performance.now() - CMPS.t0 < 1800 ? 1 : 0]);
  return T;
}
function cmpGo(st, instant = false) {
  if (!CMPS.ghosts) return; const was = CMPS.st; CMPS.st = st;
  if (st === 4) fly(V(5.5, 3.5, 21), V(4.2, -2.8, -3.5)); else if (was === 4) goHome();
  CMPS.t0 = performance.now(); CMPS.instant = instant || reduce;
  if (st === 4) for (const u of CMPS.untied) { u.a = 1; u.fill.material.opacity = .07; u.edge.material.opacity = .85; }
  const [n, t] = CMP_STATES[st], el = document.getElementById('cmpCount');
  el.querySelector('.t').textContent = t; CMPS.from = st === 4 ? 15113 : CMPS.shown; CMPS.to = n;
  CMPS.anim = true; cmpLabel(); requestRender();
}
function cmpLabel() { const e = document.getElementById('cmpState'); if (e) e.textContent = `step ${CMPS.st} of 4 · ${CMP_STATES[CMPS.st][1]}`;
  const b = document.getElementById('cmpNext'); if (b) b.disabled = CMPS.st >= 4; }
function cmpStep(dt) {
  if (!CMPS.anim) return;
  const k = CMPS.instant ? 1 : 1 - Math.exp(-dt * 4), T = cmpTargets(CMPS.st); let busy = false;
  for (const [g, [s, a]] of T) { const ns = g.s + (s - g.s) * k, na = g.a + (a - g.a) * k; if (Math.abs(ns - s) + Math.abs(na - a) > 1e-3) busy = true;
    g.s = Math.abs(ns - s) < 1e-3 ? s : ns; g.a = Math.abs(na - a) < 1e-3 ? a : na; g.o.scale.setScalar(g.s); g.fill.material.opacity = .07 * g.a; g.edge.material.opacity = .85 * g.a; }
  const la = CMPS.st === 4 && performance.now() - CMPS.t0 > 1200 ? .9 : 0; CMPS.links.material.opacity += (la - CMPS.links.material.opacity) * k; if (Math.abs(CMPS.links.material.opacity - la) > 1e-3) busy = true;
  const u = Math.min(1, (performance.now() - CMPS.t0) / (CMPS.instant ? 1 : 1100)), e = 1 - (1 - u) ** 3, v = Math.round(CMPS.from + (CMPS.to - CMPS.from) * e);
  CMPS.shown = v; document.querySelector('#cmpCount .n').textContent = v.toLocaleString('en'); if (u < 1) busy = true;
  if (CMPS.st === 4 && performance.now() - CMPS.t0 < 3500) busy = true;
  CMPS.anim = busy; requestRender();
}

const sideEl = document.getElementById('side'), barEl = document.getElementById('bar');
new ResizeObserver(() => { const h = `${barEl.offsetHeight}px`, st = document.documentElement.style; if (st.getPropertyValue('--bar-h') === h) return;
  st.setProperty('--bar-h', h); if (window.K8Phone && window.K8Phone.form()) onResize(); }).observe(barEl);
function setSide(collapsed) { sideEl.classList.toggle('collapsed', collapsed); const b = document.getElementById('sideCollapse'); b.setAttribute('aria-expanded', !collapsed);
  b.setAttribute('aria-label', collapsed ? 'Expand the side panel' : 'Collapse the side panel'); }
document.getElementById('sideCollapse').onclick = () => setSide(!sideEl.classList.contains('collapsed'));
sideEl.querySelectorAll('.sh').forEach(h => h.onclick = () => { const sec = h.parentElement, shut = !sec.classList.contains('shut'); sec.classList.toggle('shut', shut); h.setAttribute('aria-expanded', !shut); });
const tipEl = document.getElementById('tip'); let tipT = null, tipFor = null;
function showTip(el) { if (EMB()) return; const t = el.dataset.tip; if (!t || el.disabled && !el.dataset.tip) return; tipEl.textContent = t;
  if (el.dataset.kbd) { const k = document.createElement('kbd'); k.textContent = el.dataset.kbd; tipEl.appendChild(k); }
  tipEl.hidden = false; const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight, inSide = sideEl.contains(el);
  let x = inSide ? r.left - w - 8 : r.left + r.width / 2 - w / 2, y = inSide ? r.top + r.height / 2 - h / 2 : r.top - h - 8;
  if (y < 8) y = r.bottom + 8; if (x < 8) x = inSide ? r.right + 8 : 8;
  const v = viewport(); tipEl.style.left = `${Math.min(v.left + v.width - w - 8, x)}px`; tipEl.style.top = `${Math.min(v.top + v.height - h - 8, y)}px`; el.setAttribute('aria-describedby', 'tip'); tipFor = el; }
function hideTip() { clearTimeout(tipT); tipT = null; if (tipFor) tipFor.removeAttribute('aria-describedby'); tipFor = null; tipEl.hidden = true; }
document.addEventListener('pointerover', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (!el || el === tipFor) return; clearTimeout(tipT); tipT = setTimeout(() => showTip(el), 400); });
document.addEventListener('pointerout', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && !el.contains(e.relatedTarget)) hideTip(); });
document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && el.matches(':focus-visible')) showTip(el); });
document.addEventListener('focusout', hideTip);
insetEl.addEventListener('click', e => { if (e.detail !== 0) return;
  const a = e.target.closest && e.target.closest('[data-act]'); if (a) a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); });
const GRIDK = {};
const say = t => { if (!EMB()) document.getElementById('srLive').textContent = t; };
insetEl.addEventListener('keydown', e => {
  const t = e.target, d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
  if (t.dataset && t.dataset.hx !== undefined && d && d[0] === 0) { e.preventDefault(); e.stopPropagation();
    const n = +t.dataset.n, rev = t.dataset.rev === '1', off = +t.dataset.off || 0, cur = U.hov === null ? (rev ? 0 : n - 1) : (rev ? n - 1 - U.hov : U.hov - off);
    const i = Math.max(0, Math.min(n - 1, cur + d[1])); U.hov = rev ? n - 1 - i : i + off; drawInset(); applyHL(); poseHS0();
    say(`step ${U.hov}`); return; }
  if (t.dataset && t.dataset.grid && (d || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation();
    const g = t.dataset.grid, rows = +t.dataset.rows, cols = +t.dataset.cols, k = GRIDK[g] || (GRIDK[g] = [0, 0]);
    if (d) { k[0] = Math.max(0, Math.min(rows - 1, k[0] + d[0])); k[1] = Math.max(0, Math.min(cols - 1, k[1] + d[1])); }
    gridPick(g, k[0], k[1]); say(`row ${k[0] + 1} of ${rows}, column ${k[1] + 1} of ${cols}`);
    const again = insetEl.querySelector(`[data-grid="${g}"]`); if (again) again.focus(); }
});
renderer.domElement.tabIndex = EMB() ? -1 : 0; renderer.domElement.setAttribute('aria-label', '3D view: arrow keys orbit, + and − zoom');
renderer.domElement.addEventListener('keydown', e => {
  if (FLY.on || WEAR.on || EMB()) return; const k = e.key, rot = { ArrowLeft: [-.08, 0], ArrowRight: [.08, 0], ArrowUp: [0, -.06], ArrowDown: [0, .06] }[k];
  if (!rot && k !== '+' && k !== '=' && k !== '-') return; e.preventDefault(); e.stopPropagation(); camTween = null; gazeFollow = false;
  const off = camera.position.clone().sub(controls.target), sp = new THREE.Spherical().setFromVector3(off);
  if (rot) { sp.theta += rot[0]; sp.phi = Math.max(.05, Math.min(Math.PI - .05, sp.phi + rot[1])); } else sp.radius *= k === '-' ? 1.12 : 1 / 1.12;
  camera.position.copy(controls.target).add(off.setFromSpherical(sp)); controls.update(); requestRender();
});

const plc = new PointerLockControls(camera, renderer.domElement); plc.pointerSpeed = 0;
const LOOK = { yaw: 0, pitch: 0, ty: 0, tp: 0, sens: 1, tau: .14, e: new THREE.Euler(0, 0, 0, 'YXZ') };
try { const v = +localStorage.getItem('k8flySmooth'); if (v >= .02 && v <= .3) LOOK.tau = v; } catch {  }
try { const v = +localStorage.getItem('k8flySens'); if (v >= .2 && v <= 2.5) LOOK.sens = v; } catch {  }
document.addEventListener('mousemove', e => { if (!FLY.on || !plc.isLocked) return;
  const k = .002 * .35 * LOOK.sens; LOOK.ty -= e.movementX * k; LOOK.tp = Math.max(-1.5, Math.min(1.5, LOOK.tp - e.movementY * k)); requestRender(); });
const FLY = { on: false, keys: new Set(), v: new THREE.Vector3() };
const flyHint = document.getElementById('flyHint'), flyBtn = document.getElementById('flyBtn');
function setFly(on) {
  if (on === FLY.on) return;
  if (on && GUIDE.on()) { flyHint.hidden = false; flyHint.textContent = 'Fly mode is off during the guided tour: exit the tour (Esc) first.'; setTimeout(() => { if (!FLY.on) flyHint.hidden = true; }, 2600); return; }
  if (on && typeof renderer.domElement.requestPointerLock !== 'function') { flyHint.hidden = false; flyHint.textContent = 'Fly mode needs pointer lock, which this browser does not offer; orbit, zoom and pan still work.'; setTimeout(() => { if (!FLY.on) flyHint.hidden = true; }, 3200); return; }
  if (on && WEAR.on) setWear(false);
  FLY.on = on; if (on) setFog(null); FLY.keys.clear(); FLY.v.set(0, 0, 0); flyBtn.setAttribute('aria-pressed', on); flyBtn.innerHTML = `${svgI(on ? 'x' : 'plane')}<span class="bl">Fly</span>`; flyBtn.setAttribute('aria-label', on ? 'Leave fly mode' : 'Fly mode');
  if (on) { FLY.restore = { min: card.classList.contains('min'), side: sideEl.classList.contains('collapsed') }; setCardMin(true, false); setSide(true); }
  else if (FLY.restore) { setCardMin(FLY.restore.min, false); setSide(FLY.restore.side); FLY.restore = null; }
  if (on) { camTween = null; gazeFollow = false; controls.enabled = false; flyHint.innerHTML = FLY_HINT; flyHint.hidden = false;
    LOOK.e.setFromQuaternion(camera.quaternion, 'YXZ'); LOOK.yaw = LOOK.ty = LOOK.e.y; LOOK.pitch = LOOK.tp = LOOK.e.x;
    const sl = document.getElementById('flySens'); if (sl) { sl.value = String(LOOK.sens); sl.oninput = () => { LOOK.sens = +sl.value; try { localStorage.setItem('k8flySens', sl.value); } catch {  } }; sl.addEventListener('keydown', ev => ev.stopPropagation()); }
    const sm = document.getElementById('flySmooth'); if (sm) { sm.value = String(LOOK.tau); sm.oninput = () => { LOOK.tau = +sm.value; try { localStorage.setItem('k8flySmooth', sm.value); } catch {  } }; sm.addEventListener('keydown', ev => ev.stopPropagation()); } }
  else { if (plc.isLocked) plc.unlock(); controls.enabled = true; const d = V(0, 0, 0); camera.getWorldDirection(d);
    controls.target.copy(camera.position).addScaledVector(d, 4); controls.update(); flyHint.hidden = true; }
  requestRender();
}
const FLY_HINT = flyHint.innerHTML;
const FLY_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ControlLeft', 'ControlRight', 'KeyQ', 'ShiftLeft', 'ShiftRight']);
function flyKey(e, down) {
  if (e.metaKey || e.altKey) return false;
  if (down && ((e.key === 'f' || e.key === 'F') && !e.ctrlKey || e.key === 'Escape')) { setFly(false); return true; }
  if (FLY_CODES.has(e.code)) { if (down) FLY.keys.add(e.code); else FLY.keys.delete(e.code);
    e.preventDefault(); requestRender(); return true; }
  return down;
}
addEventListener('keyup', e => { if (FLY.on) flyKey(e, false); });
addEventListener('blur', () => { FLY.keys.clear(); FLY.v.set(0, 0, 0); });
function lockFailed(err) { if (!FLY.on) return;
  flyHint.hidden = false; flyHint.innerHTML = `${FLY_HINT}<div style="margin-top:4px;color:#ffcf6e">The browser did not lock the mouse${err && err.name ? ` (${err.name})` : ''}. Click the view again to look around (after Esc, wait a second); W A S D still move.</div>`; }
document.addEventListener('pointerlockerror', lockFailed);
renderer.domElement.addEventListener('click', () => { if (!FLY.on || plc.isLocked) return;
  try { const r = renderer.domElement.requestPointerLock(); if (r && typeof r.catch === 'function') r.catch(lockFailed); } catch { lockFailed(); } });
plc.addEventListener('unlock', () => { FLY.keys.clear(); FLY.v.set(0, 0, 0); requestRender(); });
flyBtn.onclick = () => setFly(!FLY.on);
function flyStep(dt) {
  dt = Math.min(dt, .1); const k = FLY.keys, has = c => k.has(c);
  const fw = (has('KeyW') ? 1 : 0) - (has('KeyS') ? 1 : 0), rt = (has('KeyD') ? 1 : 0) - (has('KeyA') ? 1 : 0);
  const up = (has('Space') ? 1 : 0) - (has('ControlLeft') || has('ControlRight') || has('KeyQ') ? 1 : 0), sp = 3.2 * (has('ShiftLeft') || has('ShiftRight') ? 3 : 1);
  const al = 1 - Math.exp(-dt / LOOK.tau), dy = LOOK.ty - LOOK.yaw, dp = LOOK.tp - LOOK.pitch;
  if (Math.abs(dy) + Math.abs(dp) > 1e-5) { LOOK.yaw += dy * al; LOOK.pitch += dp * al; LOOK.e.set(LOOK.pitch, LOOK.yaw, 0, 'YXZ'); camera.quaternion.setFromEuler(LOOK.e); requestRender(); }
  const a = 1 - Math.exp(-dt * (fw || rt || up ? 5 : 4));
  FLY.v.x += (rt * sp - FLY.v.x) * a; FLY.v.y += (up * sp - FLY.v.y) * a; FLY.v.z += (fw * sp - FLY.v.z) * a;
  if (FLY.v.lengthSq() < 1e-6) { FLY.v.set(0, 0, 0); return; }
  plc.moveRight(FLY.v.x * dt); plc.moveForward(FLY.v.z * dt); camera.position.y += FLY.v.y * dt; requestRender();
}
const WEAR = { on: false, off: new THREE.Euler(0, 0, 0, 'YXZ'), drag: null, q: new THREE.Quaternion(), oq: new THREE.Quaternion(), last: new THREE.Quaternion(), fov: 20, key: '' };
const WEAR_DOTS = () => [...predDots, ...truthDots, ...pastDots], WEAR_RINGS = [1, 2, 5, 10];
const WEAR_CONES = () => G.children.filter(o => o.isMesh && o.geometry.type === 'ConeGeometry');
const wearRing = (() => { const pts = []; for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; pts.push(V(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5)); }
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#c9a6ff', transparent: true, opacity: .8 })); l.visible = false; G.add(l); return l; })();
condLabel('up (world)', V(0, 1.42, 0), 'lbl wear', () => WEAR.on, G); condLabel('horizon (world level)', V(1.4, .04, 0), 'lbl wear', () => WEAR.on, G);
function setWear(on) {
  if (on === WEAR.on) return;
  if (on && (build < 0 || STEPS[build] !== 'gaze')) showBuild(STEPS.indexOf('gaze'));
  if (on) { if (GUIDE.on()) GUIDE.exit(); if (FLY.on) setFly(false); }
  WEAR.on = on; document.body.classList.toggle('wearing', on);
  headM.visible = !on; bustM.visible = !on; wearRing.visible = on;
  for (const m of WEAR_DOTS()) { if (m.userData.s0 === undefined) m.userData.s0 = m.scale.x; m.scale.setScalar(m.userData.s0); }
  document.getElementById('wearRings').toggleAttribute('hidden', !on); WEAR.key = '';
  document.getElementById('wearX').hidden = !on; document.getElementById('wearHud').hidden = !on;
  document.getElementById('wearBtn').textContent = on ? 'Take it off' : 'Wear it';
  if (on) { camTween = null; gazeFollow = false; controls.enabled = false; camera.fov = WEAR.fov; cardOffset(false); setPlay(!reduce); WEAR.off.set(0, 0, 0); }
  else { camera.fov = 40; controls.enabled = true; for (const m of [...WEAR_DOTS(), ...WEAR_CONES()]) if (m.userData.s0 !== undefined) m.scale.setScalar(m.userData.s0); cardOffset(card.classList.contains('show')); gazeFollow = true; }
  camera.updateProjectionMatrix(); if (D) update(); requestRender();
  if (on) wearTouchUI();
  TOUR.close(); if (on) TOUR.enter('wear');
}
function wearStep(dt) {
  if (!WEAR.drag) { const k = Math.exp(-dt * 6); WEAR.off.x *= k; WEAR.off.y *= k; if (Math.abs(WEAR.off.x) + Math.abs(WEAR.off.y) < 1e-4) WEAR.off.set(0, 0, 0); }
  headM.getWorldQuaternion(WEAR.q); WEAR.oq.setFromEuler(WEAR.off);
  camera.position.copy(G.position); camera.quaternion.copy(WEAR.q).multiply(WEAR.oq);
  const { width: VW, height: VH } = viewport();
  const k = 8 * 3 * Math.tan(camera.fov * Math.PI / 360) / (VH * .04);
  for (const m of WEAR_DOTS()) { const t = (m.userData.s0 || 1) * k; if (m.scale.x !== t) m.scale.setScalar(t); }
  const kc = 16 * 3 * Math.tan(camera.fov * Math.PI / 360) / (VH * .14);
  for (const m of WEAR_CONES()) { if (m.userData.s0 === undefined) m.userData.s0 = m.scale.x; if (m.scale.x !== kc) m.scale.setScalar(kc); }
  if (!camera.quaternion.equals(WEAR.last)) { WEAR.last.copy(camera.quaternion); requestRender(); }
  const P = V(0, 0, -1).applyQuaternion(WEAR.q).multiplyScalar(1.5).add(G.position).project(camera);
  const x = (P.x + 1) / 2 * VW, y = (1 - P.y) / 2 * VH, f = VH / 2 / Math.tan(camera.fov * Math.PI / 360);
  const key = `${x.toFixed(1)},${y.toFixed(1)},${camera.fov.toFixed(2)},${VW},${VH}`;
  if (key !== WEAR.key) {
    WEAR.key = key; const X = document.getElementById('wearX'); X.style.left = `${x}px`; X.style.top = `${y}px`;
    document.getElementById('wearRings').innerHTML = WEAR_RINGS.map(d => { const r = f * Math.tan(d * Math.PI / 180);
      return r > Math.hypot(VW, VH) ? '' : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/><text x="${(x + r * .707 + 3).toFixed(1)}" y="${(y - r * .707 - 3).toFixed(1)}">${d}°</text>`; }).join('');
    document.getElementById('wearFov').innerHTML = `field of view <b>${camera.fov.toFixed(0)}°</b> (${TOUCH() ? '− / + ' : 'scroll '}to zoom, 8–90°)`;
  }
}
const wearZoom = k => { WEAR.fov = Math.max(8, Math.min(90, WEAR.fov * k)); camera.fov = WEAR.fov; camera.updateProjectionMatrix(); requestRender(); };
renderer.domElement.addEventListener('wheel', e => { if (!WEAR.on) return; e.preventDefault(); wearZoom(Math.exp(e.deltaY * .0015)); }, { passive: false });
const TOUCH = () => document.documentElement.classList.contains('touch');
const WEAR_LEGEND = document.querySelector('#wearHud .m:not([id])'), WEAR_LEGEND0 = WEAR_LEGEND ? WEAR_LEGEND.innerHTML : '';
function wearTouchUI() {
  const t = TOUCH(), ex = document.getElementById('wearExit'); let row = document.getElementById('wearTouch');
  if (t && !row) {
    row = document.createElement('span'); row.id = 'wearTouch';
    row.innerHTML = `<button type="button" id="wearOut" class="b-icon" aria-label="Zoom out (wider view)">${svgI('minus')}</button>`
      + '<button type="button" id="wearIn" class="b-icon" aria-label="Zoom in (narrower view)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg></button>'
      + `<button type="button" id="wearPlay" class="b-icon"></button>`;
    ex.parentElement.prepend(row);
    row.querySelector('#wearOut').onclick = () => wearZoom(1.25); row.querySelector('#wearIn').onclick = () => wearZoom(1 / 1.25);
    row.querySelector('#wearPlay').onclick = () => { setPlay(!playing); requestRender(); };
  }
  if (row) row.hidden = !t;
  setPlay(playing);
  ex.textContent = t ? 'Take it off' : 'Take it off (Esc)';
  if (WEAR_LEGEND) WEAR_LEGEND.innerHTML = t ? WEAR_LEGEND0.replace('scroll to zoom', '− / + to zoom') : WEAR_LEGEND0;
  WEAR.key = '';
}
renderer.domElement.addEventListener('pointerdown', e => { if (WEAR.on) WEAR.drag = { x: e.clientX, y: e.clientY, ox: WEAR.off.x, oy: WEAR.off.y }; });
addEventListener('pointermove', e => { if (!WEAR.on || !WEAR.drag) return; const d = WEAR.drag;
  WEAR.off.y = Math.max(-.45, Math.min(.45, d.oy - (e.clientX - d.x) * .004)); WEAR.off.x = Math.max(-.35, Math.min(.35, d.ox - (e.clientY - d.y) * .004)); requestRender(); });
addEventListener('pointerup', () => { WEAR.drag = null; });
document.getElementById('wearBtn').onclick = () => setWear(!WEAR.on);
document.getElementById('wearExit').onclick = () => setWear(false);

const EMB_SHOT = {
  input:  null,
  feat:   { at: 'feat.fork' },
  mirror: { at: 'feat.flip', pr: { dir: [.55, .2, 1], dist: 6, ty: 0 } },
  blk0:   { at: 'blk0.skip' },
  reach:  null,
  head:   { at: 'head.grid' },
  traj:   { at: 'traj.r' },
  out:    { at: 'out.scored' },
};
const EMB_SWAP_HOLD = 2200;
function embedShot(view) {
  const s = EMB_SHOT[view], now = performance.now();
  if (s) { const v = guideView(s.at, s.pr || window.K8GUIDE.PRESETS[s.at]); if (v) { fly(v.p, v.t, v.fog); buildView = { p: v.p.clone(), t: v.t.clone(), fog: v.fog }; } }
  const land = camTween ? camTween.dur : 0;
  if (view === 'head') { U.htab = 'basis'; drawInset(); }
  if (view === 'mirror') EMBT = { at: now + land + 300, fn: embSwap };
  if (view === 'blk0') EMBT = { at: now + land + 200, fn: () => oneCall() };
  if (view === 'reach' && GROW) GROW.t0 = now + land;
  requestRender();
}
function embSwap(now) {
  if (build < 0 || STEPS[build] !== 'mirror') return;
  setSwap(!swapped); EMBT = { at: now + 1000 + EMB_SWAP_HOLD, fn: embSwap };
}
function embCallAgain(now) { if (build >= 0 && STEPS[build] === 'blk0') EMBT = { at: now + 600, fn: () => oneCall() }; }
function embedLeave() { EMBT = null; GROUPS.input.position.set(0, 0, 0); }
const _up = new THREE.Vector3();
function arrive(lead) {
  const g = GROUPS.input; if (!EMB() || !g) return;
  const l = build === 0 ? Math.max(0, Math.min(1, +lead || 0)) : 0, k = l * l * (3 - 2 * l);
  const h = 2 * camera.position.distanceTo(controls.target) * Math.tan(camera.fov * Math.PI / 360);
  _up.set(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(k * h * 1.1);
  if (g.position.x !== _up.z || g.position.y !== _up.x || g.position.z !== _up.y) { g.position.set(_up.z, _up.x, _up.y); requestRender(); }
}
setPlay(playing);
if (EMB() && EMB().view) { showStep(EMB().view, true); if (camTween) stepTween(camTween.s + camTween.dur); } else showBuild(0);

const TIER_P = { full: { dpr: 1.5, glow: true, haze: true, small: true, sheets: false, rate: 8 },
                 light: { dpr: 1, glow: false, haze: false, small: true, sheets: false, rate: 8 },
                 min: { dpr: .75, glow: false, haze: false, small: false, sheets: true, rate: 4 } };
const dprCap = () => EMB() ? 2 : BOOT.phone && TIER !== 'min' ? 2 : TP.dpr;
let TIER = null, TP = TIER_P.full, tierMode = BOOT.tierMode, speedTouched = false, tierHold = 0;
const HISTW = [SL.input, SL.feat, SL.proj, ...BL.map(B => B.out)];
ray.layers.enable(1);
function wallSheet(M) {
  const g = M.userData.grid, R = g.rows * g.sheets, pos = [], uv = [], ind = [];
  const pitch = g.rows > 1 ? g.zf(0, 1) - g.zf(0, 0) : ZP;
  for (let s = 0; s < g.sheets; s++) { const p = g.rows > 1 ? g.zf(s, 1) - g.zf(s, 0) : ZP, zA = g.zf(s, 0) - p / 2, zB = g.zf(s, g.rows - 1) + p / 2,
      xA = g.x0 - g.dx / 2, xB = g.x0 + (g.cols - .5) * g.dx, v0 = s * g.rows / R, v1 = (s + 1) * g.rows / R, yA = g.y - g.h / 2, yB = g.y + g.h / 2, xN = g.x0 - g.dx * .41, uN = .5 / g.cols;
    for (const q of [[xA, yA, zA, xB, yA, zA, xB, yA, zB, xA, yA, zB, 0, 1], [xA, yB, zA, xB, yB, zA, xB, yB, zB, xA, yB, zB, 0, 1], [xN, yA, zA, xN, yB, zA, xN, yB, zB, xN, yA, zB, uN, uN]]) {
      const k = pos.length / 3; pos.push(...q.slice(0, 12)); uv.push(q[12], v0, q[13], v0, q[13], v1, q[12], v1); ind.push(k, k + 1, k + 2, k, k + 2, k + 3); } }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(ind);
  const tex = new THREE.DataTexture(new Float32Array(g.cols * R * 4), g.cols, R, THREE.RGBAFormat, THREE.FloatType);
  const mat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, clipping: true, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), map: { value: tex }, tint: { value: new THREE.Color(1, 1, 1) }, grid: { value: new THREE.Vector2(g.cols, R) }, fill: { value: new THREE.Vector2(.82, ZP * .8 / Math.abs(pitch)) } },
    vertexShader: `varying vec2 vUv;
      #include <fog_pars_vertex>
      #include <clipping_planes_pars_vertex>
      void main() { vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 tint; uniform vec2 grid; uniform vec2 fill; varying vec2 vUv;
      #include <fog_pars_fragment>
      #include <clipping_planes_pars_fragment>
      void main() {
        #include <clipping_planes_fragment>
        vec2 c = vUv * grid, f = abs(fract(c) - .5) * 2., w = fwidth(c);
        if (max(w.x, w.y) < .35 && (f.x > fill.x || f.y > fill.y)) discard;
        gl_FragColor = vec4(texture2D(map, (floor(c) + .5) / grid).rgb * tint, 1.);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }` });
  const sh = new THREE.Mesh(geo, mat); sh.userData.noFrame = true; sh.userData.upd = -1; sh.visible = false; M.parent.add(sh); return sh;
}
function syncSheets() {
  for (const M of HISTW) { const sh = M.userData.sheet; if (!sh) continue; sh.visible = M.visible;
    sh.material.uniforms.tint.value.copy(M.material.color); sh.geometry.setDrawRange(0, ONE && M.userData.grid.sheets === 2 ? 18 : Infinity);
    if (sh.userData.upd !== M.userData.upd || sh.userData.gen !== HGEN) { sh.userData.upd = M.userData.upd; sh.userData.gen = HGEN;
      const src = M.instanceColor.array, tex = sh.material.uniforms.map.value, dst = tex.image.data;
      for (let i = 0, j = 0; i < src.length; i += 3, j += 4) { dst[j] = src[i]; dst[j + 1] = src[i + 1]; dst[j + 2] = src[i + 2]; }
      tex.needsUpdate = true; } }
}
function setTier(t, note) {
  TIER = t; TP = TIER_P[t]; document.body.dataset.tier = t; tierHold = performance.now() + 2000;
  if (!speedTouched) { speed.value = TP.rate; document.getElementById('speedv').textContent = TP.rate; }
  for (const M of HISTW) { if (TP.sheets && !M.userData.sheet) M.userData.sheet = wallSheet(M); if (M.userData.sheet) M.userData.sheet.visible = TP.sheets && M.visible; M.layers.set(TP.sheets ? 1 : 0); }
  if (TP.haze) { const on = document.getElementById('tLines').checked; BL.forEach(B => { B.selfLines.visible = B.crossLines.visible = on; }); }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, dprCap())); renderer.setSize(viewport().width, viewport().height);
  const now = document.getElementById('tierNow'); if (now) now.textContent = tierMode === 'auto' ? `now: ${t === 'min' ? 'minimal' : t}` : '';
  if (note) tierNote(note);
  window.dispatchEvent(new CustomEvent('k8:tier', { detail: { tier: t } })); requestRender();
}
function tierNote(html, keep) {
  if (EMB()) return;
  let el = document.getElementById('tierNote');
  if (!el) { el = document.createElement('div'); el.id = 'tierNote'; el.className = 'hud'; el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;top:52px;transform:translateX(-50%);z-index:30;max-width:min(560px,90vw);padding:8px 12px;border-radius:8px;font-size:13px;pointer-events:auto'; document.body.appendChild(el); }
  el.innerHTML = html + ' <button class="b-ghost" style="margin-left:6px">OK</button>'; el.hidden = false; el.querySelector('button').onclick = () => { el.hidden = true; };
  clearTimeout(tierNote.t); if (!keep) tierNote.t = setTimeout(() => { el.hidden = true; }, 9000);
}
const FT = []; let liteOffered = false;
function tierWatch(gapMs, now) {
  if (tierMode !== 'auto' || now < tierHold || EMB()) { FT.length = 0; return; }
  FT.push(gapMs); if (FT.length < 2) return;
  const med = FT.slice().sort((a, b) => a - b)[FT.length >> 1], crawl = FT.slice(-2).every(g => g > 400);
  if (FT.length < 24 && !crawl) return;
  FT.length = 0;
  if (med <= 40 && !crawl) return;
  const next = TIER === 'min' ? null : crawl || TIER === 'light' ? 'min' : 'light';
  if (next) { try { sessionStorage.setItem('k8tierAuto', next); } catch {  }
    setTier(next, `The 3D view was slow on this computer (about ${Math.round(med)} ms a frame), so graphics quality is now <b>${next === 'min' ? 'minimal' : 'light'}</b>. The data shown is the same; only how it is drawn changes. Change it under View options (⋯).`); }
  else if ((med > 250 || crawl) && !liteOffered) { liteOffered = true; const u = new URL(location.href); u.searchParams.set('lite', '1');
    tierNote(`The 3D view is still slow on this computer at minimal quality (about ${Math.round(med)} ms a frame). <a href="${u.href}" style="color:var(--blue)">Open the picture version</a>: the same steps and text, with one picture per step.`, true); }
}
speed.addEventListener('input', () => { speedTouched = true; });
{ const lab = document.createElement('label'); lab.innerHTML = 'Graphics <select id="tierSel" aria-label="Graphics quality"><option value="auto">Auto</option><option value="full">Full</option><option value="light">Light</option><option value="min">Minimal</option></select><span class="val" id="tierNow"></span>';
  speed.closest('label').after(lab); const sel = lab.querySelector('select'); sel.value = tierMode === 'auto' ? 'auto' : BOOT.tier;
  sel.onchange = () => { tierMode = sel.value === 'auto' ? 'auto' : 'manual';
    try { if (tierMode === 'auto') { localStorage.removeItem('k8tier'); sessionStorage.removeItem('k8tierAuto'); } else localStorage.setItem('k8tier', sel.value); } catch {  }
    setTier(tierMode === 'auto' ? (BOOT.phone ? 'light' : 'full') : sel.value); }; }
setTier(BOOT.tier);

function onResize() { const { width: VW, height: VH } = viewport();
  requestRender(); camera.aspect = VW / VH; cardOffset(card.classList.contains('show')); camera.updateProjectionMatrix(); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, dprCap())); renderer.setSize(VW, VH); labelR.setSize(VW, VH); 
  if (GUIDE.on() && GUIDE.reframe) GUIDE.reframe(); else if (atHome && !FLY.on && !WEAR.on) goHome(!(EMB() && camTween)); else if (atStep && !EMB() && !FLY.on && !WEAR.on) refitStep(); }
addEventListener('resize', onResize);
(function watchDpr() { const mq = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`); const f = () => { mq.removeEventListener('change', f); onResize(); watchDpr(); }; mq.addEventListener('change', f); })();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { requestRender(); if (GUIDE.on() && GUIDE.reframe) GUIDE.reframe(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && !EMB()) setPlay(false); });
const _wp = new THREE.Vector3(); let last = performance.now();
const wakeAny = () => { if (!EMB()) requestRender(); };
for (const ev of ['pointerdown', 'pointerup', 'click', 'keydown', 'input', 'change', 'wheel']) addEventListener(ev, wakeAny, { capture: true, passive: true });
const animating = () => !!camTween || CMPS.anim ||
   PULSES.length > 0 || !!CALL || !!GROW || !!SWAP || ((HLM.length > 0 || GLM.length > 0) && !reduce && TP.glow);
const RSTAT = { total: 0, perSec: 0, n: 0, t: performance.now() }, RLOG = /[?&]renderlog\b/.test(location.search);
let loopOn = false, quietT = 0;
const loopBlocked = () => document.hidden || document.body.dataset.side === 'data' || (!!EMB() && !EMB_ACTIVE);
let loopRaf = 0;
const loopSleep = () => { loopOn = false; cancelAnimationFrame(loopRaf); };
const loopFrame = now => { if (!loopOn) return; loopRaf = requestAnimationFrame(loopFrame); loopTick(now); };
wakeLoop = () => { if (loopOn || loopBlocked()) return; loopOn = true; prevDrew = false; last = quietT = performance.now(); loopRaf = requestAnimationFrame(loopFrame); };
addEventListener('pointermove', () => { if (!EMB()) wakeLoop(); }, { capture: true, passive: true });
controls.addEventListener('change', requestRender);
document.addEventListener('visibilitychange', () => { if (document.hidden) loopSleep(); else requestRender(); });
addEventListener('k8:side', () => { if (loopBlocked()) loopSleep(); else { onResize(); requestRender(); } });
let prevDrew = false, burst = -1;
const loopTick = now => {
  if (prevDrew) { tierWatch(now - last, now); embedRateWatch(now - last); }
  prevDrew = false;
  if (burst < 0 && D) { const ld = document.getElementById('k8load'); if (ld) ld.remove(); }
  if (burst < 0 && D) burst = tierMode === 'auto' && !EMB() ? 30 : 0;
  if (burst > 0) { burst--; needsRender = true; }
  const dt = (now - last) / 1000; last = now;
  if (playing || needsRender || animating() || !!EMBT || FLY.on || WEAR.on || CMPS.on || GUIDE.on() || TOUR.isOpen() || (PICK && now - PICK.t0 < 1800)) quietT = now; else if (now - quietT > 1500) return loopSleep();
  const wasAnim = animating();
  if (playing && D) { acc += dt * rate(); if (acc >= 1) { const n = Math.floor(acc); acc -= n; idx = idx + n >= D.frames.length ? D.firstShown : idx + n; update(); } }
  if (camTween) stepTween(now);
  stepPulses(now); stepCall(now); stepSwap(now); stepGrow(now); stepGaze(dt);
  if (EMBT && now >= EMBT.at) { const f = EMBT.fn; EMBT = null; f(now); }
  const hs = build === 0 && !solo; if (HS0.visible !== hs) { HS0.visible = hs; requestRender(); }
  if (PICK && !reduce && now - PICK.t0 < 1800 && U.btab === 'ch') drawInset();
  if (FLY.on) flyStep(dt); if (WEAR.on) wearStep(dt); if (CMPS.on) cmpStep(dt);
  if (!FLY.on && !WEAR.on && controls.update()) requestRender();
  if (needsRender || wasAnim || animating()) {
    if (!TP.haze) { const on = document.getElementById('tLines').checked; BL.forEach((B, b) => {
      B.selfLines.visible = B.crossLines.visible = on && (focused === 'blk' + b || (build >= 0 && STEPS[build] === 'blk' + b) || (!!GMIX && GMIX.b === b)); }); }
    if (D && anyStale()) update();
    if (TP.sheets) syncSheets();
    needsRender = false; prevDrew = true;
    const gl = reduce || !TP.glow ? .32 : .26 + .14 * Math.sin(now / 240); HLM.forEach(m => { m.material.opacity = gl; }); GLM.forEach(m => { m.material.opacity = gl * (m.userData.k || 1); });
    for (const L of allLabels) { if (L.o.userData.gHide || L.o.userData.soloHide || labelClipped(L)) { L.o.visible = false; continue; }
      const vis = L.grp.visible !== false && (!solo || L.grp === GROUPS[solo] || L.grp === CL);
      if (L.cond) L.o.visible = vis && !!L.cond();
      else if (L.tap) L.o.visible = vis && build >= 0 && focused && GROUPS[focused] === L.grp;
      else if (L.layer) L.o.visible = vis && /^(proj|blk\d)$/.test(focused || '');
      else if (L.small && stepHas(L.grp)) L.o.visible = vis;
      else if (L.small && !TP.small) L.o.visible = false;
      else if (L.small) { L.o.getWorldPosition(_wp); L.o.visible = vis && _wp.distanceTo(camera.position) < 9; } else L.o.visible = vis; }
    renderer.render(scene, camera); labelR.render(scene, camera); RSTAT.total++; RSTAT.n++; tourDirty = true;
    if (!readyDone && D) { readyDone = true; readyOk(); }
  }
  if (now - RSTAT.t >= 1000) { RSTAT.perSec = Math.round(RSTAT.n * 1000 / (now - RSTAT.t)); RSTAT.n = 0; RSTAT.t = now; if (RLOG) console.log(`[k8] renders/s ${RSTAT.perSec} (total ${RSTAT.total})`); }
  GUIDE.tick(now);
  if (tourDirty || TOUR.settling() || now - tourT > 250) { TOUR.frame(); tourDirty = false; tourT = now; occludeLabels(); }
};
wakeLoop();
function occludeLabels() {
  const rs = ['card', 'side', 'tour', 'guideHud', 'tourEdge', 'menu', ...(window.K8Phone && window.K8Phone.form() ? ['brand', 'sheetTabs'] : [])].map(
id => document.getElementById(id)).filter(e => e && !e.hidden && e.getClientRects().length).map(e => e.getBoundingClientRect()).filter(r => r.width);
  for (const L of allLabels) { const el = L.o.element; if (!L.o.visible || el.style.display === 'none') { if (el.classList.contains('occl')) el.classList.remove('occl'); continue; }
    const r = el.getBoundingClientRect(), hit = rs.some(R => r.right > R.left && r.left < R.right && r.bottom > R.top && r.top < R.bottom);
    if (hit !== el.classList.contains('occl')) el.classList.toggle('occl', hit); L.r = hit ? null : r; }
  const kept = [], rank = L => L.other ? 0 : L.small ? 1 : 3;
  for (const L of allLabels.filter(L => L.o.visible && L.r && L.r.width && !L.o.element.classList.contains('far')).sort((a, b) => rank(b) - rank(a))) {
    const r = L.r, hit = kept.some(R => r.right > R.left - 6 && r.left < R.right + 6 && r.bottom > R.top - 2 && r.top < R.bottom + 2);
    const pill = rank(L) === 3 && !(window.K8Phone && window.K8Phone.form());
    if ((hit && !pill) !== L.o.element.classList.contains('clash')) L.o.element.classList.toggle('clash', hit && !pill); if (!hit || pill) kept.push(r); }
  for (const L of allLabels) if (!(L.o.visible && L.r) && L.o.element.classList.contains('clash')) L.o.element.classList.remove('clash');
}
function fingerprint(i) {
  setPlay(false); if (D && i !== null) { idx = Math.max(D.firstShown, Math.min(D.frames.length - 1, i)); update(); }
  const out = []; let n = 0;
  scene.traverseVisible(o => { const a = o.isInstancedMesh && o.instanceColor ? o.instanceColor.array : (o.isLineSegments || o.isLine) && o.geometry.attributes.color ? o.geometry.attributes.color.array : null;
    if (!a) return; const u = new Uint32Array(a.buffer, a.byteOffset, a.length); let h = 2166136261; for (let k = 0; k < u.length; k++) { h ^= u[k]; h = Math.imul(h, 16777619) >>> 0; }
    out.push(`${n++}:${a.length}:${h.toString(16)}`); });
  return out.join(' ');
}
const insetCheck = () => { const t = document.createElement('template'); t.innerHTML = insetHTML; return t.innerHTML === insetEl.innerHTML.replace(/ class="gHL"/g, ''); };
window.__k8 = { homeView, camera, controls, GROUPS, select, tourCheck, guideCheck, fingerprint, insetCheck, idx: () => idx, showBuild: i => showBuild(i), guide: GUIDE, renderStats: () => ({ total: RSTAT.total, perSec: RSTAT.perSec, idle: !needsRender && !animating(), asleep: !loopOn }),
  headQuat: () => [headM.quaternion.x, headM.quaternion.y, headM.quaternion.z, headM.quaternion.w] };

function showStep(view, force = false) {
  if (!force && view === step()) return;
  if (EMB()) embedLeave();
  if (view === 'whole') return home();
  const i = STEPS.indexOf(view); if (i < 0) throw new Error(`K8Viewer.showStep: unknown view "${view}"`);
  showBuild(i);
  if (EMB()) embedShot(view);
}

function step() { return build < 0 ? 'whole' : STEPS[build]; }

const STORY_RETURN = 'k8StoryReturn';
let entered = false;
function enter() {
  if (entered || !EMB()) return false;
  entered = true;
  embedLeave(); EMB_ACTIVE = true; window.K8_EMBED = null;
  scene.background = new THREE.Color('#000'); renderer.setClearColor(0x000000, 1); scene.fog.color.set('#000'); floor.layers.set(0);
  placeDom();
  document.documentElement.classList.remove('story');
  if (window.K8Phone) window.K8Phone.apply();
  window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
  tierHold = performance.now() + 2000;
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  onResize();
  camera.position.copy(p0); controls.target.copy(t0);
  showStep(step(), true);
  try { const u = new URL(location.href); u.searchParams.set('explore', '1'); u.hash = ''; history.pushState({ k8: 'entered' }, '', u); } catch {  }
  addEventListener('popstate', toStory);
  const row = barEl.querySelector('.row') || barEl, grp = document.createElement('div');
  grp.className = 'grp g-story';
  const css = document.createElement('style');
  css.textContent = '@media (max-width: 1359px) { #bar .g-story .bl { display:none; } #bar .g-story button { width:var(--tap); padding:0; justify-content:center; } }';
  document.head.appendChild(css);
  grp.innerHTML = '<button id="storyBack" type="button" aria-label="Back to the story" data-tip="Back to the story, where you left it"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg><span class="bl">Back to the story</span></button>';
  row.prepend(grp);
  grp.firstChild.addEventListener('click', () => history.back());
  grp.firstChild.focus();
  say('The 3D model. Back to the story is the first control of the toolbar.');
  requestRender();
  return true;
}
function toStory() {
  if (new URLSearchParams(location.search).get('explore') === '1') return;
  try { sessionStorage.setItem(STORY_RETURN, '1'); } catch {  }
  const u = new URL(location.href); u.searchParams.delete('explore'); u.searchParams.delete('side'); u.hash = 's-explore';
  history.replaceState(null, '', u); history.scrollRestoration = 'manual'; location.reload();
}

window.K8Viewer = {
  ready: READY,
  showStep: view => showStep(view), step,
  setActive(on) { EMB_ACTIVE = !!on; if (loopBlocked()) loopSleep(); else requestRender(); },
  setPlaying(on) { setPlay(!!on); requestRender(); },
  playing: () => playing,
  speed: () => rate(),
  sample: () => idx,
  resize: () => onResize(),
  reframe() { if (!EMB()) return; cardOffset(false); if (GUIDE.on() && GUIDE.reframe) GUIDE.reframe(); else if (atHome && !FLY.on && !WEAR.on) goHome(!camTween); requestRender(); },
  enter: () => enter(),
  inset: () => insetEl,
  math: view => (((window.EXPERT || {})[view] || {}).math || []).slice(),
  arrive: lead => arrive(lead),
};
