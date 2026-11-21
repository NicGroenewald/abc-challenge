
const SEED = 42;
const N_ALL = 1000, N_RATE = 404, N_MOVE = 19;
const COLS = 50, ROWS = 20;
const SPLIT = [5243, 786, 1049];
const HISTORY = 400, AHEAD = 20;
const RIBBON_FROM = 0.8, RIBBON_LEN = 5.0;
const ROW_GAP = 0.3, ROW_AMP = 0.11;
const SHEET_F = [-16, -13, -10.8, -8.8];
const SHEET_W = 6, SHEET_H = 2.4;
const INK = 0xeaeaea, GREY = 0x8a8a8a, DIM = 0x2e2e2e, AMBER = 0xf0b24a;

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pick(rand, from, n) { const a = from.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a.slice(0, n).sort((x, y) => x - y); }
const ramp = (v, a, b) => (v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a));
const ease = t => t * t * (3 - 2 * t);

export function createTaskScene({ THREE, clip, origin, U, F, R, side, accent, labelsEl }) {
  const UP = new THREE.Vector3(0, 1, 0), group = new THREE.Group(); group.name = 'task-scene';
  const P = (f, u, r, out = new THREE.Vector3()) => out.copy(origin).addScaledVector(F, f * U).addScaledVector(UP, u * U).addScaledVector(R, r * U * side);
  const disposables = [];
  const keep = o => { disposables.push(o); return o; };
  const lineMat = (color, opacity = 1) => keep(new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));

  const lo = [1, 1, 1, 1].map(() => Infinity), hi = lo.map(() => -Infinity);
  for (const q of clip.q) for (let c = 0; c < 4; c++) { if (q[c] < lo[c]) lo[c] = q[c]; if (q[c] > hi[c]) hi[c] = q[c]; }
  const val = (q, c) => ((q[c] - lo[c]) / ((hi[c] - lo[c]) || 1) - 0.5) * 2;
  const rowU = c => (1.5 - c) * ROW_GAP;
  const past = [];
  const pastMat = lineMat(INK, 0);
  for (let c = 0; c < 4; c++) {
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(HISTORY * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const l = new THREE.Line(g, pastMat); l.frustumCulled = false; past.push(l); group.add(l);
  }
  const dotTex = keep(new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.beginPath(); x.arc(32, 32, 28, 0, Math.PI * 2); x.fill(); return c; })()));
  const pointsMat = size => keep(new THREE.PointsMaterial({ size: size * U, map: dotTex, transparent: true, alphaTest: 0.35, depthWrite: false, sizeAttenuation: true, vertexColors: true }));
  const endGeo = keep(new THREE.BufferGeometry()); endGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  endGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
  { const col = endGeo.attributes.color, a = new THREE.Color(AMBER), b = new THREE.Color(accent); for (let c = 0; c < 4; c++) { col.setXYZ(c, a.r, a.g, a.b); col.setXYZ(4 + c, b.r, b.g, b.b); col.setXYZ(8 + c, b.r, b.g, b.b); } }
  const endMat = pointsMat(0.05); endMat.opacity = 0;
  const ends = new THREE.Points(endGeo, endMat); ends.frustumCulled = false; group.add(ends);

  const v = new THREE.Vector3();
  function tracePoint(k, x, c, out) { return P(-(RIBBON_FROM + (k / (HISTORY - 1)) * RIBBON_LEN), rowU(c) + x * ROW_AMP, 0, out); }
  const HIDE = 1e6;
  let lastI = -1;
  function update(frac) {
    const i = Math.floor(frac);
    if (i === lastI) return; lastI = i;
    const n = Math.min(HISTORY, i + 1);
    const e = endGeo.attributes.position;
    for (let c = 0; c < 4; c++) {
      const a = past[c].geometry.attributes.position;
      for (let k = 0; k < n; k++) { tracePoint(k, val(clip.q[i - k], c), c, v); a.setXYZ(k, v.x, v.y, v.z); }
      past[c].geometry.setDrawRange(0, n); a.needsUpdate = true;
      tracePoint(0, val(clip.q[i], c), c, v); e.setXYZ(c, v.x, v.y, v.z);
      if (i >= AHEAD) { tracePoint(0, val(clip.pred[i - AHEAD], c), c, v); e.setXYZ(4 + c, v.x, v.y, v.z); } else e.setXYZ(4 + c, HIDE, HIDE, HIDE);
      tracePoint(-AHEAD, val(clip.pred[i], c), c, v); e.setXYZ(8 + c, v.x, v.y, v.z);
    }
    e.needsUpdate = true;
  }

  const data = new THREE.Group(); data.name = 'task-dataset'; group.add(data);
  const sheetPoint = (sheet, x, y, out = new THREE.Vector3()) => P(SHEET_F[sheet], y, x, out);
  const rand = rng(SEED);
  const all = Array.from({ length: N_ALL }, (_, i) => i), keptRate = pick(rand, all, N_RATE), keptMove = pick(rand, keptRate, N_MOVE);
  const inRate = new Set(keptRate), inMove = new Set(keptMove);
  const gx = SHEET_W / COLS, gy = SHEET_H / ROWS;
  const p1 = i => [(i % COLS - (COLS - 1) / 2) * gx, ((ROWS - 1) / 2 - Math.floor(i / COLS)) * gy];
  const C2 = 26, R2 = Math.ceil(N_RATE / C2);
  const p2 = j => [(j % C2 - (C2 - 1) / 2) * gx, ((R2 - 1) / 2 - Math.floor(j / C2)) * gy];
  const p3 = j => [0, ((N_MOVE - 1) / 2 - j) * gy];
  const dots = (count, at, sheet) => {
    const g = keep(new THREE.BufferGeometry()), pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { const [x, y] = at(i); sheetPoint(sheet, x, y, v); pos.set([v.x, v.y, v.z], i * 3); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    const m = pointsMat(0.062); const o = new THREE.Points(g, m); o.frustumCulled = false; data.add(o); return o;
  };
  const d1 = dots(N_ALL, p1, 0), d2 = dots(N_RATE, p2, 1), d3 = dots(N_MOVE, p3, 2);
  const links = (pairs, color) => {
    const g = keep(new THREE.BufferGeometry()), pos = new Float32Array(pairs.length * 6);
    pairs.forEach(([a, b], i) => pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6));
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const o = new THREE.LineSegments(g, lineMat(color, 0)); o.frustumCulled = false; data.add(o); return o;
  };
  const l12 = links(keptRate.map((i, j) => [sheetPoint(0, ...p1(i)), sheetPoint(1, ...p2(j))]), GREY);
  const l23 = links(keptMove.map((i, j) => [sheetPoint(1, ...p2(keptRate.indexOf(i))), sheetPoint(2, ...p3(j))]), accent);
  const total = SPLIT[0] + SPLIT[1] + SPLIT[2], SW = 5, SH = 1.1, GAPX = 0.12;
  const groups = [], groupMid = []; let x0 = -SW / 2;
  SPLIT.forEach((n, k) => {
    const w = (SW - 2 * GAPX) * n / total, a = x0, b = x0 + w; x0 = b + GAPX;
    const g = keep(new THREE.BufferGeometry().setFromPoints([sheetPoint(3, a, SH / 2), sheetPoint(3, b, SH / 2), sheetPoint(3, b, -SH / 2), sheetPoint(3, a, -SH / 2)]));
    const o = new THREE.LineLoop(g, lineMat(k === 0 ? accent : INK, 0)); o.frustumCulled = false; data.add(o); groups.push(o); groupMid.push([(a + b) / 2, a, b]);
  });
  const l3s = links([[sheetPoint(2, 0, -((N_MOVE - 1) / 2) * gy - 0.15), sheetPoint(3, 0, SH / 2)]], GREY);
  const loneJ = Math.floor(N_MOVE / 2), loneI = keptMove[loneJ];
  const lone = links([[sheetPoint(0, ...p1(loneI)), sheetPoint(1, ...p2(keptRate.indexOf(loneI)))], [sheetPoint(1, ...p2(keptRate.indexOf(loneI))), sheetPoint(2, ...p3(loneJ))]], INK);
  const lwin = links([[sheetPoint(3, groupMid[0][0], -SH / 2), P(-(RIBBON_FROM + RIBBON_LEN), 0, 0)]], accent);
  const frames = [0, 1, 2].map(sh => { const w = SHEET_W / 2 + 0.25, h = SHEET_H / 2 + 0.25;
    const g = keep(new THREE.BufferGeometry().setFromPoints([sheetPoint(sh, -w, h), sheetPoint(sh, w, h), sheetPoint(sh, w, -h), sheetPoint(sh, -w, -h)]));
    const o = new THREE.LineLoop(g, lineMat(INK, 0)); o.frustumCulled = false; data.add(o); return o; });

  const cInk = new THREE.Color(INK), cDim = new THREE.Color(DIM), cAcc = new THREE.Color(accent), cTmp = new THREE.Color();
  function paint(obj, count, level) {
    const col = obj.geometry.attributes.color;
    for (let i = 0; i < count; i++) { const l = level(i); (l <= 1 ? cTmp.copy(cDim).lerp(cInk, l) : cTmp.copy(cInk).lerp(cAcc, l - 1)); col.setXYZ(i, cTmp.r, cTmp.g, cTmp.b); }
    col.needsUpdate = true;
  }

  const labels = [];
  function label(html, at, from, to, until = 99) {
    const e = document.createElement('div'); e.className = 'sc-lab'; e.innerHTML = html;
    e.setAttribute('aria-hidden', 'true');
    labelsEl.appendChild(e); labels.push({ e, at, from, to, until });
  }
  const top = (sh, up = 0.42) => sheetPoint(sh, -SHEET_W / 2 - 0.25, SHEET_H / 2 + up);
  label('<b>394,171</b> recordings, one batch · one dot ≈ 394', top(0, 0.95), 2.6, 3.0);
  label('<b>159,099</b> recorded near 100 a second', top(1, 0.68), 3.5, 4.0);
  label('<b>7,635</b> pass every check', sheetPoint(2, -0.35, SHEET_H / 2 + 0.42), 4.5, 5.0);
  label('<b>2,878</b> kept · from <b>1,081</b> players', sheetPoint(2, 0.3, -SHEET_H / 2 - 0.3), 4.6, 5.0, 5.2);
  label('<b>7,078</b> players · all batches, same checks', sheetPoint(3, -SW / 2, -SH / 2 - 0.62), 5.5, 6.0);
  label('<b>5,243</b> players to learn from', sheetPoint(3, groupMid[0][1], -SH / 2 - 0.22), 5.5, 6.0);
  label('<b>786</b> to tune', sheetPoint(3, groupMid[1][1], SH / 2 + 0.34), 5.5, 6.0);
  label('<b>1,049</b> never seen', sheetPoint(3, groupMid[2][1], -SH / 2 - 0.22), 5.5, 6.0);
  label('one of <b>204,603,125</b> windows · 4 s in', P(-(RIBBON_FROM + RIBBON_LEN) + 0.2, 1.5 * ROW_GAP + 0.3, 0), 6.5, 7.0);
  label('w · x · y · z, each on its own scale', P(-(RIBBON_FROM + RIBBON_LEN * 0.55), 1.5 * ROW_GAP + 0.3, 0), 0.6, 1.0, 2.6);
  label('−4 s', P(-(RIBBON_FROM + RIBBON_LEN), -1.5 * ROW_GAP - 0.28, 0), 0.6, 1.0, 2.6);
  label('now', P(-RIBBON_FROM, -1.5 * ROW_GAP - 0.28, 0), 0.6, 1.0, 2.6);
  label('<i>+200 ms</i>', tracePoint(-AHEAD, 0, 0, new THREE.Vector3()).addScaledVector(UP, 0.3 * U), 1.5, 2.0, 2.6);

  let s = 0, paintedA = -1, paintedB = -1;
  function setPos(pos) {
    s = pos;
    pastMat.opacity = 0.85 * ramp(s, 0.3, 1) * (1 - 0.55 * ramp(s, 2.2, 3));
    const ahead = ramp(s, 1.4, 2) * (1 - ramp(s, 2.3, 3));
    endMat.opacity = ahead; ends.visible = ahead > 0.01;
    const show = ramp(s, 2.3, 3); data.visible = show > 0.001;
    frames[0].material.opacity = 0.34 * show;
    frames[1].material.opacity = 0.34 * ramp(s, 3.3, 4); frames[2].material.opacity = 0.34 * ramp(s, 4.3, 5);
    const a = ease(ramp(s, 3.2, 3.9)), b = ease(ramp(s, 4.2, 4.9)), c = ease(ramp(s, 5.2, 5.9)), w = ease(ramp(s, 6.3, 7));
    d1.material.opacity = show;
    if (data.visible && (a !== paintedA || b !== paintedB)) {
      paint(d1, N_ALL, i => (inRate.has(i) ? 1 : 1 - 0.86 * a));
      paint(d2, N_RATE, j => (inMove.has(keptRate[j]) ? 1 + b : 1 - 0.86 * b));
      if (paintedA < 0) paint(d3, N_MOVE, () => 2);
      paintedA = a; paintedB = b;
    }
    l12.material.opacity = 0.2 * a; d2.material.opacity = a; d2.visible = a > 0.001;
    l23.material.opacity = 0.75 * b; d3.material.opacity = b; d3.visible = b > 0.001;
    lone.material.opacity = 0.95 * Math.max(a, b) * (1 - ramp(s, 5.6, 6.4));
    l3s.material.opacity = 0.45 * c; groups.forEach((g, k) => { g.material.opacity = (k === 0 ? 0.95 : 0.55) * c; });
    lwin.material.opacity = 0.9 * w;
  }
  setPos(0);

  const K = [null,
    [P(-4.6, 0.55, 0.9), P(0, 0.05, 0)],
    [P(-0.5, 0.25, 3.3), P(-0.45, 0.0, 0)],
    [P(-12.5, 0.3, 1.1), P(-16, 0.0, 0)],
    [P(-8.9, 0.8, 2.4), P(-13.2, 0.0, 0)],
    [P(-7.2, 0.6, 2.0), P(-11.2, 0.0, 0)],
    [P(0.5, 2.7, 8.4), P(-11.4, -0.1, 0)],
    [P(-0.6, 1.5, 5.4), P(-5.6, 0.0, 0)],
  ];
  const FOVS = [24, 30, 26, 34, 34, 34, 38, 34];
  function camera(pos, out) {
    const i = Math.max(0, Math.min(K.length - 2, Math.floor(pos))), t = ease(Math.max(0, Math.min(1, pos - i)));
    out.position.lerpVectors(K[i][0], K[i + 1][0], t); out.target.lerpVectors(K[i][1], K[i + 1][1], t);
    out.fov = FOVS[i] + (FOVS[i + 1] - FOVS[i]) * t;
    out.offset = 1 - ease(ramp(pos, 0.2, 1));
    return out;
  }

  function placeLabels(cam, w, h) {
    for (const L of labels) {
      const o = ramp(s, L.from, L.to) * (1 - ramp(s, L.until, L.until + 0.4));
      if (o < 0.01) { if (L.e.style.display !== 'none') L.e.style.display = 'none'; continue; }
      v.copy(L.at).project(cam);
      if (v.z > 1) { L.e.style.display = 'none'; continue; }
      L.e.style.display = ''; L.e.style.opacity = o.toFixed(2);
      L.e.style.transform = 'translate(' + ((v.x + 1) / 2 * w).toFixed(1) + 'px,' + ((1 - v.y) / 2 * h).toFixed(1) + 'px)';
    }
  }

  return {
    group, update, setPos, camera, placeLabels,
    setKey0(position, target, fov) { K[0] = [position.clone(), target.clone()]; if (fov) FOVS[0] = fov; },
    counts: () => ({ sheet1: N_ALL, sheet2: N_RATE, sheet3: N_MOVE }),
    dispose() { disposables.forEach(o => o.dispose()); labels.forEach(L => L.e.remove()); group.removeFromParent(); group.clear(); },
  };
}
