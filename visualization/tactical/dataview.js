window.K8DataView = (() => {
  'use strict';

  const D = window.DATA_EXAMPLES;
  const C = D.config, P = D.pull, F = D.final, L = D.local, E = D.examples, WALL = D.wall;

  const fmt = n => Number(n).toLocaleString('en-US');
  const fx = (n, d = 1) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (a, b) => fx(100 * a / b, 1) + '%';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = id => esc(String(id).replace(/^(player|rec|id)-/, ''));
  const who = e => `synthetic player ${short(e.user)}, recording ${short(e.recording)}`;
  const col = (rows, i) => rows.map(r => r[i]);
  const extent = a => { let lo = Infinity, hi = -Infinity; for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; };
  const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const range = n => Array.from({ length: n }, (_, i) => i);

  const COL = { accent: '#dff140', keep: '#f1f0ea', bad: '#8e9291',
    fg: '#f1f0ea', body: '#b0b0a9', muted: '#8e9291', faint: '#1c1f22', axis: '#2f3234', bg: '#010101',
    line2: '#b0b0a9', line3: '#565654' };
  Object.assign(COL, { w: COL.fg, x: COL.line2, y: COL.accent, z: COL.line3, blue: COL.line2, violet: COL.line3, amber: COL.accent,
    grid: COL.faint, past: '#787878', turn: COL.accent, tilt: COL.line2, lean: COL.line3,
    fHead: '#2f3234', fShort: '#454749', fRate: '#5d6062', fMotion: '#7a7d7e', fCap: COL.line3 });
  const QUAT = [['w', COL.accent], ['x', COL.accent], ['y', COL.accent], ['z', COL.accent]];
  const ANG = [['turn left / right', COL.turn], ['tilt up / down', COL.tilt], ['lean sideways', COL.lean]];
  const ANG_END = ['turn', 'tilt', 'lean'];
  const FATE_COL = [COL.fHead, COL.fShort, COL.fRate, COL.fMotion, COL.fCap, COL.keep];

  const reason = k => P.reasons[k] || 0;
  const LEFT = {};
  LEFT.raw = P.recordings;
  LEFT.head = LEFT.raw - reason('unreadable file') - reason('excluded game') - reason('no head device') - reason('head has no rotation');
  LEFT.clean = LEFT.head - reason('too few valid frames') - reason('bad frame array') - reason('no frames key') - reason('processing error');
  LEFT.rate = LEFT.clean - reason('sampling rate outside 85-110 Hz') - reason('no positive time steps');
  LEFT.motion = LEFT.rate - reason('no usable 5 s windows') - reason('below S/V threshold');
  LEFT.pick = P.processed_json.qualified;
  const TOTAL = { users: 0, recordings: 0, segments: 0, samples: 0, newUsers: 0, loggedUsers: 0, loggedRecordings: 0, earlierUsers: 0, laterUsers: 0 };
  for (const s of Object.values(F.splits)) {
    TOTAL.users += s.users; TOTAL.recordings += s.recordings; TOTAL.segments += s.segments; TOTAL.samples += s.samples;
    TOTAL.newUsers += s.new.users; TOTAL.loggedUsers += s.logged.users; TOTAL.loggedRecordings += s.logged.recordings;
    TOTAL.earlierUsers += s.earlier.users; TOTAL.laterUsers += s.later.users;
  }
  const BUILT = F.build.sources;
  const CATS = [
    { n: LEFT.pick, stage: 99, c: COL.keep, name: 'kept' },
    { n: LEFT.motion - LEFT.pick, stage: 6, c: COL.fCap, name: 'over the limit of ' + C.H5_MAX_RECORDINGS_PER_USER + ' per player, or no 10 s piece' },
    { n: LEFT.rate - LEFT.motion, stage: 4, c: COL.fMotion, name: 'head hardly moves' },
    { n: LEFT.clean - LEFT.rate, stage: 3, c: COL.fRate, name: 'wrong sampling rate' },
    { n: LEFT.head - LEFT.clean, stage: 2, c: COL.fShort, name: 'nothing left after cleaning' },
    { n: LEFT.raw - LEFT.head, stage: 1, c: COL.fHead, name: 'no head in the file' },
  ];
  const PEAKS = (() => {
    const h = P.hz.hist_1hz, tops = [];
    for (let i = 1; i < h.length - 1; i++) if (h[i] > h[i - 1] && h[i] >= h[i + 1]) tops.push(i);
    return tops.sort((a, b) => h[b] - h[a]).slice(0, 5).sort((a, b) => a - b);
  })();

  const RATES = (() => {
    const r = L.rates_hz_rounded, at = k => r[k] || 0, tops = Object.keys(r).map(Number).filter(k => at(k) > at(k - 1) && at(k) >= at(k + 1));
    return tops.sort((a, b) => at(b) - at(a)).slice(0, 4).sort((a, b) => a - b);
  })();

  function check() {
    const bad = [];
    const must = (ok, what) => { if (!ok) bad.push(what); };
    must(LEFT.motion === reason('pass'), 'funnel does not end at the number of passes');
    must(LEFT.clean === P.hz.n, 'recordings with a measured rate != recordings left after cleaning');
    must(LEFT.rate === P.hz.in_band, 'recordings inside 85-110 Hz != recordings left after the rate gate');
    must(P.sv.n === LEFT.rate - reason('no usable 5 s windows'), 'recordings with sweep/velocity != recordings assessed');
    must(Object.values(P.sv.quadrants).reduce((a, b) => a + b, 0) === P.sv.n, 'quadrant counts do not add up');
    must(Object.entries(P.qualified_per_user).reduce((a, [k, v]) => a + k * v, 0) === LEFT.pick, 'recordings per user do not add up');
    must(P.rec_per_user.hist.reduce((a, b) => a + b, 0) === P.users, 'recordings-per-user bins do not add up');
    must(TOTAL.newUsers === F.new_users.train + F.new_users.validation + F.new_users.test, 'new users in the file');
    must(TOTAL.loggedUsers + TOTAL.earlierUsers + TOTAL.laterUsers === TOTAL.users, 'players by source do not add up to the file');
    must(Object.keys(F.splits).every(k => F.splits[k].users === F.base_users[k] + F.new_users[k]), 'a group is not first file + added players');
    must(BUILT.window + BUILT.pull === F.build.candidates && F.build.usable === TOTAL.newUsers, 'players added by the final build != its build log');
    must(TOTAL.loggedUsers === P.usable_users && TOTAL.loggedRecordings === LEFT.pick, 'the logged pull is not wholly in the final file');
    must(E.window.q_wxyz.length === F.context + F.horizon, 'window is not context + horizon long');
    must(F.only_preparation_version === C.PREPARATION_VERSION, 'a piece in the file was made by another pipeline version');
    must(STAGES.length === 9 && STAGES.every(s => s.tabs.length > 0 && s.story.length === 3), 'a stage has no figure or no story');
    must(RATES.every(r => PEAKS.includes(r) || PEAKS.includes(r - 1)), 'the common rates on this laptop are not the peaks of the pull');
    must(CATS.reduce((a, c) => a + c.n, 0) === LEFT.raw && CATS.every(c => c.n >= 0), 'the dot band does not add up to all recordings');
    must(WALL.tiles.length === L.recordings && WALL.fate_counts.reduce((a, b) => a + b, 0) === L.recordings, 'the wall does not hold every local recording');
    must(WALL.fate_counts[5] === (L.status.qualified || 0), 'kept tiles != local recordings that qualify');
    must(L.recordings - L.decoded === WALL.fate_counts[0], 'local files without a head != files that were not decoded');
    E.one.check_turn_tilt_lean_deg.forEach((ref, i) => {
      const a = ttl(E.one.q_wxyz[i]);
      must(a && a.every((v, k) => Math.abs(v - ref[k]) < 0.05), `turn/tilt/lean of sample ${i} differs from the generator's`);
    });
    const fc = E.frame_check;
    must(fc.left_hand_xyz_m[0] < 0 && fc.right_hand_xyz_m[0] > 0 && fc.left_hand_xyz_m[1] < 0 && fc.left_hand_xyz_m[2] > 0 && fc.right_hand_xyz_m[2] > 0, 'axis check: hands are not where the head frame says');
    must(E.freeze.rows_in_run === E.freeze.last_row - E.freeze.first_row + 1, 'stuck-clock run length');
    const kc = E.raw.invalid_samples + E.raw.trimmed_samples;
    must(kc >= E.raw.t.length || (E.raw.t[kc] >= C.TRIM_S && E.raw.t[kc - 1] < C.TRIM_S + 0.05), 'first kept sample of the stage-3 example is not at the 5 s cut');
    return bad;
  }

  const unit = q => { const n = Math.hypot(q[0], q[1], q[2], q[3]); return n > 1e-6 ? [q[0] / n, q[1] / n, q[2] / n, q[3] / n] : null; };
  function rotv(q, v) {
    const [w, x, y, z] = q, [a, b, c] = v;
    const tx = 2 * (y * c - z * b), ty = 2 * (z * a - x * c), tz = 2 * (x * b - y * a);
    return [a + w * tx + (y * tz - z * ty), b + w * ty + (z * tx - x * tz), c + w * tz + (x * ty - y * tx)];
  }
  const deg = r => r * 180 / Math.PI;
  function ttl(q) {
    const u = unit(q); if (!u) return null;
    const [w, x, y, z] = u;
    return [deg(Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y))), deg(Math.asin(clamp(2 * (y * z - w * x), -1, 1))),
      deg(Math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z)))];
  }
  function angles(qs) {
    const out = []; let pt = null, pl = null, ot = 0, ol = 0;
    for (const q of qs) {
      const a = ttl(q);
      if (!a) { out.push(null); continue; }
      if (pt !== null) {
        if (a[0] - pt > 180) ot -= 360; else if (a[0] - pt < -180) ot += 360;
        if (a[2] - pl > 180) ol -= 360; else if (a[2] - pl < -180) ol += 360;
      }
      pt = a[0]; pl = a[2];
      out.push([a[0] + ot, a[1], a[2] + ol]);
    }
    return out;
  }
  const side = (v, pos, neg) => Math.abs(v) < 0.5 ? '0°' : `${fx(Math.abs(v), 0)}° ${v > 0 ? pos : neg}`;

  function sampleAt(tr, a) {
    const t = tr.t, n = t.length;
    if (a <= t[0]) return { q: tr.q[0], i: 0 };
    if (a >= t[n - 1]) return { q: tr.q[n - 1], i: n - 1 };
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= a) lo = m; else hi = m; }
    const q0 = unit(tr.q[lo]), q1 = unit(tr.q[hi]), gap = t[hi] - t[lo];
    if (!q0 || !q1 || !(gap > 0)) return { q: tr.q[lo], i: lo };
    if (tr.hold && gap > tr.hold) return { q: tr.q[lo], i: lo, hole: true };
    const f = (a - t[lo]) / gap, sgn = q0[0] * q1[0] + q0[1] * q1[1] + q0[2] * q1[2] + q0[3] * q1[3] < 0 ? -1 : 1;
    return { q: [0, 1, 2, 3].map(k => q0[k] * (1 - f) + sgn * q1[k] * f), i: lo };
  }

  const CAM = { a: Math.PI - Math.PI / 6, b: 8 * Math.PI / 180, D: 14 }, CB = Math.cos(CAM.b), SB = Math.sin(CAM.b);
  let CA = Math.cos(CAM.a), SA = Math.sin(CAM.a);
  const toView = p => { const x1 = p[0] * CA - p[2] * SA, z1 = p[0] * SA + p[2] * CA; return [x1, p[1] * CB + z1 * SB, -p[1] * SB + z1 * CB]; };
  const BOX = (() => {
    const c = [0, 0.14, 0.93], h = [0.8, 0.36, 0.3], v = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) v.push([c[0] + sx * h[0], c[1] + sy * h[1], c[2] + sz * h[2]]);
    return { v, faces: [[[1, 3, 7, 5], [0, 0, 1]], [[0, 4, 6, 2], [0, 0, -1]], [[0, 2, 3, 1], [-1, 0, 0]], [[4, 5, 7, 6], [1, 0, 0]], [[2, 6, 7, 3], [0, 1, 0]], [[0, 1, 5, 4], [0, -1, 0]]],
      lens: [[-0.62, -0.06, 1.235], [-0.62, 0.34, 1.235], [0.62, 0.34, 1.235], [0.62, -0.06, 1.235]] };
  })();
  const LIGHT = (() => { const l = [-0.4, 0.75, -0.55], n = Math.hypot(...l); return l.map(v => v / n); })();

  const MF = 2.9;
  const MESH = (() => {
    const H = window.K8_HEAD; if (!H || !H.parts) return null;
    const parts = H.parts.map(pt => {
      const n = pt.p.length / 3, v = new Float32Array(pt.p.length);
      for (let k = 0; k < n; k++) { v[3 * k] = -pt.p[3 * k] * H.unit * MF; v[3 * k + 1] = pt.p[3 * k + 1] * H.unit * MF; v[3 * k + 2] = -pt.p[3 * k + 2] * H.unit * MF; }
      const c = [1, 3, 5].map(j => parseInt(pt.color.slice(j, j + 2), 16));
      const o = { v, i: pt.i, turns: pt.group !== 'bust', rgb: c, glow: pt.name === 'led', out: new Float32Array(pt.p.length), w: pt.w || null };
      if (pt.i2) o.i2 = pt.i2, o.rgb2 = [1, 3, 5].map(j => parseInt(pt.color2.slice(j, j + 2), 16));
      return o;
    });
    return { parts, tris: parts.reduce((m, q) => m + q.i.length / 3, 0) };
  })();
  const POSER = MESH && window.K8HeadPose ? window.K8HeadPose.make() : null, POSED = POSER ? new Float32Array(POSER.count * 3) : null; let HEADT = null;
  const useMesh = () => MESH && POSER && !!window.K8HeadGL && window.K8HeadGL.ok() && document.body.dataset.tier !== 'min';
  function meshItems(g, q, PT, items, ref) {
    if (POSER) HEADT = POSER.apply(q ? [-q[1], q[2], -q[3], q[0]] : [0, 0, 0, 1], POSED, null, null, ref || 0);
    for (const part of MESH.parts) {
      if (part.turns && !part.w && !q) continue;
      const v = part.v, o = part.out, n = v.length / 3;
      for (let k = 0; k < n; k++) {
        let p = [v[3 * k], v[3 * k + 1], v[3 * k + 2]];
        if (part.w) { p = [-POSED[3 * k] * MF, POSED[3 * k + 1] * MF, -POSED[3 * k + 2] * MF];
        } else if (part.turns) { const hq = HEADT.q, ht = HEADT.t, m = window.K8HeadPose.rot(hq, [-p[0] / MF, p[1] / MF, -p[2] / MF]); p = [-(m[0] + ht[0]) * MF, (m[1] + ht[1]) * MF, -(m[2] + ht[2]) * MF]; }
        const s2 = PT(p); o[3 * k] = s2[0]; o[3 * k + 1] = s2[1]; o[3 * k + 2] = s2[2];
      }
      for (const [ix, [r, gg, b]] of (part.i2 ? (q ? [[part.i, part.rgb], [part.i2, part.rgb2]] : [[part.i2, part.rgb2]]) : [[part.i, part.rgb]]))
      for (let t = 0; t < ix.length; t += 3) {
        const a = 3 * ix[t], b2 = 3 * ix[t + 1], c = 3 * ix[t + 2];
        const ux = o[b2] - o[a], uy = o[b2 + 1] - o[a + 1], uz = o[b2 + 2] - o[a + 2], wx = o[c] - o[a], wy = o[c + 1] - o[a + 1], wz = o[c + 2] - o[a + 2];
        const cz = ux * wy - uy * wx; if (cz <= 0) continue;
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = cz; const nl = (Math.hypot(nx, ny, nz) || 1) * (nz > 0 ? -1 : 1); nx /= nl; ny /= nl; nz /= nl;
        const lit = part.glow ? 1 : 0.5 + 0.5 * Math.max(0, -(0.4 * nx + 0.75 * ny + 0.55 * nz) / 1.013);
        const rim = part.glow ? 0 : 105 * Math.pow(1 - Math.abs(nz), 3);
        const col = `rgb(${Math.min(255, Math.round(r * lit + rim * 0.9))},${Math.min(255, Math.round(gg * lit + rim * 0.95))},${Math.min(255, Math.round(b * lit + rim))})`;
        const x0 = o[a], y0 = o[a + 1], x1 = o[b2], y1 = o[b2 + 1], x2 = o[c], y2 = o[c + 1];
        items.push({ z: (o[a + 2] + o[b2 + 2] + o[c + 2]) / 3, draw() { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = col; g.lineWidth = 0.7; g.stroke(); } });
      }
    }
  }

  const ORB = { off: 0, goal: 0, drag: null, raf: 0, last: 0 };
  let orbitHint = (() => { try { return !localStorage.getItem('k8:orbit'); } catch (e) { return true; } })();
  function orbitStep(now) {
    ORB.raf = 0;
    const dt = ORB.last ? Math.min((now - ORB.last) / 1000, 0.1) : 1 / 60; ORB.last = now;
    ORB.off += (ORB.goal - ORB.off) * (calm() ? 1 : 1 - Math.exp(-dt / (ORB.drag ? 0.07 : 0.2)));
    if (Math.abs(ORB.goal - ORB.off) < 2e-3) ORB.off = ORB.goal;
    if (!(player.playing && player.raf)) for (const cv of document.querySelectorAll('#dvHead canvas')) if (cv._args) drawHead(cv, ...cv._args);
    if (ORB.off !== ORB.goal || ORB.drag) ORB.raf = requestAnimationFrame(orbitStep); else ORB.last = 0;
  }
  const orbitGo = () => { if (!ORB.raf) ORB.raf = requestAnimationFrame(orbitStep); };
  function orbitable(cv) {
    if (cv._orb) return; cv._orb = true; cv.style.cursor = 'grab'; cv.style.touchAction = 'pan-y';
    cv.addEventListener('pointerdown', e => {
      if (e.button) return;
      ORB.drag = { x: e.clientX, off: ORB.goal }; try { cv.setPointerCapture(e.pointerId); } catch (_) {  }
      cv.style.cursor = 'grabbing'; e.preventDefault();
      if (orbitHint) { orbitHint = false; try { localStorage.setItem('k8:orbit', '1'); } catch (_) {  } }
      orbitGo();
    });
    cv.addEventListener('pointermove', e => { if (ORB.drag) { ORB.goal = clamp(ORB.drag.off + (e.clientX - ORB.drag.x) * 0.012, -2.6, 2.6); orbitGo(); } });
    const up = () => { if (!ORB.drag) return; ORB.drag = null; ORB.goal = 0; cv.style.cursor = 'grab'; orbitGo(); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('lostpointercapture', up);
  }

  const FLOOR_Y = -0.905 * 2.9;
  const FALLBACK_PTR = { front: [0, 0.14, 1.3], tip: [0, 0.14, 4.3] };
  const meshPointer = () => { const p = window.K8HeadGL.pointer(); return p ? { front: [-p.front[0] * MF, p.front[1] * MF, -p.front[2] * MF], tip: [-p.tip[0] * MF, p.tip[1] * MF, -p.tip[2] * MF] } : FALLBACK_PTR; };
  function poseRange(tr) {
    if (tr._range) return tr._range;
    let ylo = 0, yhi = 0, plo = 0, phi = 0;
    if (!tr.none) for (const qq of tr.q) {
      const u = unit(qq); if (!u) continue;
      const f = rotv(u, [0, 0, 1]), y = Math.atan2(f[0], f[2]) - tr._ref, d = Math.atan2(Math.sin(y), Math.cos(y)), p = Math.asin(clamp(f[1], -1, 1));
      if (d < ylo) ylo = d; if (d > yhi) yhi = d; if (p < plo) plo = p; if (p > phi) phi = p;
    }
    return (tr._range = { ylo, yhi, plo, phi });
  }

  function drawHead(cv, tr, a, lowDetail, rew) {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    cv._args = [tr, a, lowDetail, rew]; orbitable(cv);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.lineCap = 'butt'; g.lineJoin = 'miter'; g.globalAlpha = 1;
    const D = CAM.D, mesh = useMesh(), PTR = mesh ? meshPointer() : FALLBACK_PTR;
    if (tr._ref === undefined) {
      const hs = []; if (!tr.none) for (const qq of tr.q) { const uq = unit(qq); if (uq) hs.push(2 * Math.atan2(uq[2], uq[0])); }
      tr._ref = !hs.length ? 0 : window.K8HeadPose ? window.K8HeadPose.meanHeading(hs) : Math.atan2(hs.reduce((m, v) => m + Math.sin(v), 0), hs.reduce((m, v) => m + Math.cos(v), 0));
    }
    const ref = mesh ? tr._ref : 0;
    CA = Math.cos(CAM.a + tr._ref); SA = Math.sin(CAM.a + tr._ref);
    const first = cv.closest('.hd') === cv.closest('#dvHead').firstElementChild;
    const FR = cv._frame && cv._frame.w === w && cv._frame.h === h && cv._frame.first === first && cv._frame.tr === tr && cv._frame.mesh === mesh ? cv._frame : (cv._frame = (() => {
      const R = poseRange(tr), cr = Math.cos(tr._ref), sr = Math.sin(tr._ref), turnY = p => [p[0] * cr + p[2] * sr, p[1], -p[0] * sr + p[2] * cr];
      const proj = p => { const v = toView(p), f = D / (D + v[2]); return [f * v[0], -f * v[1]]; };
      const bust = [];
      for (const x of [-1.75, 1.75]) for (const z of [-0.9, 0.9]) for (const y of [FLOOR_Y, -1.4]) bust.push(turnY([x, y, z]));
      for (let k = 0; k < 24; k++) { const an = k / 24 * 2 * Math.PI; for (const y of [-1.25, 0, 1.25]) { const r = Math.sqrt(1.25 * 1.25 - y * y) || 0.3; bust.push([r * Math.sin(an), y + 0.1, r * Math.cos(an)]); } }
      let x0 = Infinity, x1 = -Infinity, ya = Infinity, yb = -Infinity;
      for (const p of bust) { const [x, y] = proj(p); x0 = Math.min(x0, x); x1 = Math.max(x1, x); ya = Math.min(ya, y); yb = Math.max(yb, y); }
      const MT = first ? 22 : 8, M = 10, s = Math.min(0.6 * h / (yb - ya), 0.55 * w / (x1 - x0), (h - MT - M) / (yb - ya));
      const cy = MT + (h - MT - M - s * (yb - ya)) / 2 - s * ya;
      const faceLeft = proj(turnY([0, 0, 3]))[0] < proj([0, 0, 0])[0];
      const HL = (PTR.tip[2] - PTR.front[2]) / 1.5, tenDeg = Math.PI / 18;
      const y0 = R.ylo - tenDeg, y1 = R.yhi + tenDeg, p0 = Math.max(-1.4, R.plo - tenDeg), p1 = Math.min(1.4, R.phi + tenDeg);
      const ny = Math.max(2, Math.ceil((y1 - y0) / tenDeg)), np = Math.max(2, Math.ceil((p1 - p0) / tenDeg)), dirs = [];
      for (let i = 0; i <= ny; i++) for (let j = 0; j <= np; j++) {
        const yy = tr._ref + y0 + (y1 - y0) * i / ny, pp = p0 + (p1 - p0) * j / np;
        dirs.push([[Math.cos(pp) * Math.sin(yy), Math.sin(pp), Math.cos(pp) * Math.cos(yy)], [-Math.sin(pp) * Math.sin(yy), Math.cos(pp), -Math.sin(pp) * Math.cos(yy)]]);
      }
      const fits = (cx, Lh) => {
        const tz = PTR.front[2] + Lh * HL, ty = PTR.front[1];
        for (const [f, up] of dirs) { const [x, y] = proj([f[0] * tz + up[0] * ty, f[1] * tz + up[1] * ty, f[2] * tz + up[2] * ty]), X = cx + s * x, Y = cy + s * y; if (X < M || X > w - M || Y < M || Y > h - M) return false; }
        return true;
      };
      for (const bx of [0.72, 0.66, 0.6, 0.55, 0.5]) {
        const cx = (faceLeft ? bx : 1 - bx) * w - s * (x0 + x1) / 2;
        for (let Lh = 1.5; Lh >= 0.6 - 1e-9; Lh -= 0.05) if (fits(cx, Lh)) return { w, h, first, tr, mesh, s, cx, cy, ptrLen: Lh };
      }
      return { w, h, first, tr, mesh, s, cx: w / 2 - s * (x0 + x1) / 2, cy, ptrLen: 0.6 };
    })());
    CA = Math.cos(CAM.a + tr._ref + ORB.off); SA = Math.sin(CAM.a + tr._ref + ORB.off);
    const s = FR.s, cx = FR.cx, cy = FR.cy;
    const PT = p => { const v = toView(p), f = D / (D + v[2]); return [cx + s * f * v[0], cy - s * f * v[1], v[2]]; };
    const beam = COL.accent;
    const poly = (pts, fill, stroke, lw = 1) => { g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } };
    const disc = (p, r, fill, stroke) => { g.beginPath(); g.arc(p[0], p[1], r, 0, 2 * Math.PI); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); } };

    const smp = tr.none ? null : sampleAt(tr, a); let q = smp && unit(smp.q);
    if (q && rew > 0) { const q1 = unit(sampleAt(tr, tr.t[0]).q); if (q1) { const e = rew * rew * (3 - 2 * rew), sg = q[0] * q1[0] + q[1] * q1[1] + q[2] * q1[2] + q[3] * q1[3] < 0 ? -1 : 1; q = unit(q.map((v, k) => v * (1 - e) + sg * q1[k] * e)) || q; } }
    const hint = () => {
      if (orbitHint && first && w >= 120) { g.fillStyle = COL.muted; g.font = '400 12px "Geist", system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('drag to look around', cx, 15); }
    };
    if (!q) {
      if (mesh) window.K8HeadGL.draw(g, { w, h, dpr, cx, cy, s, q: null, toView, scale: MF, ref, persp: D, cheap: lowDetail, ptrLen: FR.ptrLen });
      g.setLineDash([5, 5]); g.strokeStyle = COL.past; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, s, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]);
      g.fillStyle = COL.bad; g.font = '600 12.5px "Geist", system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(tr.none ? (tr.noneText || 'no head') : 'no direction', cx, cy + 4);
      hint();
      return null;
    }
    const L = v => PT(rotv(q, v));
    if (mesh) {
      window.K8HeadGL.draw(g, { w, h, dpr, cx, cy, s, q, toView, scale: MF, ref, beam, persp: D, cheap: lowDetail, ptrLen: FR.ptrLen });
    } else {
    const FY = FLOOR_Y, body = [];
    for (let k = 0; k <= 12; k++) { const x = -1.6 + k * 3.2 / 12; body.push(PT([x, -1.42 - 0.3 * Math.pow(Math.abs(x) / 1.6, 2.2), 0])); }
    body.push(PT([1.68, FY, 0]), PT([-1.68, FY, 0]));
    const fade = g.createLinearGradient(0, cy + 1.3 * s, 0, cy + 2.7 * s); fade.addColorStop(0, '#4a4c50'); fade.addColorStop(1, 'rgba(74,76,80,0)');
    poly(body, fade, null);
    g.beginPath(); body.slice(0, 13).forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.strokeStyle = '#8a8d93'; g.lineWidth = 1.2; g.stroke();
    poly([PT([-0.4, -0.7, 0]), PT([0.4, -0.7, 0]), PT([0.46, -1.5, 0]), PT([-0.46, -1.5, 0])], '#8c8780', null);
    const items = [], skin = '#c9c4bc', skinDark = '#a29d96', edge = '#6f6c68';
    const ball = (c, r, fill, stroke) => { const p = L(c); items.push({ z: p[2], draw() { disc(p, r * s, fill, stroke); } }); };
    items.push({ z: 0, draw() {
      const gr = g.createRadialGradient(cx - 0.35 * s, cy - 0.42 * s, 0.1 * s, cx, cy, s);
      gr.addColorStop(0, '#e4e0d9'); gr.addColorStop(1, '#7a7671');
      disc([cx, cy], s, gr, '#b9b9b9');
      const strap = make => {
        g.strokeStyle = '#36383c'; g.lineWidth = Math.max(3, s * 0.13); g.lineCap = 'butt'; g.beginPath();
        let pen = false;
        for (let k = 0; k <= 30; k++) { const p = L(make(k / 30)); if (p[2] <= 0.04) { if (pen) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); pen = true; } else pen = false; }
        g.stroke();
      };
      strap(u => { const an = (50 + u * 260) * Math.PI / 180; return [1.02 * Math.sin(an), 0.14, 1.02 * Math.cos(an)]; });
      strap(u => { const an = (22 + u * 150) * Math.PI / 180; return [0, 1.02 * Math.sin(an), 1.02 * Math.cos(an)]; });
    } });
    ball([0, -0.5, 0.3], 0.72, skinDark, edge);
    ball([0.98, -0.12, -0.05], 0.2, skinDark, edge);
    ball([-0.98, -0.12, -0.05], 0.2, skinDark, edge);
    ball([0, -0.42, 1.0], 0.17, skin, edge);
    const pts = BOX.v.map(L);
    for (const [idx, nrm] of BOX.faces) {
      const n = toView(rotv(q, nrm));
      if (n[2] >= 0) continue;
      const shade = 0.55 + 0.45 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]), front = nrm[2] === 1;
      const v = Math.round(shade * 235);
      items.push({ z: idx.reduce((m, i) => m + pts[i][2], 0) / 4 - 0.3, draw() {
        poly(idx.map(i => pts[i]), `rgb(${Math.min(255, Math.round(v * 1.02))},${Math.round(v * 1.015)},${v})`, '#111214');
        if (front) poly(BOX.lens.map(L), '#111214', null);
      } });
    }
    const b0 = L(PTR.front), b1 = L([PTR.front[0], PTR.front[1], PTR.front[2] + FR.ptrLen * (PTR.tip[2] - PTR.front[2]) / 1.5]);
    items.push({ z: (b0[2] + b1[2]) / 2 - 0.5, draw() {
      g.strokeStyle = beam; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(b0[0], b0[1]); g.lineTo(b1[0], b1[1]); g.stroke();
    } });
    items.sort((p1, p2) => p2.z - p1.z);
    for (const it of items) it.draw();
    }
    hint();
    return smp;
  }

  const FIG_TEXT = {
    axis: { size: 13, weight: 400, fill: COL.muted },
    note: { size: 14, weight: 500, fill: COL.body },
    title: { size: 14, weight: 400, fill: COL.muted },
  };
  const figText = (role, fill) => { const r = FIG_TEXT[role]; return `font-size:${(r.size / scale).toFixed(2)}px;font-weight:${r.weight};fill:${fill || r.fill}`; };
  const textW = (text, role = 'note') => String(text).length * FIG_TEXT[role].size * 0.52 / scale;
  function ticks(lo, hi, n) {
    const raw = (hi - lo) / Math.max(n, 1), mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12));
    return out;
  }

  function frame(o) {
    const fxn = o.xlog ? Math.log10 : v => v, fyn = o.ylog ? Math.log10 : v => v;
    const X = v => o.x + (fxn(v) - fxn(o.xd[0])) / (fxn(o.xd[1]) - fxn(o.xd[0])) * o.w;
    const Y = v => o.y + o.h - (fyn(v) - fyn(o.yd[0])) / (fyn(o.yd[1]) - fyn(o.yd[0])) * o.h;
    const xt = o.xt || ticks(o.xd[0], o.xd[1], clamp(Math.floor(o.w / 130), 3, 6));
    const yt = o.yt || ticks(o.yd[0], o.yd[1], clamp(Math.floor(o.h / 75), 2, 4));
    const xf0 = o.xf || (v => String(v)), yf = o.yf || (v => String(v));
    const xf = o.xu ? (v => { const l = xf0(v); return l !== '' && v === xt[xt.length - 1] ? l + o.xu : l; }) : xf0;
    let s = '';
    const ax = figText('axis');
    for (const v of yt) {
      const py = Y(v).toFixed(1);
      s += `<line x1="${o.x}" x2="${o.x + o.w}" y1="${py}" y2="${py}" stroke="${COL.faint}"/>` +
           `<text x="${o.x - 8}" y="${py}" dy="4" text-anchor="end" style="${ax}">${yf(v)}</text>`;
    }
    s += `<line x1="${o.x}" x2="${o.x + o.w}" y1="${o.y + o.h}" y2="${o.y + o.h}" stroke="${COL.axis}"/>`;
    for (const v of xt) {
      const px = X(v).toFixed(1), lab = xf(v), edge = textW(lab, 'axis') / 2;
      const anchor = +px > o.x + o.w - edge ? 'end' : +px < o.x - 30 + edge ? 'start' : 'middle';
      s += `<line x1="${px}" x2="${px}" y1="${o.y + o.h}" y2="${o.y + o.h + 4}" stroke="${COL.axis}"/>` +
           (lab === '' ? '' : `<text x="${anchor === 'end' ? o.x + o.w : px}" y="${o.y + o.h + 18}" text-anchor="${anchor}" style="${ax}">${lab}</text>`);
    }
    if (o.xlab) s += `<text x="${o.x + o.w / 2}" y="${o.y + o.h + 33}" text-anchor="middle" style="${ax}">${o.xlab}</text>`;
    if (o.ylab) s += `<text x="${o.x}" y="${o.y - 7}" style="${figText('title')}">${o.ylab}</text>`;
    return { X, Y, svg: s };
  }

  function dots(xs, ys, X, Y, color, r = 1.4, opacity = 1) {
    let d = '';
    for (let i = 0; i < xs.length; i++) if (ys[i] != null) d += `M${X(xs[i]).toFixed(1)} ${Y(ys[i]).toFixed(1)}h0`;
    return d ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${2 * r}" stroke-linecap="round"${opacity < 1 ? ` opacity="${opacity}"` : ''}/>` : '';
  }

  function line(xs, ys, X, Y, color, width = 1.4, breakAt = Infinity) {
    let d = '', pen = false;
    for (let i = 0; i < xs.length; i++) {
      if (ys[i] == null) { pen = false; continue; }
      d += (pen && Math.abs(ys[i] - ys[i - 1]) <= breakAt ? 'L' : 'M') + X(xs[i]).toFixed(1) + ' ' + Y(ys[i]).toFixed(1);
      pen = true;
    }
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"/>`;
  }

  const FS = () => (document.documentElement.dataset.form ? 1.14 : 1);
  function legend(items, x, y) {
    let s = '', px = x;
    for (const [name, color] of items) {
      s += `<circle cx="${px + 5}" cy="${y - 4}" r="4" fill="${color}"/><text x="${px + 14}" y="${y}" style="${figText('axis')}">${name}</text>`;
      px += 24 + textW(name, 'axis') * FS();
    }
    return s;
  }
  const legendWidth = items => items.reduce((a, [n]) => a + 24 + textW(n, 'axis') * FS(), 0);

  function note(text, x, y, c, anchor = 'start', W = 0) {
    const w = textW(text, 'note') * FS();
    if (W) x = anchor === 'start' ? clamp(x, 4, Math.max(4, W - 4 - w)) : anchor === 'end' ? clamp(x, Math.min(W - 4, 4 + w), W - 4) : clamp(x, 4 + w / 2, Math.max(4 + w / 2, W - 4 - w / 2));
    return `<text class="co" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" style="${figText('note', c)}">${esc(text)}</text>`;
  }
  const pointer = (x1, y1, x2, y2, c) => `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${c}" stroke-width="1" fill="none"/><circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="2.6" fill="${c}"/>`;
  function region(x0, y0, x1, y1, c, o = {}) {
    const op = Math.min(o.fill ?? 0.05, 0.06), d = o.dash ? ' stroke-dasharray="4 4"' : '';
    const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)], [t, u] = [Math.min(y0, y1), Math.max(y0, y1)];
    const edges = o.across ? [[a, t, b, t], [a, u, b, u]] : [[a, t, a, u], [b, t, b, u]];
    return (op > 0 ? `<rect x="${a.toFixed(1)}" y="${t.toFixed(1)}" width="${(b - a).toFixed(1)}" height="${(u - t).toFixed(1)}" fill="${c}" opacity="${op}"/>` : '') +
      edges.filter((_, i) => !(o.only === 'end' && i === 0) && !(o.only === 'start' && i === 1))
        .map(([p, q, r, s2]) => `<line x1="${p.toFixed(1)}" y1="${q.toFixed(1)}" x2="${r.toFixed(1)}" y2="${s2.toFixed(1)}" stroke="${c}" stroke-width="1" opacity=".65" vector-effect="non-scaling-stroke"${d}/>`).join('');
  }
  function tag(x, y, text, c) {
    const t = text.charAt(0) + text.slice(1).toLowerCase();
    return `<text class="tg" x="${x}" y="${y + 1}" style="${figText('note', c)}">${esc(t)}</text>`;
  }
  const tagWidth = text => textW(text, 'note') * FS() + 4;

  function endLabels(items, x, y0, y1) {
    const gap = 16 / scale, lo = y0 + 6, hi = y1 - 2;
    const e = items.map(o => ({ ...o, y0: o.y, y: clamp(o.y, lo, hi) })).sort((a, b) => a.y - b.y);
    for (let round = 0; round < 40; round++) {
      let moved = false;
      for (let i = 1; i < e.length; i++) {
        const over = gap - (e[i].y - e[i - 1].y);
        if (over > 0.01) { e[i - 1].y -= over / 2; e[i].y += over / 2; moved = true; }
      }
      if (e.length && e[0].y < lo) { const d = lo - e[0].y; e.forEach(o => { o.y += d; }); }
      if (e.length && e[e.length - 1].y > hi) { const d = e[e.length - 1].y - hi; e.forEach(o => { o.y -= d; }); }
      if (!moved) break;
    }
    return e.map(o => (Math.abs(o.y - o.y0) > 3 ? `<path d="M${(x - 7).toFixed(1)} ${o.y0.toFixed(1)}L${(x - 2).toFixed(1)} ${o.y.toFixed(1)}" stroke="${o.c}" stroke-width="1" fill="none" opacity=".7"/>` : '') +
      `<text class="ln" x="${x.toFixed(1)}" y="${(o.y + 4.5 / scale).toFixed(1)}" style="${figText('note', o.c)}">${esc(o.text)}</text>`).join('');
  }

  const svg = (W, H, label, body) => `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${body}</svg>`;
  const M = { l: 50, r: 16, t: 26, b: 38 };
  const seconds = v => v + ' s';
  const mkView = (X, a0, a1, top, bottom, inv) => ({ X, a0, a1, top, bottom, inv });

  function anglePlot(o) {
    const bright = range(o.xs.length).filter(i => !(o.dim && o.dim(i))), faint = o.dim ? range(o.xs.length).filter(i => o.dim(i)) : [];
    const pick = (a, idx) => idx.map(i => a[i]);
    if (o.stored) {
      const gap = 7, sh = (o.h - 3 * gap) / 4;
      let s = '', X = null;
      QUAT.forEach(([name, c], k) => {
        const y = o.y + k * (sh + gap), vals = col(o.q, k), [lo, hi] = extent(vals), pad = Math.max((hi - lo) * 0.14, 0.004);
        const dec = hi - lo < 0.01 ? 3 : 2, yf = v => { const t = fx(v, dec); return /^-0\.0+$/.test(t) ? t.slice(1) : t; };
        const two = yf(lo) !== yf(hi) && sh * scale * (hi - lo) / (hi - lo + 2 * pad) >= 16;
        const f = frame({ x: o.x, y, w: o.w, h: sh, xd: o.xd, yd: [lo - pad, hi + pad], xt: o.xt, xf: k === 3 ? o.xf : () => '', xu: o.xu, yt: two ? [lo, hi] : [(lo + hi) / 2],
          yf, xlab: k === 3 ? o.xlab : '', ylab: k === 0 ? o.title : '' });
        X = f.X;
        s += f.svg + `<text class="h" x="${o.x + 7}" y="${y + 14}" style="${figText('note', c)}">${name}</text>`;
        if (o.lines !== false && !o.dim) s += line(o.xs, vals, f.X, f.Y, c, 1.2);
        if (o.dots) s += dots(pick(o.xs, bright), pick(vals, bright), f.X, f.Y, c, o.r || 1.4) + dots(pick(o.xs, faint), pick(vals, faint), f.X, f.Y, c, o.r || 1.4, 0.3);
      });
      return { svg: s, X, Y: null };
    }
    const A = o.A || angles(o.q);
    let lo = Infinity, hi = -Infinity;
    for (const a of A) if (a) for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (o.yd) [lo, hi] = o.yd;
    else { const pad = Math.max((hi - lo) * 0.1, 1.5); lo -= pad; hi += pad; if (hi - lo < 8) { const m = (hi + lo) / 2; lo = m - 4; hi = m + 4; } }
    const pw = o.ends ? o.w - 44 : o.w;
    const f = frame({ x: o.x, y: o.y, w: pw, h: o.h, xd: o.xd, yd: [lo, hi], xt: o.xt, xf: o.xf, xu: o.xu, yf: v => v + '°', xlab: o.xlab, ylab: o.title });
    let s = f.svg;
    const ends = [];
    [2, 1, 0].forEach(k => {
      const c = ANG[k][1], vals = A.map(a => (a ? a[k] : null));
      if (o.lines !== false && !o.dim) s += line(o.xs, vals, f.X, f.Y, c, o.lw || (k ? 1.3 : 1.7));
      if (o.dots) s += dots(pick(o.xs, bright), pick(vals, bright), f.X, f.Y, c, o.r || 1.4) + dots(pick(o.xs, faint), pick(vals, faint), f.X, f.Y, c, o.r || 1.4, 0.3);
      let j = vals.length - 1; while (j > 0 && vals[j] == null) j--;
      if (vals[j] != null) ends.push({ y: f.Y(vals[j]), text: ANG_END[k], c });
    });
    if (o.ends) s += endLabels(ends, o.x + pw + 8, o.y, o.y + o.h);
    return { svg: s, X: f.X, Y: f.Y, A, lo, hi };
  }
  const angItems = W => (W < 520 ? ANG.map(([n, c]) => [n.split(' ')[0], c]) : ANG);
  const angLegend = (W, y, x = 14) => legend(angItems(W), x, y);


  function figWall(W, H) {
    const tiles = WALL.tiles, aw = W - 28;
    let s = `<text x="14" y="15" style="${figText('title')}">${fmt(tiles.length)} synthetic raw recordings, one tile each (${L.users} players)</text>`;
    const names = ['no head in the file', 'too short', 'wrong sampling rate', 'head hardly moves', 'no 10 s piece', 'kept'];
    const fc = WALL.fate_counts, GC = [COL.line3, COL.line3, COL.line3, COL.line2, COL.line2, COL.keep];
    const parts = [[`${fmt(fc[5])} kept`, COL.keep], [`${fmt(fc[3] + fc[4])} rejected at stage 5 or later`, COL.line2], [`${fmt(fc[0] + fc[1] + fc[2])} rejected at stages 2 to 4`, COL.muted]];
    const ly = 34;
    s += `<text x="14" y="${ly}" style="${figText('note')}">` + parts.map(([t, c], i) => `<tspan style="fill:${c}">${i ? ' · ' : ''}${t}</tspan>`).join('') + `</text>`;
    const top = ly + 30, ah = H - top - 6;
    let k = 1, shown, cols, rows, tw, th;
    for (;; k++) {
      shown = tiles.map((_, i) => i).filter(i => i % k === 0 || i === WALL.example);
      cols = Math.max(1, Math.round(Math.sqrt(shown.length * aw / ah / 2.3))); rows = Math.ceil(shown.length / cols);
      tw = aw / cols; th = ah / rows;
      if ((tw >= 17 && th >= 10) || k > 40) break;
    }
    const longest = L.duration_s.longest, bg = FATE_COL.map(() => ''), fgp = FATE_COL.map(() => '');
    let mark = '';
    shown.forEach((ti, n) => {
      const t = tiles[ti], x = 14 + (n % cols) * tw, y = top + Math.floor(n / cols) * th, iw = tw - 3, ih = th - 3;
      bg[t[0]] += `M${x.toFixed(1)} ${y.toFixed(1)}h${iw.toFixed(1)}v${ih.toFixed(1)}h${(-iw).toFixed(1)}z`;
      const env = t[8];
      if (env) {
        const used = Math.max(4, (iw - 3) * Math.min(1, t[1] / longest)), step = used / 16, mid = y + ih / 2, sc = (ih / 2 - 1) / 60;
        for (let b = 0; b < 16; b++) {
          const lo = clamp(env[2 * b], -60, 60), hi = clamp(env[2 * b + 1], -60, 60), y0 = mid - hi * sc, len = Math.max((hi - lo) * sc, 0.8);
          fgp[t[0]] += `M${(x + 1.5 + (b + 0.5) * step).toFixed(1)} ${y0.toFixed(1)}v${len.toFixed(1)}`;
        }
      }
      if (ti === WALL.example) mark = `<rect x="${(x - 1).toFixed(1)}" y="${(y - 1).toFixed(1)}" width="${(iw + 2).toFixed(1)}" height="${(ih + 2).toFixed(1)}" fill="none" stroke="${COL.fg}" stroke-width="1.6"/>`;
    });
    if (shown.length < tiles.length) s = s.replace(`${fmt(tiles.length)} synthetic raw recordings, one tile each`, W < 420 ? `${fmt(shown.length)} of the ${fmt(tiles.length)} synthetic recordings` : `${fmt(shown.length)} of the ${fmt(tiles.length)} synthetic raw recordings`);
    const tip = t => t[1] == null ? 'This file has no head in it at all.' :
      `${fmt(t[1])} s long · ${t[2] == null ? 'no usable rate' : fx(t[2], 0) + ' samples a second'} · ${names[t[0]]}` +
      (t[3] > 1 ? ` · ${fmt(t[3])} rows stamped 0 s` : '') + (t[4] ? ` · ${fmt(t[4])} repeated timestamp${t[4] === 1 ? '' : 's'}` : '') + (t[5] ? ' · clock steps back' : '') +
      (t[6] ? ` · ${fmt(t[6])} hole${t[6] === 1 ? '' : 's'}, longest ${fx(t[7], 1)} s` : '');
    const idle = `The outlined one: ${tip(tiles[WALL.example])}`;
    s += `<text id="dvHover" x="14" y="${ly + 19}" style="${figText('axis', COL.body)}">${esc(W < 620 ? tip(tiles[WALL.example]).split(' · ').slice(0, 3).join(' · ') : idle)}</text>`;
    GC.forEach((c, f) => { if (bg[f]) s += f === 5 ? `<path d="${bg[f]}" fill="${c}"/><path d="${fgp[f]}" stroke="${COL.bg}" stroke-width="${clamp(tw / 20, 1.2, 2.6).toFixed(1)}" fill="none"/>` :
      `<path d="${bg[f]}" fill="${c}" opacity="${f >= 3 ? 0.16 : 0.1}"/><path d="${fgp[f]}" stroke="${c}" stroke-width="${clamp(tw / 22, 1, 2.4).toFixed(1)}" fill="none" opacity="${f >= 3 ? 0.85 : 0.7}"/>`; });
    s += mark + `<rect id="dvHoverBox" width="0" height="0" fill="none" stroke="${COL.fg}" stroke-width="1.2" pointer-events="none"/><g id="dvZoom" pointer-events="none"></g>`;
    const zoom = (t, bx, by) => {
      const zw = Math.min(250, W - 28), zh = 84, zx = clamp(bx + tw / 2 - zw / 2, 8, W - 8 - zw), zy = by - zh - 6 >= top - 30 ? by - zh - 6 : by + th + 6, c = t[0] === 5 ? COL.keep : t[0] >= 3 ? COL.line2 : COL.muted;
      let z = `<rect x="${zx}" y="${zy}" width="${zw}" height="${zh}" fill="${COL.bg}" stroke="${COL.axis}" stroke-width="1"/>`;
      if (!t[8]) return z + `<text x="${zx + zw / 2}" y="${zy + zh / 2 + 4}" text-anchor="middle" style="${figText('note', c)}">no head in this file</text>`;
      const mid = zy + 54, sc = 24 / 60, used = Math.max(24, (zw - 60) * Math.min(1, t[1] / longest)), step = used / 16, ax = figText('axis');
      z += `<text x="${zx + 10}" y="${zy + 16}" style="${figText('note', c)}">${names[t[0]]} · ${fmt(t[1])} s</text>` +
        `<line x1="${zx + 44}" x2="${zx + zw - 10}" y1="${mid}" y2="${mid}" stroke="${COL.axis}"/><text x="${zx + 40}" y="${mid - 18}" text-anchor="end" style="${ax}">60°</text><text x="${zx + 40}" y="${mid + 4}" text-anchor="end" style="${ax}">0°</text><text x="${zx + 40}" y="${mid + 27}" text-anchor="end" style="${ax}">-60°</text>`;
      let d = '';
      for (let b2 = 0; b2 < 16; b2++) { const lo = clamp(t[8][2 * b2], -60, 60), hi = clamp(t[8][2 * b2 + 1], -60, 60); d += `M${(zx + 46 + (b2 + 0.5) * step).toFixed(1)} ${(mid - hi * sc).toFixed(1)}v${Math.max((hi - lo) * sc, 1.5).toFixed(1)}`; }
      return z + `<path d="${d}" stroke="${c}" stroke-width="${Math.max(3, step * 0.6).toFixed(1)}" fill="none"/>`;
    };
    const e = E.one, xs = e.t.map(v => v - e.t[0]);
    return { svg: s, tracks: [{ label: 'The outlined recording', sub: `${fx(e.seconds, 0)} s of it, on repeat`, t: xs, q: e.q_wxyz, views: [] }],
      hover(vx, vy) {
        const c = Math.floor((vx - 14) / tw), r = Math.floor((vy - top) / th), n = r * cols + c;
        if (c < 0 || c >= cols || r < 0 || n >= shown.length) return { text: W < 620 ? tip(tiles[WALL.example]).split(' · ').slice(0, 3).join(' · ') : idle, box: null };
        const text = tip(tiles[shown[n]]);
        return { text: W < 620 ? text.split(' · ').slice(0, 3).join(' · ') : text, box: [14 + c * tw - 1, top + r * th - 1, tw - 1, th - 1], zoom: zoom(tiles[shown[n]], 14 + c * tw, top + r * th) };
      } };
  }

  function figOne(W, H, ctx) {
    const e = E.one, xs = e.t.map(v => v - e.t[0]), top = ctx.stored ? M.t + 20 : M.t + 22;
    const p = anglePlot({ x: M.l, y: top, w: W - M.l - M.r, h: H - top - M.b, xs, q: e.q_wxyz, xd: [0, e.seconds], xu: ' s', stored: ctx.stored, dots: true, r: 1.2, ends: true,
      title: ctx.stored ? 'what the file stores: four numbers per sample (a quaternion)' : '' });
    let s = `<text x="14" y="15" style="${figText('title')}">${fx(e.seconds, 0)} seconds of one recording: ${fmt(e.t.length)} stored samples</text>` + p.svg;
    if (!ctx.stored) {
      const turn = p.A.map(a => a[0]), iMax = turn.indexOf(Math.max(...turn)), iMin = turn.indexOf(Math.min(...turn));
      for (const [i, up] of [[iMax, true], [iMin, false]]) {
        const px = p.X(xs[i]), py = p.Y(turn[i]);
        s += pointer(px, py + (up ? -16 : 16), px, py, COL.turn) + note(`turned ${side(turn[i], 'right', 'left')}`, px, py + (up ? -21 : 29), COL.turn, 'middle', W);
      }
    }
    return { svg: s, tracks: [{ label: 'This recording', sub: 'replayed at its real speed', t: xs, q: e.q_wxyz, views: [mkView(p.X, 0, e.seconds, top, H - M.b)] }] };
  }

  function figFile(W, H) {
    const e = E.raw, n = e.columns, bw = (W - 28) / n, top = 30;
    const kept = new Set([0, ...e.head_columns]);
    const names = ['t'];
    const groups = [{ name: 'time', from: 0, n: 1 }];
    for (const d of e.devices) {
      groups.push({ name: d.joint || d.type || d.name, from: names.length, n: d.axes.length });
      names.push(...d.axes);
    }
    let s = `<text x="14" y="16" style="${figText('title')}">One file is a table: ${fmt(e.frames)} rows × ${n} columns</text>`;
    const ax = figText('axis');
    for (const g of groups) {
      const gx = 14 + g.from * bw;
      s += `<text x="${gx + g.n * bw / 2}" y="${top + 11}" text-anchor="middle" style="${ax}">${esc(g.name)}</text>` +
           `<line x1="${gx + 2}" x2="${gx + g.n * bw - 2}" y1="${top + 16}" y2="${top + 16}" stroke="${COL.axis}"/>`;
    }
    names.forEach((a, i) => {
      const k = kept.has(i), cx0 = 14 + i * bw;
      s += (k ? `<rect x="${(cx0 + 3).toFixed(1)}" y="${top + 43}" width="${(bw - 6).toFixed(1)}" height="2.5" fill="${COL.accent}"/>` : '') +
           `<text class="cn" x="${(cx0 + bw / 2).toFixed(1)}" y="${top + 37}" text-anchor="middle" style="${figText('axis', k ? COL.accent : COL.line3)}">${esc(a)}</text>`;
    });
    s += `<text x="14" y="${top + 66}" style="${figText('title')}"><tspan style="fill:${COL.accent}">the 5 columns we read</tspan>${W < 560 ? '' : ": the time, and the head's direction i, j, k, 1 (a quaternion: x, y, z, w)"}</text>`;
    const n0 = e.t.filter(v => v === 0).length, ty = top + 92, rh = clamp((H - ty - 30) / 9, 15, 34);
    const cw = Math.min(96, (W - 28 - 50) / 5), cx = i => 14 + 50 + (i - 1) * cw;
    const fits = Math.floor((H - ty - 4) / rh) - 1;
    const show = fits >= 8 ? [0, 1, 2, 3, null, n0 - 1, n0, n0 + 1] : fits >= 5 ? [0, 1, 2, null, n0] : [0, 1, n0].slice(0, Math.max(fits, 1));
    s += `<text x="14" y="${ty}" style="${figText('title')}">Its first rows, exactly as stored</text>`;
    ['row', 'time (s)', 'i (x)', 'j (y)', 'k (z)', '1 (w)'].forEach((h, i) => { s += `<text x="${i ? cx(i) + cw - 10 : 22}" y="${ty + rh}" text-anchor="${i ? 'end' : 'start'}" style="${ax}">${h}</text>`; });
    show.forEach((r, k) => {
      const y = ty + rh * (k + 2);
      if (r == null) { s += `<text x="22" y="${y}" style="${ax}">…</text>`; return; }
      const q = e.q_wxyz[r], zero = !unit(q), stuck = e.t[r] === 0 && r > 0, c = zero ? COL.bad : COL.body;
      if (zero || stuck) s += `<rect x="14" y="${y - rh + 5}" width="${50 + 5 * cw}" height="${rh - 2}" fill="${COL.bad}" opacity="${zero ? 0.06 : 0.035}"/>`;
      s += `<text x="22" y="${y}" style="${figText('axis', c)}">${r}</text>`;
      [e.t[r], q[1], q[2], q[3], q[0]].forEach((v, i) => { s += `<text x="${cx(i + 1) + cw - 10}" y="${y}" text-anchor="end" style="${figText('axis', stuck && !i ? COL.bad : c)}">${fx(v, i ? 4 : 3)}</text>`; });
    });
    const nx = cx(6) + 8, room = W - nx > 190;
    if (room) {
      s += note('row 0 is empty: four zeros point nowhere', nx, ty + rh * 2, COL.bad, 'start', W) +
           note(`rows 1 to ${n0 - 1}: the clock has not started,`, nx, ty + rh * 3.5, COL.bad, 'start', W) + note('yet the numbers keep changing', nx, ty + rh * 3.5 + 18 / scale, COL.bad, 'start', W) +
           note(`row ${n0}: time starts to run`, nx, ty + rh * 8, COL.fg, 'start', W);
    }
    return s;
  }

  function hbars(W, H, title, rows, color, note2) {
    const max = Math.max(...rows.map(r => r[1])), lw = Math.min(W < 520 ? 150 : 250, Math.max(...rows.map(r => textW(r[0], 'axis'))) * FS() + 12);
    const top = 34, bh = (H - top - (note2 ? 34 : 8)) / rows.length, bt = Math.min(bh * 0.5, 28), bw = W - lw - 100;
    let s = `<text x="14" y="16" style="${figText('title')}">${title}</text>`;
    rows.forEach(([label, v], i) => {
      const y = top + i * bh, w = Math.max(v ? 2 : 0, v / max * bw), cy = y + bh / 2;
      s += `<text x="${14 + lw - 8}" y="${(cy + 4.5 / scale).toFixed(1)}" text-anchor="end" style="${figText('axis')}">${esc(label)}</text>` +
           `<rect x="${14 + lw}" y="${(cy - bt / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${bt.toFixed(1)}" fill="${color}"/>` +
           `<text x="${(14 + lw + w + 8).toFixed(1)}" y="${(cy + 4.5 / scale).toFixed(1)}" style="${figText('axis', COL.body)}">${fmt(v)}</text>`;
    });
    if (note2) s += `<text x="${14 + lw}" y="${Math.min(H - 8, top + rows.length * bh + 22)}" style="${figText('axis')}">${note2}</text>`;
    return s;
  }

  function figPile(W, H) {
    const r = P.rec_per_user, e = r.edges;
    const label = i => i === e.length - 1 ? `over ${fmt(e[i] - 1)}` : e[i + 1] - e[i] === 1 ? fmt(e[i]) : `${fmt(e[i])} to ${fmt(e[i + 1] - 1)}`;
    return hbars(W, H, W < 520 ? 'Recordings per player' : `Recordings per player, in the ${fmt(P.users)} archives we checked`,
      r.hist.map((v, i) => [label(i) + (W < 520 ? '' : i ? ' recordings' : ' recording'), v]), COL.line3,
      W < 520 ? `half have ${fmt(r.median)} or fewer, one has ${fmt(r.max)}` : `players per bin · half the players have ${fmt(r.median)} or fewer, one has ${fmt(r.max)}`);
  }

  function figDevices(W, H) {
    const panels = [[E.raw, true], [E.excluded, false]], pw = (W - 42) / 2;
    const icon = (d, x, y, c) => {
      if (d.type === 'HMD' || d.joint === 'HEAD') return `<rect x="${x}" y="${y + 4}" width="26" height="14" rx="4" fill="none" stroke="${c}" stroke-width="1.6"/><path d="M${x} ${y + 8}q13 -12 26 0" fill="none" stroke="${c}" stroke-width="1.6"/>`;
      if (d.type === 'CONTROLLER') return `<path d="M${x + 4} ${y + 11}a8 7 0 1 1 16 0" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/><path d="M${x + 12} ${y + 10}v11" stroke="${c}" stroke-width="3.2" stroke-linecap="round"/>`;
      return `<path d="M${x + 3} ${y + 20}l14 -14" stroke="${c}" stroke-width="3" stroke-linecap="round"/><path d="M${x + 17} ${y + 6}l5 -5" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`;
    };
    let s = `<line x1="${(14 + pw + 14).toFixed(1)}" x2="${(14 + pw + 14).toFixed(1)}" y1="14" y2="${H - 14}" stroke="${COL.faint}"/>`;
    panels.forEach(([e, ok], k) => {
      const x = 14 + k * (pw + 14) + (k ? 14 : 0), c = ok ? COL.keep : COL.bad;
      s += tag(x, 32, ok ? 'KEPT' : 'SKIPPED', c) + `<text x="${x + 8 + tagWidth(ok ? 'KEPT' : 'SKIPPED')}" y="33" style="${figText('note', COL.fg)}">${esc(e.game)}</text>` +
           `<text x="${x}" y="54" style="${figText('axis')}">${pw > 260 ? 'the file says it tracks' : 'tracks'} ${e.devices.length} device${e.devices.length === 1 ? '' : 's'}:</text>`;
      const dh = clamp((H - 130) / Math.max(e.devices.length, 3), 50, 92);
      e.devices.forEach((d, i) => {
        const y = 68 + i * dh, head = d.type === 'HMD' || d.joint === 'HEAD', max = Math.floor((pw - 64) / 7.2);
        s += icon(d, x, y, head ? COL.accent : COL.muted) +
             `<text x="${x + 36}" y="${y + 10}" style="${figText('axis', COL.fg)}">${esc(d.name.length > max ? d.name.slice(0, max - 1) + '…' : d.name)}</text>` +
             `<text x="${x + 36}" y="${y + 25}" style="${figText('axis')}">${esc((d.joint || d.type || '').toLowerCase().replace('_', ' '))}</text>`;
        const cp = Math.min(24, (pw - 58) / d.axes.length);
        if (dh >= 58) d.axes.forEach((a, j) => {
          const rot = head && ['i', 'j', 'k', '1'].includes(a), cx = x + 36 + j * cp;
          s += (rot ? `<rect x="${(cx + 2).toFixed(1)}" y="${y + 47}" width="${(cp - 4).toFixed(1)}" height="2.5" fill="${COL.accent}"/>` : '') +
               `<text class="cn" x="${(cx + cp / 2).toFixed(1)}" y="${y + 42}" text-anchor="middle" style="${figText('axis', rot ? COL.accent : COL.line3)}">${esc(a)}</text>`;
        });
      });
      s += note(pw > 280 ? (ok ? 'a headset that reports its direction' : 'only a brush: no head to follow') : (ok ? 'has a headset' : 'no head'), x, Math.min(H - 24, 68 + Math.max(e.devices.length, 1) * dh + 16), c, 'start', W);
    });
    const o = E.one, xs = o.t.map(v => v - o.t[0]);
    return { svg: s, tracks: [{ label: 'Beat Saber file', sub: 'a head to follow', t: xs, q: o.q_wxyz, views: [], color: COL.keep },
      { label: 'Tilt Brush file', sub: 'nothing to draw', none: true, noneText: 'no head in this file', t: [0, 1], q: [], views: [] }] };
  }

  function figStart(W, H, ctx) {
    const e = E.raw, n = e.t.length, n0 = e.t.filter(v => v === 0).length, kc = e.invalid_samples + e.trimmed_samples;
    const solo = W < 420, R = Math.min(n0 + 14, 44), top = M.t + 18;
    const lw = solo ? 0 : Math.round((W - M.l - M.r) * 0.36), lh = H - top - M.b;
    const rx = solo ? M.l : M.l + lw + 52, rw = W - rx - M.r, ry = top, rh = H - ry - M.b;
    const idx = range(n);
    const A = angles(e.q_wxyz);
    const pl = solo ? null : anglePlot({ x: M.l, y: top, w: lw, h: lh, xs: idx.slice(0, R + 1), q: e.q_wxyz.slice(0, R + 1), A: A.slice(0, R + 1), xd: [-1, R], stored: ctx.stored, dots: true, r: 2.4, lines: false, ends: true,
      xlab: 'row number in the file', title: lw < 200 ? `its first ${R} rows` : `the first ${R} rows, one by one` });
    let s = '';
    const yb = top + lh, wide = lw >= 230;
    const sh = (lh - 21) / 4, yLow = ctx.stored ? top + sh * 1.5 + 11 : yb - 10, yLowR = ctx.stored ? ry + sh / 2 + 4 : ry + rh - 10;
    if (pl) s += pl.svg + region(pl.X(0.5), top, pl.X(n0 - 0.5), top + lh, COL.bad) +
         `<path d="M${pl.X(0).toFixed(1)} ${yLow + 1}l-5 -5m5 5l5 -5m-5 5l-5 5m5 -5l5 5" stroke="${COL.bad}" stroke-width="2" fill="none" transform="translate(0 -6)"/>` +
         note('row 0: empty', pl.X(0) + 9, yLow, COL.bad, 'start', W) +
         note(wide ? `rows 1 to ${n0 - 1}: all stamped 0 s` : `${n0 - 1} rows at 0 s`, pl.X(n0 / 2), ctx.stored ? top + (lh - 21) / 8 + 4 : top + 16, COL.bad, 'middle', M.l + lw + 40);
    if (pl && !ctx.stored) {
      let big = 0, at = 1;
      for (let i = 2; i < n0; i++) { const a = unit(e.q_wxyz[i - 1]), b = unit(e.q_wxyz[i]); if (!a || !b) continue; const d = deg(2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])))); if (d > big) { big = d; at = i; } }
      const k = [0, 1, 2].reduce((m, j) => (Math.abs(A[at][j] - A[at - 1][j]) > Math.abs(A[at][m] - A[at - 1][m]) ? j : m), 0);
      const px = pl.X(at - 0.5), py = (pl.Y(A[at][k]) + pl.Y(A[at - 1][k])) / 2;
      s += pointer(px + 26, py, px + 3, py, COL.fg) + note(wide ? `the head jumps ${fx(big, 0)}°` : `jumps ${fx(big, 0)}°`, px + 31, py + 4, COL.fg, 'start', M.l + lw + 50);
    }
    const pr = anglePlot({ x: rx, y: ry, w: rw, h: rh, xs: e.t, q: e.q_wxyz, A, xd: [0, 8], xu: ' s', stored: ctx.stored, dots: true, r: 1.3, dim: i => i < kc, ends: true,
      title: 'its first 8 seconds' });
    s += region(pr.X(0), ry, pr.X(e.trim_s), ry + rh, COL.bad, { only: 'end', dash: true }) + pr.svg +
         note(rw > 300 ? `first ${fx(e.trim_s, 0)} s: thrown away` : `${fx(e.trim_s, 0)} s: cut`, pr.X(e.trim_s / 2), yLowR, COL.bad, 'middle', W) +
         note(rw > 300 ? 'kept from here' : 'kept', pr.X(e.trim_s) + 8, yLowR, COL.keep, 'start', W);
    if (solo) s += note(`${n0} rows at 0 s: the head jumps`, pr.X(0) + 8, ry + 16, COL.bad, 'start', W);
    const rowAt = px => { const tt = (px - pr.X(0)) / (pr.X(8) - pr.X(0)) * 8; let i = 0; while (i < n - 1 && e.t[i] < tt) i++; return i; };
    return { svg: s, tracks: [{ label: 'The start of this recording', sub: 'row by row', t: idx, q: e.q_wxyz, speed: n / 8, start: 0,
      views: (pl ? [mkView(pl.X, 0, R, top, yb)] : []).concat([mkView(a => pr.X(e.t[Math.round(a)]), 0, n - 1, ry, ry + rh, rowAt)]) }] };
  }

  function figFreeze(W, H, ctx) {
    const e = E.freeze, top = M.t + 6, gap = 44, th = Math.round((H - top - M.b - gap) * 0.36), by = top + th + gap, bh = H - by - M.b;
    const xd = [e.row[0], e.row[e.row.length - 1]], w = W - M.l - M.r - 8, x = M.l + 8;
    const [lo, hi] = extent(e.t), pad = (hi - lo) * 0.1;
    const ft = frame({ x, y: top, w: ctx.stored ? w : w - 44, h: th, xd, yd: [lo - pad, hi + pad], xf: () => '', yf: v => fx(v, 0) + ' s', ylab: 'the time written on each row' });
    const pb = anglePlot({ x, y: by, w, h: bh, xs: e.row, q: e.q_wxyz, xd, xf: fmt, stored: ctx.stored, ends: true, xlab: 'row number in the file', title: W < 520 ? '' : 'what the head was doing in those rows' });
    const x0 = ft.X(e.first_row), x1 = ft.X(e.last_row);
    let s = region(x0, top, x1, H - M.b, COL.bad) + ft.svg + pb.svg +
      line(e.row, e.t, ft.X, ft.Y, COL.line2, 1.6) +
      `<path d="M${x0.toFixed(1)} ${ft.Y(e.timestamp_s).toFixed(1)}H${x1.toFixed(1)}" stroke="${COL.bad}" stroke-width="3"/>` +
      note(`${fmt(e.rows_in_run)} rows, all stamped ${fx(e.timestamp_s, 2)} s`, (x0 + x1) / 2, ft.Y(e.timestamp_s) - 9, COL.bad, 'middle', W) +
      note(`…while the head turns ${fx(e.turn_span_deg, 0)}°`, (x0 + x1) / 2, by + 16, COL.fg, 'middle', W) +
      note(W < 520 ? `first kept, ${fmt(e.rows_in_run - 1)} dropped` : `we keep the first of these rows and drop the other ${fmt(e.rows_in_run - 1)}`, (x0 + x1) / 2, by + bh - 9, COL.bad, 'middle', W);
    const speed = 4 * 1000 / e.usual_step_ms;
    return { svg: s, tracks: [{ label: 'These rows, in file order', sub: 'replayed 4× faster', t: e.row, q: e.q_wxyz, clock: e.t, speed,
      views: [mkView(ft.X, xd[0], xd[1], top, top + th), mkView(pb.X, xd[0], xd[1], by, by + bh)] }] };
  }

  function figClock(part) {
    return (W, H) => {
      const t = part.t, i0 = part.first_index, idx = t.map((_, i) => i0 + i), [lo, hi] = extent(t), pad = (hi - lo) * 0.1 || 0.01;
      const f = frame({ x: M.l + 12, y: M.t, w: W - M.l - M.r - 12, h: H - M.t - M.b, xd: [i0, i0 + t.length - 1], yd: [lo - pad, hi + pad],
        yf: v => fx(v, 1) + ' s', xlab: 'row number in the file', ylab: 'the time written on each row' });
      const rep = [], back = [], ok = [];
      t.forEach((v, i) => (i && v === t[i - 1] ? rep : i && v < t[i - 1] ? back : ok).push(i));
      let s = f.svg + dots(ok.map(i => idx[i]), ok.map(i => t[i]), f.X, f.Y, COL.line2, 2) +
        dots(rep.map(i => idx[i]), rep.map(i => t[i]), f.X, f.Y, COL.bad, 2.3);
      for (const i of back) {
        const xa = f.X(idx[i - 1]), ya = f.Y(t[i - 1]), xb = f.X(idx[i]), yb = f.Y(t[i]);
        s += `<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="${COL.bad}" stroke-width="2.5"/><circle cx="${xb}" cy="${yb}" r="4.5" fill="${COL.bad}"/>` +
             note(`the clock jumps back ${fx(t[i - 1] - t[i], 1)} s`, xb + 12, (ya + yb) / 2 + 4, COL.bad, 'start', W);
      }
      if (rep.length) { const m = rep[rep.length >> 1]; s += note(`${fmt(rep.length + 1)} rows in a row with the same time`, f.X(idx[m]), f.Y(t[m]) - 12, COL.bad, 'middle', W); }
      if (ok.length > 4) { const m = ok[Math.floor(ok.length * 0.6)]; s += note('a healthy clock: every row a little later', f.X(idx[m]) - 10, f.Y(t[m]) - 12, COL.body, 'end', W); }
      if (!part.q_wxyz) return s;
      const fwd = t.slice(1).map((v, i) => v - t[i]).filter(d => d > 0), pace = fwd.length / fwd.reduce((m, d) => m + d, 0);
      return { svg: s, tracks: [{ label: 'These rows, in file order', sub: 'at the clock\'s usual pace', t: idx, q: part.q_wxyz, clock: t, speed: pace,
        views: [mkView(f.X, idx[0], idx[idx.length - 1], M.t, H - M.b)] }] };
    };
  }

  function figFlip(W, H) {
    const e = E.flip, n = e.t.length, xs = e.t.map(v => v - e.t[0]), xd = [0, xs[n - 1]], at = e.flip_rows_in_view;
    const three = H >= 330, top = M.t, gap = 34, k = three ? 3 : 2, ph = (H - top - M.b - gap * (k - 1)) / k, w = W - M.l - M.r;
    const xf = v => fx(v, 1);
    const stored = (y, q, title, last) => {
      const f = frame({ x: M.l, y, w: w - 44, h: ph, xd, yd: [-1.08, 1.08], yt: [-1, 0, 1], xf: last ? xf : () => '', xu: last ? ' s' : '', ylab: title });
      const ends = endLabels(QUAT.map(([name, c], j) => ({ y: f.Y(q[n - 1][j]), text: name, c })), M.l + w - 36, y, y + ph);
      return { f, svg: f.svg + QUAT.map(([, c], j) => line(xs, col(q, j), f.X, f.Y, c, 1.3) + dots(xs, col(q, j), f.X, f.Y, c, 1.7)).join('') + ends };
    };
    const a = stored(top, e.before_wxyz, W < 520 ? 'as stored' : 'before: the four numbers as stored');
    const y2 = top + ph + gap;
    const p = anglePlot({ x: M.l, y: y2, w, h: ph, xs, q: e.before_wxyz, xd, xf: three ? () => '' : xf, xu: three ? '' : ' s', dots: true, r: 1.7, ends: true, title: W < 520 ? 'the head itself: one smooth turn' : 'the head itself in the same rows: one smooth turn, no jump' });
    let s = a.svg + p.svg;
    const views = [mkView(a.f.X, xd[0], xd[1], top, top + ph), mkView(p.X, xd[0], xd[1], y2, y2 + ph)];
    if (three) {
      const y3 = y2 + ph + gap, c = stored(y3, e.after_wxyz, 'after: signs made to agree. The same head, no jump', true);
      s += c.svg;
      views.push(mkView(c.f.X, xd[0], xd[1], y3, y3 + ph));
    }
    for (const r of at) {
      const px = a.f.X((xs[r - 1] + xs[r]) / 2);
      s += `<line x1="${px}" x2="${px}" y1="${top}" y2="${H - M.b}" stroke="${COL.bad}" stroke-dasharray="4 4"/>`;
    }
    const px = a.f.X(xs[at[0]]);
    s += note('all four numbers change sign', px + 10, a.f.Y(0.5) + 4, COL.bad, 'start', W);
    return { svg: s, tracks: [{ label: 'These rows', sub: 'slowed to a quarter speed', t: xs, q: e.before_wxyz, speed: 0.25, views }] };
  }

  function figShort(W, H, ctx) {
    const e = E.too_short, n = e.t.length, end = e.t[n - 1], top = M.t + 18, xmax = Math.max(e.trim_s * 1.25, end);
    const p = anglePlot({ x: M.l, y: top, w: W - M.l - M.r, h: H - top - M.b, xs: e.t, q: e.q_wxyz, xd: [0, xmax], xu: ' s', stored: ctx.stored, dots: true, r: 1.5, dim: () => true,
      title: 'the whole recording' });
    const xe = p.X(end), xc = p.X(e.trim_s);
    let s = region(p.X(0), top, xc, H - M.b, COL.bad, { only: 'end', dash: true }) + p.svg +
      `<line x1="${xe}" x2="${xe}" y1="${top}" y2="${H - M.b}" stroke="${COL.fg}" stroke-width="1.5"/>` +
      note(`it ends after ${fx(end, 1)} s`, xe - 8, top + 18, COL.fg, 'end', W) +
      note(`the ${fx(e.trim_s, 0)} s cut ends here`, xc - 8, H - M.b - 10, COL.bad, 'end', W) +
      note('nothing is left: rejected', xe + 8, top + 18, COL.bad, 'start', W);
    if (!ctx.stored) {
      let j = n - 1; while (j > 0 && !p.A[j]) j--;
      if (p.A[j]) s += endLabels([0, 1, 2].map(k => ({ y: p.Y(p.A[j][k]), text: ANG_END[k], c: ANG[k][1] })), xe + 8, top, H - M.b);
    }
    const rowAt = px => { const tt = (px - p.X(0)) / (p.X(xmax) - p.X(0)) * xmax; let i = 0; while (i < n - 1 && e.t[i] < tt) i++; return i; };
    return { svg: s, tracks: [{ label: 'All of this recording', sub: `${fx(end, 1)} s`, t: range(n), q: e.q_wxyz, speed: n / end, color: COL.bad,
      views: [mkView(a => p.X(e.t[Math.round(a)]), 0, n - 1, top, H - M.b, rowAt)] }] };
  }

  function figRateRows(W, H) {
    const keys = Object.keys(E.rate).sort((a, b) => E.rate[a].source_rate_hz - E.rate[b].source_rate_hz), [bl, bh] = C.RATE_BAND_HZ, span = 200;
    const x0 = 18, w = W - 36, top = 44, rowH = (H - top - 34) / (keys.length + 1), X = ms => x0 + ms / span * w, step = 1000 / C.H5_RATE_HZ;
    let s = `<text x="14" y="16" style="${figText('title')}">${W < 520 ? 'A fifth of a second: one dot = one sample' : 'One fifth of a second of four recordings: each dot is one stored sample'}</text>`, guide = '', grid = '';
    for (let ms = 0; ms <= span + 1e-6; ms += step) { guide += `M${X(ms).toFixed(1)} ${top + 8}V${H - 30}`; grid += `M${X(ms).toFixed(1)} ${top + 16}h0`; }
    s += `<path d="${guide}" stroke="${COL.faint}"/>` + `<text x="${x0}" y="${top}" style="${figText('note', COL.line2)}">what the model needs: ${C.H5_RATE_HZ} a second${W < 520 ? '' : `, one every ${step} ms`}</text>` +
      `<path d="${grid}" stroke="${COL.line2}" stroke-width="6" stroke-linecap="round" fill="none"/>`;
    keys.forEach((k, i) => {
      const e = E.rate[k], y = top + (i + 1) * rowH, hz = e.source_rate_hz, ok = hz >= bl && hz <= bh, c = ok ? COL.keep : COL.bad;
      let d = '', tms = 0, cnt = 0;
      for (const dt of [0, ...e.dt_ms]) { tms += dt; if (tms > span) break; d += `M${X(tms).toFixed(1)} ${y + 16}h0`; cnt++; }
      s += `<text x="${x0}" y="${y}" style="${figText('note', c)}">${fx(hz, 0)} ${W < 520 ? 'a second' : 'samples a second'}</text>` +
        note(W < 520 ? (ok ? 'kept' : hz < bl ? 'too slow: dropped' : 'too fast: dropped') : ok ? `between ${bl} and ${bh}: kept` : hz < bl ? `not ${C.H5_RATE_HZ}: too slow, dropped` : `not ${C.H5_RATE_HZ}: too fast, dropped`, W - 18, y, c, 'end', W) +
        `<path d="${d}" stroke="${c}" stroke-width="7" stroke-linecap="round" fill="none"/>`;
    });
    for (const ms of [0, 50, 100, 150, 200]) s += `<text x="${X(ms)}" y="${H - 12}" text-anchor="${ms ? (ms === span ? 'end' : 'middle') : 'start'}" style="${figText('axis')}">${ms} ms</text>`;
    return s;
  }

  function figRateHist(W, H) {
    const h = P.hz.hist_1hz, lo = 30, hi = 160, [bl, bh] = C.RATE_BAND_HZ;
    const max = Math.max(...h.slice(lo, hi));
    const f = frame({ x: M.l + 14, y: M.t, w: W - M.l - M.r - 14, h: H - M.t - M.b, xd: [lo, hi], yd: [0, max * 1.12],
      xt: [40, 72, 90, 120, 144], xu: ' Hz', yf: fmt, ylab: 'recordings' });
    let s = f.svg + region(f.X(bl), M.t, f.X(bh), H - M.b, COL.keep, { fill: 0 });
    const bw = f.X(lo + 1) - f.X(lo);
    let keep = '', drop = '';
    for (let i = lo; i < hi; i++) {
      if (!h[i]) continue;
      const d = `M${f.X(i).toFixed(1)} ${f.Y(0).toFixed(1)}v${(f.Y(h[i]) - f.Y(0)).toFixed(1)}h${Math.max(bw - 0.6, 1).toFixed(1)}V${f.Y(0).toFixed(1)}z`;
      if (i >= bl && i + 1 <= bh) keep += d; else drop += d;
    }
    s += `<path d="${drop}" fill="${COL.bad}"/><path d="${keep}" fill="${COL.keep}"/>` +
      note(`kept: ${bl} to ${bh} a second`, f.X(bh) + 6, M.t + 12, COL.keep, 'start', W);
    for (const i of PEAKS) {
      if (i < lo || i >= hi) continue;
      const inBand = i >= bl && i + 1 <= bh, px = f.X(i + 0.5), py = f.Y(h[i]);
      s += note(`${fmt(h[i])}`, px, Math.max(py - 6, M.t + 30), inBand ? COL.keep : COL.bad, i > 120 ? 'end' : i < 76 ? 'end' : 'start', W);
    }
    return s;
  }

  function figJitter(W, H) {
    const keys = Object.keys(E.rate), [bl, bh] = C.RATE_BAND_HZ;
    const all = keys.flatMap(k => E.rate[k].dt_ms).sort((a, b) => a - b), top = Math.ceil(all[Math.floor(all.length * 0.995)] * 1.15);
    const lw = W < 520 ? 30 : 92, pw = W - M.l - M.r - lw;
    const bottom = Math.max(0, Math.floor(all[Math.floor(all.length * 0.005)] * 0.85));
    const f = frame({ x: M.l, y: M.t, w: pw, h: H - M.t - M.b, xd: [0, 299], yd: [bottom, top],
      xlab: '300 samples in a row', ylab: `gap between one sample and the next (ms)${bottom ? `; the scale starts at ${bottom} ms, not 0` : ''}` });
    let s = f.svg + region(M.l, f.Y(1000 / bl), M.l + pw, f.Y(1000 / bh), COL.keep, { across: true });
    const ends = [];
    keys.forEach(k => {
      const e = E.rate[k], hz = e.source_rate_hz, ok = hz >= bl && hz <= bh, c = ok ? COL.keep : COL.bad;
      const dt = e.dt_ms.map(v => clamp(v, bottom, top)), mid = dt.slice().sort((a, b) => a - b)[dt.length >> 1];
      s += dots(dt.map((_, i) => i), dt, f.X, f.Y, c, 1.5, ok ? 1 : 0.7);
      ends.push({ y: f.Y(mid), text: fx(hz, 0) + (W < 520 ? '' : ' a second'), c });
    });
    s += endLabels(ends, M.l + pw + 8, M.t, M.t + H - M.t - M.b) +
      note(W < 520 ? 'kept band' : `kept band: ${bl} to ${bh} a second`, M.l + 8, f.Y(1000 / bh) + 15, COL.keep, 'start', W);
    return s;
  }

  function figMotion(W, H, ctx) {
    const S0 = C.SWEEP_MIN_DEG, V0 = C.VELOCITY_MIN_DEG_S, top = M.t + 2, gap = 48, ph = (H - top - M.b - gap) / 2, w = W - M.l - M.r;
    const sets = [[E.still, false], [E.moving, true]].map(([e, ok]) => ({ e, ok, xs: e.t.map(v => v - e.windows[0].start_s), A: angles(e.q_wxyz) }));
    let spanMax = 0;
    for (const st of sets) { const v = st.A.flat(), [lo, hi] = extent(v); st.mid = (lo + hi) / 2; spanMax = Math.max(spanMax, hi - lo); }
    const half = spanMax * 0.56, tracks = [];
    let s = '';
    sets.forEach((st, k) => {
      const { e, ok, xs } = st, y = top + k * (ph + gap), c = ok ? COL.keep : COL.bad, len = e.windows.length * C.WINDOW_S;
      const p = anglePlot({ x: M.l, y, w, h: ph, xs, q: e.q_wxyz, A: st.A, xd: [0, len], xt: range(e.windows.length + 1).map(i => i * C.WINDOW_S), xf: k ? String : () => '', xu: ' s', stored: ctx.stored,
        yd: [st.mid - half, st.mid + half], ends: true });
      const label = ok ? 'KEPT' : 'REJECTED';
      s += p.svg + tag(M.l, y - 8, label, c) +
        `<text x="${M.l + tagWidth(label) + 8}" y="${y - 8}" style="${figText('title')}">${W < 520 ? `swing ${fx(e.sweep_deg, 1)}° (needs ${S0}°)` : `typical swing ${fx(e.sweep_deg, 1)}° at ${fx(e.velocity_deg_s, 1)}°/s · needs over ${S0}° and ${V0}°/s`}</text>`;
      e.windows.forEach((wd, i) => {
        const xa = p.X(i * C.WINDOW_S), xb = p.X((i + 1) * C.WINDOW_S);
        if (i) s += `<line x1="${xa}" x2="${xa}" y1="${y}" y2="${y + ph}" stroke="${COL.axis}" stroke-dasharray="2 5"/>`;
        if (w > 520) s += `<text class="ho" x="${(xa + xb) / 2}" y="${y + ph - 8}" text-anchor="middle" style="${figText('axis')}">${fx(C.WINDOW_S, 0)} s window: swing ${fx(Math.max(...wd.sweep_xyz_deg), 1)}°</text>`;
      });
      const swing = fx(Math.max(...e.windows.map(wd => Math.max(...wd.sweep_xyz_deg))), 0);
      s += note(ok ? (W < 520 ? `swings ${swing}°` : `the head swings ${swing}° from side to side`) : 'the head never moves', M.l + w / 2, ph < 90 ? y + ph - 6 : y + 22, c, 'middle', W);
      tracks.push({ label: ok ? 'Kept' : 'Rejected', sub: ok ? 'a moving head' : 'a still head', t: xs, q: e.q_wxyz, color: c, views: [mkView(p.X, 0, len, y, y + ph)] });
    });
    return { svg: s, tracks };
  }

  function figScatter(W, H) {
    const S0 = C.SWEEP_MIN_DEG, V0 = C.VELOCITY_MIN_DEG_S;
    const span = k => { const v = P.sv.sample.map(p => p[k]).filter(x => x > 0).sort((a, b) => a - b); return [v[Math.floor(v.length * 0.002)] / 1.4, v[Math.floor(v.length * 0.998)] * 1.4]; };
    const xd = span(0), yd = span(1);
    const decades = d => [0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000].filter(v => v >= d[0] && v <= d[1]);
    const f = frame({ x: M.l, y: M.t, w: W - M.l - M.r, h: H - M.t - M.b, xd, yd, xlog: true, ylog: true,
      xt: decades(xd).concat(S0), yt: decades(yd).concat(V0), xf: v => v + '°', yf: v => v + '°/s', xlab: 'how far the head swings (degrees)', ylab: 'how fast it moves (degrees per second)' });
    const clampX = v => Math.min(Math.max(v, xd[0]), xd[1]), clampY = v => Math.min(Math.max(v, yd[0]), yd[1]);
    const pass = P.sv.sample.filter(p => p[2]), fail = P.sv.sample.filter(p => !p[2]);
    const q = P.sv.quadrants;
    let s = f.svg +
      `<line x1="${f.X(S0)}" x2="${f.X(S0)}" y1="${M.t}" y2="${H - M.b}" stroke="${COL.line3}" stroke-dasharray="3 4"/>` +
      `<line x1="${M.l}" x2="${W - M.r}" y1="${f.Y(V0)}" y2="${f.Y(V0)}" stroke="${COL.line3}" stroke-dasharray="3 4"/>` +
      dots(fail.map(p => clampX(p[0])), fail.map(p => clampY(p[1])), f.X, f.Y, COL.bad, 1.15, 0.42) +
      dots(pass.map(p => clampX(p[0])), pass.map(p => clampY(p[1])), f.X, f.Y, COL.keep, 1.8);
    s += note(`${fmt(q['S_ok,V_ok'] || 0)} kept: far and fast enough`, W - M.r - 8, M.t + 18, COL.keep, 'end', W) +
         note(`${fmt(q['S_low,V_ok'] || 0)} swing too little`, M.l + 8, M.t + 18, COL.bad, 'start', W) +
         note(`${fmt(q['S_low,V_low'] || 0)} too little and too slow`, M.l + 8, H - M.b - 10, COL.bad, 'start', W) +
         note(`${fmt(q['S_ok,V_low'] || 0)} too slow`, W - M.r - 8, H - M.b - 10, COL.bad, 'end', W);
    return s;
  }

  function figResample(e, showPieces) {
    return (W, H, ctx) => {
      const bt = e.before.t, x0 = bt[0], x1 = bt[bt.length - 1];
      let s = '', top = 8;
      if (showPieces) {
        const [a, b] = e.cleaned_span_s, px = v => 14 + (v - a) / (b - a) * (W - 28);
        s += `<text x="14" y="${top + 12}" style="${figText('title')}">The whole recording after the ${fx(C.TRIM_S, 0)} s cut (${fx(b - a, 1)} s)</text>`;
        e.pieces.forEach((p, i) => {
          const w = Math.max(px(p.t1) - px(p.t0), 3), c = p.kept ? COL.keep : COL.bad, mid = px(p.t0) + w / 2;
          const right = mid > W * 0.6;
          s += `<rect x="${px(p.t0).toFixed(1)}" y="${top + 24}" width="${w.toFixed(1)}" height="8" fill="${c}"/>` +
               `<text x="${right ? W - 14 : Math.max(px(p.t0), 14)}" y="${top + 52 + (i % 2) * 15}" text-anchor="${right ? 'end' : 'start'}" style="${figText('note', c)}">` +
               `${fmt(p.samples)} new samples (${fx(p.samples / C.H5_RATE_HZ, 1)} s): ${p.kept ? 'kept' : 'dropped, under ' + fmt(C.H5_MIN_SAMPLES)}</text>`;
        });
        s += `<path d="M${px(x0).toFixed(1)} ${top + 17}v22M${px(x1).toFixed(1)} ${top + 17}v22" stroke="${COL.fg}" stroke-width="1.5"/>`;
        top += 78;
      }
      const railH = 20, plotY = top + 2 * railH + 34, ph = H - plotY - M.b;
      let k, ylab, bv, av;
      if (ctx.stored) {
        const comp = [0, 1, 2, 3].map(j => { const [lo, hi] = extent(col(e.before.q_wxyz, j)); return hi - lo; });
        k = comp.indexOf(Math.max(...comp)); bv = col(e.before.q_wxyz, k); av = e.after.map(a => col(a.q_wxyz, k));
        ylab = `quaternion ${QUAT[k][0]}, as stored`;
      } else {
        const A = angles(e.before.q_wxyz), spans = [0, 1, 2].map(j => { const [lo, hi] = extent(col(A, j)); return hi - lo; });
        k = spans.indexOf(Math.max(...spans)); bv = col(A, k);
        av = e.after.map(a => { const v = col(angles(a.q_wxyz), k); if (!v.length) return v; let j = 0; while (j < bt.length - 1 && bt[j] < a.t[0]) j++; const off = Math.round((bv[j] - v[0]) / 360) * 360; return v.map(x => x + off); });
        ylab = ANG[k][0] + ', in degrees';
      }
      const [lo, hi] = extent(bv), pad = (hi - lo) * 0.14 || 0.01;
      const pw = W - M.l - M.r, xs = x1 - x0, xd = xs < 1.5 ? 2 : xs < 15 ? 1 : 0;
      const f = frame({ x: M.l, y: plotY, w: pw, h: ph, xd: [x0, x1], yd: [lo - pad, hi + pad],
        xf: v => fx(v, xd), xu: ' s', yf: v => ctx.stored ? fx(v, 3) : +v.toFixed(1) + '°', ylab: W < 520 ? ylab.split(',')[0] : ylab });
      const rail = (y, name, ts, c) => {
        let d = '', last = -Infinity;
        for (const v of ts) { const px = f.X(v); if ((px - last) * scale < 3) continue; d += `M${px.toFixed(1)} ${y}v${railH - 6}`; last = px; }
        return `<text x="${M.l - 6}" y="${y + 11}" text-anchor="end" style="${figText('axis', c)}">${name}</text>` + (d ? `<path d="${d}" stroke="${c}" stroke-width="${(1 / scale).toFixed(2)}"/>` : '');
      };
      const at = e.after.flatMap(a => a.t);
      s += rail(top + 8, 'stored', bt, COL.accent) + rail(top + 8 + railH, 'new', at, COL.line2);
      s += f.svg;
      const steps = bt.slice(1).map((v, i) => v - bt[i]), big = Math.max(...steps), j = steps.indexOf(big);
      if (big > 2 * median(steps)) {
        const filled = big <= C.H5_MAX_GAP_S, c = filled ? COL.body : COL.bad, ha = f.X(bt[j]), hb = f.X(bt[j + 1]), hy = top + 6, hh = H - M.b - top - 6;
        s += `<rect x="${ha.toFixed(1)}" y="${hy}" width="${(hb - ha).toFixed(1)}" height="${hh}" fill="${filled ? COL.line2 : COL.bad}" opacity="${filled ? 0.03 : 0.035}"/>` +
             `<path d="M${ha.toFixed(1)} ${hy}v${hh}M${hb.toFixed(1)} ${hy}v${hh}" stroke="${filled ? COL.line3 : COL.bad}" stroke-width="${(1 / scale).toFixed(2)}" opacity=".7"/>` +
             note(`${big < 1 ? fx(big * 1000, 0) + ' ms' : fx(big, 1) + ' s'} hole: ${filled ? 'bridged' : 'nothing invented, cut here'}`, (f.X(bt[j]) + f.X(bt[j + 1])) / 2, H - M.b - 12, c, 'middle', W);
      }
      e.after.forEach((a, i) => { s += line(a.t, av[i], f.X, f.Y, COL.line3, 1) + dots(a.t, av[i], f.X, f.Y, COL.line2, 2); });
      for (let i = 0; i < bt.length; i++) {
        s += `<circle cx="${f.X(bt[i]).toFixed(1)}" cy="${f.Y(bv[i]).toFixed(1)}" r="4" fill="none" stroke="${COL.accent}" stroke-width="1.4"/>`;
      }
      const marks = bt.map((v, i) => [f.X(v), f.Y(bv[i])]).concat(e.after.flatMap((a, i) => a.t.map((v, j) => [f.X(v), f.Y(av[i][j])])));
      const taken = [];
      const lab = (px, py, up, text, c) => {
        const u = 1 / scale, w = textW(text), offs = [];
        for (const dy of [24, 40, 58, 78, 100]) for (const dx of [16 * u, 40 * u, -16 * u - w, 70 * u]) offs.push([dx, (up ? -dy : dy + 6) * u], [dx, (up ? dy + 6 : -dy) * u]);
        const free = ([dx, dy]) => {
          const x0 = px + dx, y0 = py + dy, box = [x0 - 3 * u, y0 - 13 * u, x0 + w + 3 * u, y0 + 4 * u];
          if (box[0] < M.l || box[2] > M.l + pw || box[1] < plotY || box[3] > plotY + ph) return false;
          const hit = ([mx, my]) => mx > box[0] - 4 * u && mx < box[2] + 4 * u && my > box[1] - 4 * u && my < box[3] + 4 * u;
          return !marks.some(hit) && !taken.some(t => !(t[2] < box[0] || t[0] > box[2] || t[3] < box[1] || t[1] > box[3]));
        };
        const o = offs.find(free) || [16 * u, (up ? -24 : 30) * u], lx = px + o[0], ly = py + o[1];
        taken.push([lx - 3 * u, ly - 13 * u, lx + w + 3 * u, ly + 4 * u]);
        const ex = o[0] < 0 ? lx + w + 2 * u : lx - 2 * u, ey = ly + (o[1] < 0 ? 2 : -12) * u;
        return `<path d="M${(px + (ex > px ? 4 : -4) * u).toFixed(1)} ${(py + (o[1] < 0 ? -4 : 4) * u).toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}" stroke="${c}" stroke-width="${u.toFixed(2)}" fill="none"/>` +
          note(text, lx, ly, c, 'start', W);
      };
      if (!e.after.length) s += note('no new samples: this recording is dropped', M.l + 6, top + 8 + railH + 11, COL.bad, 'start', W);
      else {
        const rx = f.X(bt[0]), ry = f.Y(bv[0]), up = ry > plotY + ph * 0.35;
        s += lab(rx, ry, up, 'as recorded', COL.accent);
        const a0 = e.after.find(a => a.t.length), dx = f.X(a0.t[0]), dy = f.Y(av[e.after.indexOf(a0)][0]);
        s += lab(dx, dy, !up, `every ${1000 / C.H5_RATE_HZ} ms`, COL.line2);
      }
      if (!e.after.length) s += lab(f.X(bt[0]), f.Y(bv[0]), f.Y(bv[0]) > plotY + ph * 0.35, 'as recorded', COL.accent);
      const span = x1 - x0;
      return { svg: s, tracks: [{ label: 'The stored samples', sub: span < 1.5 ? 'slowed to a quarter speed' : 'at their real speed', t: bt, q: e.before.q_wxyz, hold: C.H5_MAX_GAP_S, speed: span < 1.5 ? 0.25 : 1,
        views: [mkView(f.X, x0, x1, top + 6, H - M.b)] }] };
    };
  }

  function figUser(W, H) {
    const e = E.user, u = 1 / scale;
    const passed = e.passed_filter, total = e.recordings_in_tar, bw = W - 28;
    let s = `<text x="14" y="${16 * u}" style="${figText('title')}">One player's archive: ${fmt(total)} recordings</text>`, x = 14;
    const parts = [['wrong rate', e.status_counts.rate_reject || 0, COL.bad, 1], ['head hardly moves', e.status_counts.motion_reject || 0, COL.bad, 0.66],
      ['too short', e.status_counts.too_short_after_trim || 0, COL.bad, 0.4], ['passed every check', passed, COL.keep, 1]];
    const x0 = [], barY = 28 * u, barH = 26 * u, labY = barY + barH + 20 * u;
    parts.forEach(([, n, c, op]) => {
      const w = n / total * bw;
      x0.push(x);
      s += `<rect x="${x.toFixed(1)}" y="${barY.toFixed(1)}" width="${Math.max(w - 2 * u, 1).toFixed(1)}" height="${barH.toFixed(1)}" fill="${c}"${op < 1 ? ` opacity="${op}"` : ''}/>`;
      x += w;
    });
    const lab = i => `${fmt(parts[i][1])} ${parts[i][0]}`, tw = str => textW(str, 'note') * FS();
    const right = `${lab(2)} · ${lab(3)}`;
    let two = false;
    if (x0[1] + tw(lab(1)) + 24 * u < W - 14 - tw(right)) {
      s += `<text x="14" y="${labY.toFixed(1)}" style="${figText('note', COL.bad)}">${lab(0)}</text><text x="${x0[1].toFixed(1)}" y="${labY.toFixed(1)}" style="${figText('note', COL.bad)}">${lab(1)}</text>` +
        `<text x="${W - 14}" y="${labY.toFixed(1)}" text-anchor="end" style="${figText('note')}"><tspan style="fill:${COL.bad}">${lab(2)}</tspan><tspan style="fill:${COL.muted}"> · </tspan><tspan style="fill:${COL.keep}">${lab(3)}</tspan></text>`;
    } else {
      two = true;
      const words = parts.map(([, , c], i) => `<tspan${i === 2 ? ` x="14" dy="${(19 * u).toFixed(1)}"` : ''} style="fill:${c}">${i && i !== 2 ? ' · ' : ''}${lab(i)}</tspan>`);
      s += `<text x="14" y="${labY.toFixed(1)}" style="${figText('note')}">${words.join('')}</text>`;
    }
    const top = labY + (two ? 19 * u : 0) + 48 * u, n = e.order.length, gap = 8 * u;
    s += `<text x="14" y="${(top - 14 * u).toFixed(1)}" style="${figText('title')}">The ${fmt(passed)} that passed, ${bw > 400 ? 'shuffled into a fixed order' : 'in shuffled order'}</text>`;
    const fitSide = rows => { const p = Math.ceil(n / rows); return [p, Math.min(72 * u, (bw - gap * (p - 1)) / p, (H - top - 40 * u) / rows - 40 * u)]; };
    let [per, side] = fitSide(1);
    const [p2, s2] = fitSide(2);
    if (s2 > side * 1.15) { per = p2; side = s2; }
    const rowH = side + 40 * u, hair = u.toFixed(2);
    e.order.forEach((o, i) => {
      const cx = 14 + (i % per) * (side + gap), cy = top + Math.floor(i / per) * rowH, mid = cx + side / 2;
      const notRead = o.status === 'not_inspected_user_cap', c = o.kept ? COL.keep : notRead ? COL.line3 : COL.bad;
      s += o.kept ? `<rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${side.toFixed(1)}" height="${side.toFixed(1)}" fill="${COL.keep}"/>` :
        `<rect x="${(cx + u / 2).toFixed(1)}" y="${(cy + u / 2).toFixed(1)}" width="${(side - u).toFixed(1)}" height="${(side - u).toFixed(1)}" fill="none" stroke="${c}" stroke-width="${hair}"/>`;
      s += `<text x="${mid.toFixed(1)}" y="${(cy + side + 16 * u).toFixed(1)}" text-anchor="middle" style="${figText('axis', o.kept ? COL.body : COL.muted)}">${i + 1}</text>` +
        (o.kept ? `<text x="${mid.toFixed(1)}" y="${(cy + side + 31 * u).toFixed(1)}" text-anchor="middle" style="${figText('axis', COL.keep)}">${fx(o.samples / C.H5_RATE_HZ, 0)} s</text>` : '');
    });
    const kept = e.order.filter(o => o.kept).length, ny = top + Math.ceil(n / per) * rowH + 8 * u;
    const firstOut = e.order.findIndex(o => !o.kept), ox = 14 + (firstOut % per) * (side + gap);
    s += note(`first ${kept}: kept`, 14, ny, COL.keep, 'start', W) +
      (firstOut >= 0 ? note('the rest: not read', firstOut < per && ox > 14 + tw(`first ${kept}: kept`) + 16 * u ? ox : W - 14, ny, COL.muted, firstOut < per && ox > 14 + tw(`first ${kept}: kept`) + 16 * u ? 'start' : 'end', W) : '');
    return s;
  }

  function figPerUser(W, H) {
    const q = P.qualified_per_user;
    return hbars(W, H, W < 520 ? 'Recordings kept per player' : `Recordings kept per player (${fmt(P.usable_users)} players have at least one)`,
      Object.keys(q).filter(k => k !== '0').map(k => [`${k} recording${k === '1' ? '' : 's'}`, q[k]]), COL.line3,
      W < 520 ? `${fmt(q['0'] || 0)} of ${fmt(P.users)} players have none` : `${fmt(q['0'] || 0)} of the ${fmt(P.users)} players checked have none`);
  }

  function figSplit(W, H) {
    const names = ['train', 'validation', 'test'], role = { train: 'the model learns from these', validation: 'used to tune it', test: 'unseen until the end' };
    const u = 1 / scale, top = 64 * u, bottom = 64 * u, gap = 30, aw = W - 28 - gap * 2, ah = H - top - bottom, cOld = COL.line3, cNew = COL.line2;
    const pitch = Math.max(3, Math.min(Math.sqrt(aw * ah / TOTAL.users) * 0.93, 13)), rows = Math.max(1, Math.floor(ah / pitch));
    let s = '', x = 14;
    let k = 1;
    while (k > 0.2 && names.reduce((a, n) => a + Math.ceil(F.splits[n].users / Math.max(1, Math.floor(ah / (pitch * k)))) * pitch * k, 0) > aw) k -= 0.02;
    names.forEach((n, i) => {
      const sp = F.splits[n], base = sp.users - sp.new.users, p = pitch * k, r = Math.max(1, Math.floor(ah / p));
      let da = '', db = '';
      for (let j = 0; j < sp.users; j++) {
        const d = `M${(x + Math.floor(j / r) * p + p / 2).toFixed(1)} ${(top + (j % r) * p + p / 2).toFixed(1)}h0`;
        if (j < base) da += d; else db += d;
      }
      const wd = Math.ceil(sp.users / r) * p;
      s += `<text x="${x}" y="${(top - 42 * u).toFixed(1)}" style="${figText('note', COL.fg)}">${wd > textW(n) + 4 * u ? n : n.slice(0, 5)}</text>` +
           `<text x="${x}" y="${(top - 25 * u).toFixed(1)}" style="${figText('axis', COL.body)}">${fmt(sp.users)}${wd > textW(fmt(sp.users) + ' players', 'axis') ? ' players' : ''}</text>` +
           `<text x="${x}" y="${(top - 9 * u).toFixed(1)}" style="${figText('axis')}">${wd > textW(role[n], 'axis') ? role[n] : ''}</text>` +
           `<path d="${da}" stroke="${cOld}" stroke-width="${(p * 0.62).toFixed(1)}" stroke-linecap="round" fill="none"/>` +
           `<path d="${db}" stroke="${cNew}" stroke-width="${(p * 0.62).toFixed(1)}" stroke-linecap="round" fill="none"/>` +
           (wd > textW('0,000 + 0,000', 'axis') ? `<text x="${x}" y="${(H - bottom + 20 * u).toFixed(1)}" style="${figText('axis')}"><tspan style="fill:${cOld}">${fmt(base)}${wd > textW('1,600 in the first file + 3,643 added', 'axis') ? ' in the first file' : ''}</tspan><tspan style="fill:${COL.muted}"> + </tspan>` +
             `<tspan style="fill:${cNew}">${fmt(sp.new.users)}${wd > textW('1,600 in the first file + 3,643 added', 'axis') ? ' added' : ''}</tspan></text><text x="${x}" y="${(H - bottom + 37 * u).toFixed(1)}" style="${figText('axis')}">${fx(sp.hours, 0)} hours</text>` : '');
      x += wd + gap;
    });
    return s + `<text x="14" y="${(H - 6 * u).toFixed(1)}" style="${figText('axis')}">one dot = one player${W < 520 ? '' : ` · dealt ${F.ratio.train}:${F.ratio.validation}:${F.ratio.test} · no player is in two groups`}</text>`;
  }

  function figSourceRate(W, H) {
    const r = F.source_rate_hz_rounded, [bl, bh] = C.RATE_BAND_HZ, max = Math.max(...Object.values(r));
    const f = frame({ x: M.l + 14, y: M.t, w: W - M.l - M.r - 14, h: H - M.t - M.b, xd: [bl - 1, bh + 1], yd: [0, max * 1.08],
      xt: [85, 90, 95, 100, 105, 110], yf: fmt, xlab: 'samples a second in the original recording', ylab: `pieces in the final file (${fmt(TOTAL.segments)})` });
    const bw = f.X(1) - f.X(0);
    let d = '';
    for (const [hz, n] of Object.entries(r)) d += `M${(f.X(+hz) - bw * 0.4).toFixed(1)} ${f.Y(0).toFixed(1)}V${f.Y(n).toFixed(1)}h${(bw * 0.8).toFixed(1)}V${f.Y(0).toFixed(1)}z`;
    return f.svg + `<path d="${d}" fill="${COL.line3}"/>` +
      `<line x1="${f.X(C.H5_RATE_HZ)}" x2="${f.X(C.H5_RATE_HZ)}" y1="${M.t}" y2="${H - M.b}" stroke="${COL.fg}" stroke-dasharray="4 4"/>` +
      note(`what the model gets: ${C.H5_RATE_HZ} a second`, f.X(C.H5_RATE_HZ) + 6, M.t + 16, COL.fg, 'start', W);
  }

  function figHeadsets(W, H) {
    const rows = Object.entries(F.headsets), n = Math.max(4, Math.min(rows.length, Math.floor((H - 70) / 24)));
    return hbars(W, H, W < 520 ? `"Headset": ${rows.length} spellings` : `"Headset" as written in the files: ${rows.length} different spellings`, rows.slice(0, n), COL.line3,
      `pieces per spelling, the ${n} most common of ${rows.length}`);
  }

  function figWindow(W, H, ctx) {
    const e = E.window, q = e.q_wxyz, n = q.length, cx = F.context, dt = e.dt_s;
    const t = q.map((_, i) => (i - (cx - 1)) * dt), end = t[n - 1];
    const solo = W < 420, top = M.t + 20, gap = 50;
    const zw = solo ? 0 : Math.max(150, Math.round(W * 0.3)), mw = solo ? W - M.l - M.r : W - M.l - M.r - zw - gap;
    const mh = H - top - M.b, zx = M.l + mw + gap, zy = top, zh = H - zy - M.b;
    const A = angles(q), zi = range(n).filter(i => t[i] >= -0.2 - 1e-9);
    const pm = anglePlot({ x: M.l, y: top, w: mw, h: mh, xs: t, q, A, xd: [t[0], end], xt: [-4, -3, -2, -1, 0], xf: v => (v ? v + ' s' : 'now'), stored: ctx.stored, ends: true,
      title: 'one window: ' + fmt(n) + ' samples in a row' });
    const zone = (p, y, h) => `<rect x="${p.X(0)}" y="${y}" width="${p.X(end) - p.X(0)}" height="${h}" fill="${COL.line2}" opacity=".05"/><line x1="${p.X(0)}" x2="${p.X(0)}" y1="${y}" y2="${y + h}" stroke="${COL.fg}" stroke-dasharray="4 4"/>`;
    if (solo) {
      return { svg: zone(pm, top, mh) + pm.svg + note(`in: ${cx} samples (${fx(cx * dt, 0)} s)`, pm.X(t[0] / 2), top + mh - 10, COL.body, 'middle', W) +
        note(`out: ${F.horizon}`, pm.X(end) - 4, top + 16, COL.fg, 'end', W), tracks: [{ label: 'This window', sub: 'at its real speed', t, q, views: [mkView(pm.X, t[0], end, top, top + mh)] }] };
    }
    const pz = anglePlot({ x: zx, y: zy, w: zw, h: zh, xs: zi.map(i => t[i]), q: zi.map(i => q[i]), A: ctx.stored ? null : zi.map(i => A[i]), xd: [-0.2, end],
      xt: zw < 280 ? [-0.2, 0, 0.2] : [-0.2, -0.1, 0, 0.1, 0.2], xf: v => (!v ? 'now' : zw < 280 && (zw - 44) * scale < 260 && v > 0 ? '' : Math.round(v * 1000) + ' ms'), stored: ctx.stored, ends: true, dots: true, r: 2, title: zw < 200 ? 'its last 0.4 s' : 'its last 0.4 s, sample by sample' });
    let s = zone(pm, top, mh) + zone(pz, zy, zh) + pm.svg + pz.svg +
      note(mw > 330 ? `the model sees these: ${cx} samples (${fx(cx * dt, 0)} s)` : `in: ${cx} samples (${fx(cx * dt, 0)} s)`, pm.X(t[0] / 2), top + mh - 10, COL.body, 'middle', W) +
      note(zw > 250 ? `it must predict these ${F.horizon}` : `predict ${F.horizon}`, pz.X(end / 2), zy + zh - 10, COL.fg, 'middle', W);
    if (!ctx.stored) {
      const u = 1 / scale, xr = pz.X(end), yv = pz.Y(A[n - 1][0]), lw = textW('scored here'), xa = xr - 14 * u - lw;
      const pts = [];
      zi.forEach(i => { const px = pz.X(t[i]); if (px >= xa - 6 * u && px <= xr) for (let k2 = 0; k2 < 3; k2++) pts.push(pz.Y(A[i][k2])); });
      let best = null;
      for (let y = zy + 18 * u; y <= zy + zh - 30 * u; y += 2 * u) {
        if (pts.some(py => py > y - 15 * u && py < y + 6 * u)) continue;
        if (best === null || Math.abs(y - yv) < Math.abs(best - yv)) best = y;
      }
      const ly = best === null ? yv - 10 * u : best;
      s += `<circle cx="${xr}" cy="${yv}" r="${(6 * u).toFixed(1)}" fill="none" stroke="${COL.fg}" stroke-width="${(1.6 * u).toFixed(2)}"/>` +
        `<path d="M${(xr - 12 * u).toFixed(1)} ${(ly - 4 * u).toFixed(1)}L${(xr - 4 * u).toFixed(1)} ${(yv + (ly < yv ? -5 : 5) * u).toFixed(1)}" stroke="${COL.fg}" stroke-width="${u.toFixed(2)}" fill="none"/>` +
        note('scored here', xr - 14 * u, ly, COL.fg, 'end', W);
    }
    return { svg: s, tracks: [{ label: 'This window', sub: 'at its real speed', t, q, views: [mkView(pm.X, t[0], end, top, top + mh), mkView(pz.X, -0.2, end, zy, zy + zh)] }] };
  }

  const row = (label, n, cls) => { if (cls === 'out' && String(n) === '0') cls = ''; return `<tr${cls ? ` class="${cls}"` : ''}><td>${label}</td><td>${n}</td></tr>`; };
  const sub = label => `<tr class="sub"><td colspan="2">${label}</td></tr>`;
  const minus = n => (n ? '−' : '') + fmt(n);
  const srcPull = `counts: pull log results.sqlite on the PC, ${esc(P.snapshot)} (${fmt(P.users)} archives)`;
  const localNote = `pictures: synthetic recordings (tools/make_synthetic_data.py), made to the counts of ${fmt(L.recordings)} raw recordings of ${L.users} players in a local folder, because BOXRR-23's data use agreement does not allow passing its recordings on`;
  const WRONG = 'What is wrong', DO = 'What we do', LEFT_ = 'What is left';
  const rateWords = RATES.slice(0, -1).join(', ') + ' or ' + RATES[RATES.length - 1];
  const peakWords = (() => { const h = P.hz.hist_1hz, p = [...PEAKS].sort((a, b) => h[b] - h[a]).slice(0, 4).sort((a, b) => a - b); return p.slice(0, -1).join(', ') + ' or ' + p[p.length - 1]; })();
  const band = `${C.RATE_BAND_HZ[0]} and ${C.RATE_BAND_HZ[1]}`;
  const quatNote = `The file does not store these three angles. It stores a quaternion: four numbers (w, x, y, z) that give the head's direction in one go, with no jump when an angle passes 180°. “As stored” shows them.`;

  const WIN_TRACE = (window.TRACE_INDEX || []).find(t => t.user === E.window.user && t.recording === E.window.recording && t.segment === E.window.segment);

  const STAGES = [
    { key: 'raw', name: 'Raw data', chip: [fmt(LEFT.raw), 'recordings', 1],
      title: 'Raw BOXRR-23',
      head: `Nobody cleaned it: wrong speeds, stuck clocks, holes, heads that never move.`,
      stand: `People playing VR games. The headset writes down <em class="a">where the head points</em>, about ${fx(E.raw.source_rate_hz, 0)} times a second. ` +
        `In the pull counted here, ${fmt(LEFT.raw)} recordings from ${fmt(P.users)} players go in; only <em class="k">${pct(LEFT.motion, LEFT.raw)}</em> will pass every check.`,
      story: [['What it is', `People playing VR games. The headset writes down where the head points, about ${fx(E.raw.source_rate_hz, 0)} times a second.`],
        ['The catch', `Nobody cleaned it: wrong speeds, stuck clocks, holes, heads that never move.`],
        ['What goes in', `In the pull counted here, ${fmt(LEFT.raw)} recordings from ${fmt(P.users)} players. Only ${pct(LEFT.motion, LEFT.raw)} will pass every check.`]],
      what: `BOXRR-23 is a public collection of VR motion recordings (${esc(C.REPO)} on Hugging Face). It has ${fmt(P.tars_in_repo)} archives, one per player (the Model side calls a player a user). ` +
        `Each recording is one .xror file: a table with a time column, then the position and rotation of every tracked device. We use only the head's rotation.`,
      rule: `download archives in random order\ncheck every recording inside`,
      left: row('Archives in the dataset', fmt(P.tars_in_repo)) + row('Archives checked in this pull', fmt(P.users)) + row('Recordings in them', fmt(LEFT.raw)) +
        row(`Of the ${fmt(L.decoded)} with a head on this laptop:`, '') + row('start with rows stamped 0 s', fmt(L.with_several_rows_at_time_zero)) + row('repeat a timestamp later on', fmt(L.with_duplicate_timestamps)) +
        row('have a hole over 0.1 s', fmt(L.with_gap_over_100ms)) + row('clock steps backwards', fmt(L.with_backward_steps)),
      note: `Stages 1 to 7 count one pull: the ${fmt(P.users)} archives checked on the team's PC, the pull whose full log we have. The final file also holds players from other pulls that went through the same checks (stage 8).`,
      src: `ray/code/hf.py, pipeline.process_tar · ${srcPull} · ${localNote}`,
      tabs: [
        { name: 'One recording', fig: figOne, head: 1, stored: true, cap: `A made-up recording in the style of Beat Saber (${who(E.one)}), ${fx(E.one.seconds, 0)} s from the middle of it. Three lines, one for each way a head can turn. Move over the chart and the head follows. ${quatNote}` },
        { name: 'The pile', fig: figWall, cap: `Each tile is one synthetic recording, like the one on the first picture, standing in for one real recording on the team's laptop (BOXRR-23's data use agreement does not allow passing them on). Each was run through the real pipeline, and the pile has the real folder's counts. Its strokes show how far the head swung left and right from its start to its end, and a longer recording fills more of its tile. ` +
          `The colour is what will happen to it; the few solid green ones are kept. ` +
          `Of the ${fmt(WALL.tiles.length)}: the head hardly moves in ${fmt(WALL.fate_counts[3])}, the sampling rate is wrong in ${fmt(WALL.fate_counts[2])}, ${fmt(WALL.fate_counts[1])} are too short, ` +
          `${fmt(WALL.fate_counts[0])} ${WALL.fate_counts[0] === 1 ? 'has' : 'have'} no head, ${fmt(WALL.fate_counts[4])} ${WALL.fate_counts[4] === 1 ? 'has' : 'have'} no 10 s piece, and ${fmt(WALL.fate_counts[5])} are kept. ${fmt(L.recordings)} files, ${fmt(L.decoded)} with a head. Shortest ${fx(L.duration_s.shortest, 0)} s, longest ${fx(L.duration_s.longest, 0)} s, longest hole ${fx(L.longest_hole_s, 0)} s. Point at a tile (or tap it) to see it large.` },
        { name: 'Inside a file', fig: figFile, cap: `The same recording as a file: ${fmt(E.raw.file_bytes)} bytes. Three tracked devices, seven numbers each, plus the time. Already in the first rows it is not clean.` },
        { name: 'Recordings per player', fig: figPile, cap: `Very uneven: half the players have ${fmt(P.rec_per_user.median)} recordings or fewer, one has ${fmt(P.rec_per_user.max)}. ` +
          `Games in what we checked: ${Object.entries(P.games).filter(([g]) => g !== 'unreadable').map(([g, n]) => `${esc(g)} ${fmt(n)}`).join(', ')}.` },
      ] },

    { key: 'head', name: 'Head?', chip: [fmt(LEFT.head), 'recordings', LEFT.head / LEFT.raw],
      title: 'Is there a head to follow?',
      head: `Some files have no head in them.`,
      stand: `Tilt Brush, a painting game, records only the brush. We read the file's own description first: no headset that reports its direction, no use. ` +
        `<em class="k">${fmt(LEFT.head)} recordings</em> are left, <em class="x">${fmt(LEFT.raw - LEFT.head)} gone</em>.`,
      story: [[WRONG, `Some files have no head in them. Tilt Brush, a painting game, records only the brush.`],
        [DO, `Read the file's own description first. No headset that reports its direction, no use.`],
        [LEFT_, `${fmt(LEFT.head)} recordings. ${fmt(LEFT.raw - LEFT.head)} gone.`]],
      what: `Before unpacking any motion data, the pipeline reads the file's description: which game, which devices. ` +
        `Tilt Brush recordings track only the brush, so they are skipped. So is a file whose description cannot be read.`,
      rule: `skip if game is one of: ${C.EXCLUDED_GAMES.join(', ')}\nskip if no device is the headset (type HMD or joint HEAD)\nskip if the headset has no i, j, k, 1 rotation columns`,
      left: row('Came in', fmt(LEFT.raw)) + row('Tilt Brush', minus(reason('excluded game')), 'out') + row('Unreadable file', minus(reason('unreadable file')), 'out') +
        row('No head device', minus(reason('no head device')), 'out') + row('Head without rotation', minus(reason('head has no rotation')), 'out') + row('Left', fmt(LEFT.head), 'keep'),
      src: `ray/code/head.py: peek_info, unusable_reason · ${srcPull}`,
      tabs: [{ name: 'One kept, one skipped', fig: figDevices, head: 2, cap: `Left: the recording from stage 1. Right: a Tilt Brush file (${who(E.excluded)}), the only one in the pile, as in the real folder. ` +
        `The amber letters are the four numbers of the head's direction, which is all the pipeline needs.` }] },

    { key: 'clean', name: 'Clean', chip: [fmt(LEFT.clean), 'recordings', LEFT.clean / LEFT.raw],
      title: 'Clean the samples',
      head: `Recordings start with rubbish: an empty row, a clock stuck at zero, a head that jumps.`,
      stand: `We drop broken rows and repeated times, and cut the first ${fx(C.TRIM_S, 0)} seconds of every recording. ` +
        `<em class="k">${fmt(LEFT.clean)} recordings</em> are left; <em class="x">${fmt(LEFT.head - LEFT.clean)}</em> had nothing left after the cut.`,
      story: [[WRONG, `Recordings start with rubbish: an empty row, a clock stuck at zero, a head that jumps.`],
        [DO, `Drop broken rows and repeated times. Cut the first ${fx(C.TRIM_S, 0)} seconds of every recording.`],
        [LEFT_, `${fmt(LEFT.clean)} recordings. ${fmt(LEFT.head - LEFT.clean)} had nothing left after the cut.`]],
      what: `A sample is one row: a time and the head's direction at that time. The pipeline drops rows that are not numbers or that point nowhere (four zeros), scales the rest to length 1, ` +
        `cuts the first ${fx(C.TRIM_S, 0)} seconds, and where several rows carry the same time it keeps only the first. It never re-orders rows.`,
      rule: `drop a sample if it is not finite or |q| <= ${C.MIN_QUAT_NORM}\nscale every q to length 1\ncut the first ${C.TRIM_S} s (forward time steps only)\nreject if fewer than ${C.MIN_ASSESSED_SAMPLES} samples are left\nsame timestamp twice: keep the first, never sort`,
      left: row('Came in', fmt(LEFT.head)) + row('Too few valid samples', minus(reason('too few valid frames')), 'out') + row('Left', fmt(LEFT.clean), 'keep') +
        row(`Of the ${fmt(L.decoded)} with a head on this laptop:`, '') + row('start with an empty row', fmt(L.first_quaternion_is_zero)) +
        row('start with rows stamped 0 s', fmt(L.with_several_rows_at_time_zero)) + row('repeat a timestamp later on', fmt(L.with_duplicate_timestamps)) +
        row('clock steps backwards', fmt(L.with_backward_steps)) + row('contain a sign flip', fmt(L.with_raw_sign_flips)),
      src: `ray/code/cleaning.py: clean, align · ${srcPull} · ${localNote}`,
      tabs: [
        { name: 'Bad start', fig: figStart, head: 1, stored: true, cap: `The stage-1 recording (${who(E.raw)}). Left: its first rows. Row 0 is empty and the next ${E.raw.t.filter(v => v === 0).length - 1} all claim time 0 while the head is somewhere else in each. ` +
          `Right: the first ${fx(C.TRIM_S, 0)} s (${fmt(E.raw.trimmed_samples)} of ${fmt(E.raw.raw_samples)} samples) are cut whatever they hold. All ${fmt(L.with_several_rows_at_time_zero)} local recordings start this way.` },
        { name: 'Clock stuck', fig: figFreeze, head: 1, stored: true, cap: `${who(E.freeze)}: the time stands still for ${fmt(E.freeze.rows_in_run)} rows (about ${fx(E.freeze.rows_in_run * E.freeze.usual_step_ms / 1000, 0)} s of rows at its usual pace) while the head goes on moving. ` +
          `It happens ${E.freeze.runs_over_100_rows} times in this recording: ${fmt(E.freeze.duplicate_samples)} of its ${fmt(E.freeze.raw_samples)} rows are repeats. Every 8th row is drawn. Chosen as the recording with the most repeats; the stuck clock was planted at the size of the real folder's worst one.` },
        { name: 'Clock jumps back', fig: figClock(E.backward.backward), head: E.backward.backward.q_wxyz ? 1 : 0, cap: `${who(E.backward)}: after ${fmt(E.backward.backward.t.filter(v => v === 0).length)} rows at 0 s in view, the clock restarts ${fx(-E.backward.backward.step_s, 1)} s earlier. ` +
          `The pipeline never sorts rows. Here the jump falls inside the ${fx(C.TRIM_S, 0)} s that are cut; later ones cut the recording in two (stage 6). ${fmt(L.with_backward_steps)} of ${fmt(L.decoded)} local recordings have one.` },
        { name: 'Sign flip', fig: figFlip, head: 1, cap: `${who(E.flip)}: a quaternion and its negative are the same direction, so a file may switch between them at any row. The head moved ${fx(E.flip.head_turned_across_flip_deg, 1)}° in that step, like in any other. ` +
          `The pipeline flips the sign back so neighbours agree. ${fmt(L.raw_sign_flips)} flips in ${fmt(L.with_raw_sign_flips)} of ${fmt(L.decoded)} local recordings.` },
        { name: 'Too short', fig: figShort, head: 1, stored: true, cap: `${who(E.too_short)}: only ${fx(E.too_short.duration_s, 1)} s long (${fmt(E.too_short.raw_samples)} samples). The ${fx(C.TRIM_S, 0)} s cut removes all of it, and ${C.MIN_ASSESSED_SAMPLES} samples are needed to go on.` },
      ] },

    { key: 'rate', name: 'Rate', chip: [fmt(LEFT.rate), 'recordings', LEFT.rate / LEFT.raw],
      title: 'Sampling-rate gate',
      head: `Headsets write at different speeds, most often about ${peakWords} times a second. The model reads exactly ${C.H5_RATE_HZ}.`,
      stand: `We keep only recordings already close to ${C.H5_RATE_HZ}: between ${band} a second. ` +
        `<em class="k">${fmt(LEFT.rate)} recordings</em> are left; <em class="x">${fmt(LEFT.clean - LEFT.rate)} gone</em>, the biggest loss of all.`,
      story: [[WRONG, `Headsets write at different speeds: mostly ${rateWords} times a second. The model reads exactly ${C.H5_RATE_HZ}.`],
        [DO, `Keep only recordings already close to ${C.H5_RATE_HZ}: between ${band} a second.`],
        [LEFT_, `${fmt(LEFT.rate)} recordings. ${fmt(LEFT.clean - LEFT.rate)} gone: the biggest loss of all.`]],
      what: `The sampling rate is how many times a second the headset writes the head's direction down (Hz means “times a second”). The challenge's rule keeps only recordings already close to ${C.H5_RATE_HZ}. ` +
        `The rate is taken from the median gap between samples, because single gaps wobble (third picture).`,
      rule: `rate = 1 / median(forward time steps)\nkeep if ${C.RATE_BAND_HZ[0]} <= rate <= ${C.RATE_BAND_HZ[1]} Hz`,
      left: row('Came in', fmt(LEFT.clean)) + row('Outside the band', minus(reason('sampling rate outside 85-110 Hz')), 'out') +
        row('Left', fmt(LEFT.rate), 'keep') + row('Share of what came in', pct(LEFT.rate, LEFT.clean)),
      src: `ray/code/cleaning.py: clean (RATE_BAND_HZ) · ${srcPull} · ${localNote}`,
      tabs: [
        { name: 'Too slow, too fast', fig: figRateRows, cap: `Four synthetic recordings, the first ${fmt(200)} ms after their ${fx(C.TRIM_S, 0)} s cut. The top row is the even grid the model needs. Only a recording whose own rate is already near it passes this gate.` },
        { name: 'All recordings', fig: figRateHist, cap: `The measured rate of all ${fmt(P.hz.n)} recordings that reached this stage. Green is kept (${fmt(P.hz.in_band)}), red is thrown away; the numbers name the tallest bars. ` +
          `${fmt(P.hz.hist_1hz.slice(0, 30).reduce((a, b) => a + b, 0) + P.hz.hist_1hz.slice(160).reduce((a, b) => a + b, 0))} more lie outside this picture (below 30 or from 160 up).` },
        { name: 'Why the median', fig: figJitter, cap: `The same four recordings, 300 gaps each. Samples do not arrive evenly: the gaps scatter around their usual value, so the pipeline uses the median gap. Only the one inside the green band passes.` },
      ] },

    { key: 'motion', name: 'Motion', chip: [fmt(LEFT.motion), 'recordings', LEFT.motion / LEFT.raw],
      title: 'Is the head actually moving?',
      head: `In most recordings the head hardly moves. There is nothing in them to learn.`,
      stand: `We measure how far and how fast <em class="a">the head</em> swings, and keep only the lively ones. ` +
        `<em class="k">${fmt(LEFT.motion)} recordings</em> are left; <em class="x">${fmt(LEFT.rate - LEFT.motion)} gone</em>.`,
      story: [[WRONG, `In most recordings the head hardly moves. There is nothing in them to learn.`],
        [DO, `Measure how far and how fast the head swings. Keep only the lively ones.`],
        [LEFT_, `${fmt(LEFT.motion)} recordings. ${fmt(LEFT.rate - LEFT.motion)} gone.`]],
      what: `A head that hardly moves is easy to predict and teaches the model little. The recording is cut into ${fx(C.WINDOW_S, 0)} s windows. In each one, for each rotation axis, the pipeline measures ` +
        `the sweep (how wide the angle swings) and the velocity (how much angle is travelled per second). It takes the median over the windows (the typical one), then the busiest axis.`,
      rule: `per ${C.WINDOW_S} s window and axis (Euler ${C.EULER_ORDER}):\n  sweep    = P${C.SWEEP_PERCENTILES[1]} - P${C.SWEEP_PERCENTILES[0]} of the angle\n  velocity = sum of |angle change| / ${C.WINDOW_S} s\nS, V = median over windows, then the largest axis\nkeep if S > ${C.SWEEP_MIN_DEG}° and V > ${C.VELOCITY_MIN_DEG_S}°/s`,
      left: row('Came in', fmt(LEFT.rate)) + row('No complete 5 s window', minus(reason('no usable 5 s windows')), 'out') +
        row('Too little motion', minus(reason('below S/V threshold')), 'out') + row('Left', fmt(LEFT.motion), 'keep') +
        row('Share of all recordings', pct(LEFT.motion, LEFT.raw)) + row('Players with one or more', fmt(P.users_with_pass)),
      src: `ray/code/cleaning.py: motion_filter, passes · ${srcPull} · ${localNote}`,
      tabs: [
        { name: 'Still or moving', fig: figMotion, head: 2, stored: true, cap: `Two synthetic recordings on the same scale, their first ${fx(E.still.windows.length * C.WINDOW_S, 0)} s after the cut. Top: ${who(E.still)}, the stillest in the pile. Bottom: ${who(E.moving)}, the liveliest. ` +
          `The swing figures are the pipeline's own, measured on its rotation axes, which differ slightly from the three angles drawn.` },
        { name: 'All recordings', fig: figScatter, cap: `Each dot is one recording: ${fmt(P.sv.sample.length)} drawn at random (seed ${P.sv.sample_seed}) from the ${fmt(P.sv.n)} measured. ` +
          `Only the green corner passes both tests. The four counts are exact and cover all of them. Dots beyond an edge are drawn on it.` },
      ] },

    { key: 'resample', name: '100 a second', chip: [fmt(P.usable_users), 'players', null],
      title: `Resample to exactly ${C.H5_RATE_HZ} Hz`,
      head: `Samples do not arrive evenly, and sometimes a stretch is missing.`,
      stand: `We work out a new sample exactly every ${1000 / C.H5_RATE_HZ} ms, bridge small holes, cut at big ones and drop pieces under ${C.H5_MIN_SAMPLES / C.H5_RATE_HZ} s. ` +
        `<em class="k">${fmt(P.usable_users)}</em> of ${fmt(P.users_with_pass)} players still have a usable recording.`,
      story: [[WRONG, `Samples do not arrive evenly, and sometimes a stretch is missing.`],
        [DO, `Work out a new sample exactly every ${1000 / C.H5_RATE_HZ} ms. Bridge small holes, cut at big ones, drop pieces under ${C.H5_MIN_SAMPLES / C.H5_RATE_HZ} s.`],
        [LEFT_, `${fmt(P.usable_users)} of ${fmt(P.users_with_pass)} players still have a usable recording.`]],
      what: `Resampling means working out new, evenly spaced samples from the stored ones. Each new sample is found by SLERP (spherical linear interpolation): turning smoothly from the stored sample before to the one after. ` +
        `A hole of up to ${C.H5_MAX_GAP_S * 1000} ms is bridged the same way. A longer hole, or a clock stepping back, cuts the recording in pieces, and a piece under ${fmt(C.H5_MIN_SAMPLES)} samples is dropped.`,
      rule: `cut where the time step is <= 0 or > ${C.H5_MAX_GAP_S} s\nper piece: align signs, SLERP onto t0 + k / ${C.H5_RATE_HZ}\ndrop pieces under ${C.H5_MIN_SAMPLES} samples`,
      left: row('Players with a passing recording', fmt(P.users_with_pass)) + row('None of theirs gives a long enough piece', minus(P.users_with_pass - P.usable_users), 'out') +
        row('Players left', fmt(P.usable_users), 'keep') + row('Recordings dropped here', 'not logged'),
      src: `ray/code/cleaning.py: resample, align · ${srcPull} · ${localNote}`,
      tabs: [
        { name: 'Uneven to even', fig: figResample(E.grid, false), head: 1, stored: true, cap: `${who(E.grid)}, ${fx(E.grid.centre_s, 0)} s in: ${E.grid.source_samples_in_view} stored samples (top row, uneven) become ${E.grid.output_samples_in_view} new ones (second row, even). ` +
          `Whole recording: ${fmt(E.grid.pieces[0].source_samples)} in, ${fmt(E.grid.pieces[0].samples)} out.` },
        { name: 'Small hole: bridged', fig: figResample(E.slerp_fill, false), head: 1, stored: true, cap: `${who(E.slerp_fill)}: a hole in the stored samples, under ${C.H5_MAX_GAP_S * 1000} ms, so the new samples simply continue across it along the smooth turn. Chosen as the largest such hole in the pile.` },
        { name: 'Big hole: cut', fig: figResample(E.split, true), head: 1, stored: true, cap: `${who(E.split)}: a hole of several seconds. Nothing is invented across it. The recording becomes two pieces, and the short one is dropped. White marks on the bar show the part drawn below.` },
        { name: 'Just too short', fig: figResample(E.no_long_segment, true), head: 1, stored: true, cap: `${who(E.no_long_segment)}: passed every test, but after the ${fx(C.TRIM_S, 0)} s cut it gives ${fmt(E.no_long_segment.pieces[0].samples)} samples and ${fmt(C.H5_MIN_SAMPLES)} are needed. Dropped.` },
      ] },

    { key: 'pick', name: '5 per player', chip: [fmt(LEFT.pick), 'recordings', LEFT.pick / LEFT.raw],
      title: `At most ${C.H5_MAX_RECORDINGS_PER_USER} recordings per player`,
      head: `A few keen players have many good recordings. Most have one or two.`,
      stand: `We keep at most ${C.H5_MAX_RECORDINGS_PER_USER} per player, picked by a fixed shuffle, never by hand. ` +
        `<em class="k">${fmt(LEFT.pick)} recordings</em> from ${fmt(P.usable_users)} players are left: ${pct(LEFT.pick, LEFT.raw)} of what came in.`,
      story: [[WRONG, `A few keen players have many good recordings. Most have one or two.`],
        [DO, `Keep at most ${C.H5_MAX_RECORDINGS_PER_USER} per player, picked by a fixed shuffle, never by hand.`],
        [LEFT_, `${fmt(LEFT.pick)} recordings from ${fmt(P.usable_users)} players: ${pct(LEFT.pick, LEFT.raw)} of what came in.`]],
      what: `Some players have thousands of recordings, most have a handful (stage 1). Each player's passing recordings are put in a fixed scrambled order, and only the first ${C.H5_MAX_RECORDINGS_PER_USER} that give a usable piece are kept. ` +
        `The order comes from a hash, so it is the same every time and nobody hand-picks.`,
      rule: `order by sha256("${C.H5_SEED}:<player>/<recording>.xror")\nkeep the first ${C.H5_MAX_RECORDINGS_PER_USER} that give a usable piece\nthe rest are not read`,
      left: row('Recordings that passed', fmt(LEFT.motion)) + row(`Over the limit of ${C.H5_MAX_RECORDINGS_PER_USER} per player, or no 10 s piece`, minus(LEFT.motion - LEFT.pick), 'out') +
        row('Kept after stages 6 and 7', fmt(LEFT.pick), 'keep') + row('From players', fmt(P.usable_users)) +
        row('Share of all recordings', pct(LEFT.pick, LEFT.raw)),
      src: `ray/code/h5_export.py: recording_order, prepare_user · ${srcPull}`,
      tabs: [
        { name: 'One player', fig: figUser, cap: `Synthetic player ${short(E.user.user)}, standing in for the keen player on this laptop: ${fmt(E.user.recordings_in_tar)} recordings, ${fmt(E.user.passed_filter)} pass every check, ${E.user.order.filter(o => o.kept).length} are kept. The number under each square is its place in the shuffled order.` },
        { name: 'All players', fig: figPerUser, cap: `How many recordings each player contributes after the limit, across the pull.` },
      ] },

    { key: 'split', name: 'Split', chip: [fmt(TOTAL.users), 'players', null],
      title: 'Split by player',
      head: `The model will be judged on people it has never seen.`,
      stand: `So we deal whole players into train, validation and test, and nobody is in two groups. ` +
        `<em class="k">${fmt(TOTAL.users)} players</em>: ${fmt(F.splits.train.users)} to learn from, ${fmt(F.splits.validation.users)} to tune, ${fmt(F.splits.test.users)} to test.`,
      story: [['Why', `The model will be judged on people it has never seen.`],
        [DO, `Deal whole players into train, validation and test. Nobody is in two groups.`],
        ['What we have', `${fmt(TOTAL.users)} players: ${fmt(F.splits.train.users)} to learn from, ${fmt(F.splits.validation.users)} to tune, ${fmt(F.splits.test.users)} to test.`]],
      what: `The model is scored on people it has never seen, so the split is made by player, not by recording. The file the model trained on was built in two rounds. ` +
        `The first file held ${fmt(TOTAL.users - TOTAL.newUsers)} players. The final build left them exactly where they were and added ${fmt(TOTAL.newUsers)} newly pulled players ` +
        `(${fmt(BUILT.window)} more from the PC, ${fmt(BUILT.pull)} pulled on Colab), dealt out ${F.ratio.train}:${F.ratio.validation}:${F.ratio.test}.`,
      rule: `keep the first file's players where they are\nshuffle the new players (seed ${F.seed})\ndeal ${F.ratio.train} : ${F.ratio.validation} : ${F.ratio.test} to train : validation : test\nchecked: no player in two splits`,
      left: row('Players', fmt(TOTAL.users), 'keep') + row('Recordings', fmt(TOTAL.recordings)) + row('Pieces', fmt(TOTAL.segments)) +
        row('Hours at 100 Hz', fx(TOTAL.samples / C.H5_RATE_HZ / 3600, 1)) + sub('Where the players come from') + row('The pull counted in stages 1 to 7', fmt(TOTAL.loggedUsers), 'in') +
        row('The team’s earlier file', fmt(TOTAL.earlierUsers), 'in') + row('Later pulls, on the PC and Colab', fmt(TOTAL.laterUsers), 'in'),
      note: `The stage line at the top counts one pull only, and all ${fmt(TOTAL.loggedUsers)} players it kept are in the file. The other ${fmt(TOTAL.users - TOTAL.loggedUsers)} went through the same pipeline version (${esc(F.preparation_version)}), but their rejection logs are not on this machine.`,
      src: `ray/export_moredata.py, ray/export_final.py · ${esc(F.file)}, its manifest and build log`,
      tabs: [
        { name: 'Every player', fig: figSplit, cap: `${esc(F.file)}: darker dots are the players of the first file (${esc(F.base_file)}), lighter dots the ones the final build added. Every piece in it is Beat Saber (${Object.entries(F.apps).map(([a, n]) => `${esc(a)} ${fmt(n)}`).join(', ')} pieces). A piece is one unbroken stretch of a recording at ${C.H5_RATE_HZ} samples a second.` },
        { name: 'Rate before resampling', fig: figSourceRate, cap: `The rate each piece had before resampling. Most of the final data was recorded near 90 a second and re-timed onto the ${C.H5_RATE_HZ}-a-second grid.` },
        { name: 'Still messy labels', fig: figHeadsets, cap: `The headset name is free text in the files and is kept as it is. It is not used by the model.` },
      ] },

    { key: 'window', name: 'Model input', chip: [fmt(F.splits.train.windows), 'windows', null],
      title: 'One model input',
      head: `The model gets ${F.context / C.H5_RATE_HZ} seconds of head motion: ${F.context} samples.`,
      stand: `It must say where <em class="a">the head</em> goes in the next ${F.horizon * 1000 / C.H5_RATE_HZ} ms: ${F.horizon} samples. ` +
        `There are <em class="k">${fmt(F.splits.train.windows)}</em> different windows to train on.`,
      story: [['What the model gets', `${F.context / C.H5_RATE_HZ} seconds of head motion: ${F.context} samples.`],
        ['What it must do', `Say where the head goes in the next ${F.horizon * 1000 / C.H5_RATE_HZ} ms: ${F.horizon} samples.`],
        ['How many', `${fmt(F.splits.train.windows)} different windows to train on.`]],
      what: `Training cuts windows of ${F.context + F.horizon} samples in a row out of a piece. The first ${F.context} are what the model reads. The last ${F.horizon} are the answer it has to predict; the challenge scores only the last one. ` +
        `Each training example picks a player at random and then one of that player's windows, so every player counts the same however much they recorded.`,
      rule: `window = ${F.context + F.horizon} consecutive samples of one piece\ninput  = samples 1 to ${F.context}\ntarget = samples ${F.context + 1} to ${F.context + F.horizon}\ntraining: random player, then random window`,
      left: row('Possible windows, train', fmt(F.splits.train.windows), 'keep') + row('validation', fmt(F.splits.validation.windows)) + row('test', fmt(F.splits.test.windows)),
      src: `jacob/training/tcnn/data.py: WindowDataset, DeviceWindows · ${esc(F.file)}`,
      cta: true,
      tabs: [{ name: 'A real window', fig: figWindow, head: 1, stored: true, cap: `${E.window.h5_path ? 'From the test split' : `Real data, but not BOXRR-23: ${esc(E.window.attrs.dataset)}, a public dataset (CC BY 4.0) the model never trained on`}: ${WIN_TRACE ? `the recording behind the Model side's “${esc(WIN_TRACE.label)}” trace` : `${esc(E.window.user)}, ${esc(E.window.recording)}`}, samples ${fmt(E.window.start_sample + 1)} to ${fmt(E.window.start_sample + F.context + F.horizon)} of ${fmt(E.window.segment_samples)}. ` +
        `Left of “now” is the input, the shaded part is what the model must predict. The model reads the four stored numbers (“As stored”), not these angles.` }] },
  ];

  let root = null, at = 0, tab = 0, visible = false, resizeTimer = 0, asStored = false, scale = 1, hoverFn = null;
  const $ = id => root.querySelector('#' + id);
  const tier = () => document.body.dataset.tier || 'full';
  const calm = () => tier() === 'min' || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const player = { tracks: [], u: 0, span: 0, playing: false, asked: false, raf: 0, last: 0, painted: 0, key: '', lines: [], heads: [] };
  const REST = 0.7, REWIND = 0.5;
  const axisPos = tr => Math.min(tr.t[0] + player.u * (tr.speed || 1), tr.t[tr.t.length - 1]);

  let readCtx = null;
  const readWidth = txt => { readCtx = readCtx || document.createElement('canvas').getContext('2d'); readCtx.font = '500 13.5px "Geist", system-ui, sans-serif'; return readCtx.measureText(txt).width; };
  function paint() {
    player.tracks.forEach((tr, k) => {
      const h = player.heads[k], a = tr.none ? 0 : axisPos(tr);
      if (h) {
        const smp = drawHead(h.cv, tr, a, tier() !== 'full', clamp((player.u - player.span - REST) / REWIND, 0, 1));
        const ang = smp && ttl(smp.q);
        const lead = player.heads.length > 1 ? `<b style="color:${tr.color || COL.fg}">${esc(tr.label)}</b>` : '';
        const parts = ang && !smp.hole ? [['turned ', ang[0], 'right', 'left'], ['tilted ', ang[1], 'up', 'down'], ['leaning ', ang[2], 'left', 'right']] : null;
        const line = verbs => parts.map(([verb, v, pos, neg]) => (verbs ? verb : '') + side(v, pos, neg)).join(' · ');
        const verbs = parts && readWidth((player.heads.length > 1 ? tr.label + '  ' : '') + line(true)) <= (h.read.clientWidth || h.cv.clientWidth) - 4;
        h.read.style.whiteSpace = 'nowrap';
        h.read.innerHTML = lead + (!ang ? '&nbsp;' : smp.hole ? '<span>no samples here</span>' :
          parts.map(([verb, v, pos, neg], i) => `<span${i ? '' : ' class="t"'}>${verbs ? verb : ''}${side(v, pos, neg)}</span>`).join('<i> · </i>'));
      }
      tr.views.forEach((v, j) => {
        const ln = player.lines[k] && player.lines[k][j]; if (!ln) return;
        if (tr.none || a < v.a0 || a > v.a1) { ln.setAttribute('visibility', 'hidden'); return; }
        const px = v.X(a).toFixed(1);
        ln.setAttribute('x1', px); ln.setAttribute('x2', px); ln.setAttribute('visibility', 'visible');
      });
    });
  }

  function tick(now) {
    player.raf = 0;
    if (!player.playing || !visible || document.hidden) return;
    if (!player.asked && calm()) { play(false); return; }
    const minGap = tier() === 'full' ? 0 : tier() === 'light' ? 30 : 90;
    if (now - player.painted >= minGap) {
      player.u += Math.min((now - player.last) / 1000, 0.25);
      player.last = now; player.painted = now;
      if (player.u > player.span + REST + REWIND) player.u = 0;
      paint();
    }
    player.raf = requestAnimationFrame(tick);
  }
  function play(on) {
    player.playing = !!on && player.span > 0;
    const b = $('dvPlay');
    if (b) { b.setAttribute('aria-pressed', String(player.playing)); b.querySelector('span').textContent = player.playing ? 'Pause' : 'Play'; b.querySelector('path').setAttribute('d', player.playing ? 'M8 5v14M16 5v14' : 'M8 5l11 7-11 7z'); }
    if (player.playing && !player.raf) { player.last = performance.now(); player.raf = requestAnimationFrame(tick); }
  }

  function setTracks(tracks, key) {
    const same = key === player.key;
    player.tracks = tracks; player.key = key;
    player.span = tracks.reduce((m, tr) => (tr.none ? m : Math.max(m, (tr.t[tr.t.length - 1] - tr.t[0]) / (tr.speed || 1))), 0);
    if (!same) player.u = calm() ? player.span * 0.4 : 0;
    const box = $('dvHead');
    box.innerHTML = box.hidden ? '' : tracks.map(tr => `<div class="hd" title="${esc(tr.label + (tr.sub ? ', ' + tr.sub : ''))}"><canvas aria-hidden="true"></canvas><div class="hr">&nbsp;</div></div>`).join('');
    player.heads = [...box.querySelectorAll('.hd')].map(el => ({ cv: el.querySelector('canvas'), read: el.querySelector('.hr') }));
    const el = root.querySelector('#dvFig svg');
    player.lines = tracks.map(tr => tr.views.map(v => {
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('class', 'ph'); ln.setAttribute('y1', v.top); ln.setAttribute('y2', v.bottom); ln.setAttribute('visibility', 'hidden');
      el.appendChild(ln);
      return ln;
    }));
    $('dvPlay').hidden = !(player.span > 0);
    paint();
    if (!same) { player.asked = false; play(!calm() && player.span > 0); } else play(player.playing);
  }

  function point(e, press) {
    const el = root.querySelector('#dvFig svg'); if (!el) return;
    const r = el.getBoundingClientRect(), vx = (e.clientX - r.left) / scale, vy = (e.clientY - r.top) / scale;
    if (hoverFn) {
      const h = hoverFn(vx, vy), t = el.querySelector('#dvHover'), b = el.querySelector('#dvHoverBox');
      if (t) t.textContent = h.text;
      if (b) { const [x, y, w, hh] = h.box || [0, 0, 0, 0]; b.setAttribute('x', x); b.setAttribute('y', y); b.setAttribute('width', w); b.setAttribute('height', hh); }
      const z = el.querySelector('#dvZoom'); if (z) z.innerHTML = h.zoom || '';
    }
    for (const tr of player.tracks) for (const v of tr.views) {
      const xa = v.X(v.a0), xb = v.X(v.a1);
      if (vy < v.top - 4 || vy > v.bottom + 4 || vx < Math.min(xa, xb) - 6 || vx > Math.max(xa, xb) + 6) continue;
      const a = v.inv ? v.inv(vx) : v.a0 + clamp((vx - xa) / (xb - xa), 0, 1) * (v.a1 - v.a0);
      player.u = clamp((a - tr.t[0]) / (tr.speed || 1), 0, player.span);
      if (player.playing) play(false);
      paint();
      return;
    }
    if (press) { player.asked = true; play(!player.playing); }
  }

  const FLOW_LEFT = [LEFT.raw, LEFT.head, LEFT.clean, LEFT.rate, LEFT.motion, null, LEFT.pick, TOTAL.loggedRecordings, TOTAL.loggedRecordings];
  const FUNNEL = new URLSearchParams(location.search).get('dv') !== 'classic';
  const HEAD_STAGES = new Set(['raw', 'motion', 'window']);
  const SOURCE_OF = {
    syn: ['One recording', 'The pile', 'Inside a file', 'One kept, one skipped', 'Bad start', 'Clock stuck', 'Clock jumps back',
      'Sign flip', 'Too short', 'Too slow, too fast', 'Why the median', 'Still or moving', 'Uneven to even', 'Small hole: bridged',
      'Big hole: cut', 'Just too short', 'One player'],
    real: ['Recordings per player', 'All recordings', 'All players', 'Every player', 'Rate before resampling', 'Still messy labels'],
    qs: E.window.h5_path ? [] : ['A real window'],
  };
  const SOURCE_TAG = { syn: 'SYNTHETIC EXAMPLE · NOT A REAL PLAYER', real: 'REAL BOXRR-23 COUNTS · CC BY-NC-SA 4.0', qs: 'REAL RECORDING · QUESTSET · CC BY 4.0' };
  const sourceOf = name => Object.keys(SOURCE_OF).find(k => SOURCE_OF[k].includes(name));
  function addSourceTag(el, name, W, H) {
    const k = sourceOf(name); if (!el || !k) return;
    const content = el.getBBox(), others = [...el.querySelectorAll('text')].map(x => x.getBBox());
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', W - 14); t.setAttribute('y', 15); t.setAttribute('text-anchor', 'end');
    t.setAttribute('style', `${figText('title', k === 'syn' ? COL.accent : COL.muted)};font-family:GeistMono,monospace;letter-spacing:.06em;font-size:${(10.5 / scale).toFixed(2)}px`);
    t.textContent = SOURCE_TAG[k];
    el.appendChild(t);
    const a = t.getBBox(), pad = 8;
    const hit = others.some(b => a.x - pad < b.x + b.width && b.x < a.x + a.width + pad && a.y < b.y + b.height && b.y < a.y + a.height);
    if (hit) {
      const y = content.y + content.height + 16;
      t.setAttribute('x', 14); t.setAttribute('text-anchor', 'start'); t.setAttribute('y', y);
      if (y + 4 > H) el.setAttribute('viewBox', `0 0 ${W} ${Math.ceil(y + 4)}`);
    }
  }
  const FLOW_SCALE = 'Line thickness: the square root of the recordings still in, on a 2 px floor. Stage 6 does not log how many it drops.';
  function drawFlow() {
    const nav = $('dvNav'), brand = document.getElementById('brand');
    if (brand) {
      const cs = getComputedStyle(root), left = root.getBoundingClientRect().left + parseFloat(cs.paddingLeft);
      nav.style.marginLeft = Math.max(0, Math.round(brand.getBoundingClientRect().right + 40 - left)) + 'px';
    }
    const box = $('dvRiver'), W = box.clientWidth; if (!W) return;
    const n = STAGES.length, cw = W / n, X = i => (i + 0.5) * cw, cy = 9, HM = 6.5, RAMP = cw * 0.5;
    const hw = v => 1 + (HM - 1) * Math.sqrt(v / LEFT.raw);
    const steps = [];
    let prev = hw(LEFT.raw);
    FLOW_LEFT.forEach((v, i) => {
      if (v == null || i === 0) return;
      const h = hw(v), x0 = FLOW_LEFT[i - 1] == null ? X(i - 1) : X(i);
      steps.push([x0, X(i) + RAMP, prev, h]); prev = h;
    });
    const ease = u => u * u * (3 - 2 * u);
    const widthAt = x => { let h = hw(LEFT.raw); for (const [a, b, h0, h1] of steps) if (x >= a) h = x >= b ? h1 : h0 + (h1 - h0) * ease((x - a) / (b - a)); return h; };
    const pts = [];
    for (let x = X(0); x < X(n - 1); x += 2) pts.push([x, widthAt(x)]);
    pts.push([X(n - 1), widthAt(X(n - 1))]);
    const d = 'M' + pts.map(([x, h]) => `${x.toFixed(1)} ${(cy - h).toFixed(2)}`).join('L') + 'L' + [...pts].reverse().map(([x, h]) => `${x.toFixed(1)} ${(cy + h).toFixed(2)}`).join('L') + 'Z';
    const cut = X(at);
    let s = `<title>${esc(FLOW_SCALE)}</title><defs><clipPath id="dvRivA"><rect x="0" y="0" width="${cut.toFixed(1)}" height="20"/></clipPath>` +
      `<clipPath id="dvRivB"><rect x="${cut.toFixed(1)}" y="0" width="${(W - cut).toFixed(1)}" height="20"/></clipPath></defs>` +
      `<path d="${d}" fill="${COL.body}" opacity=".62" clip-path="url(#dvRivA)"/><path d="${d}" fill="${COL.line3}" opacity=".42" clip-path="url(#dvRivB)"/>`;
    for (let i = 0; i < n; i++) s += i === at ? `<circle cx="${X(i).toFixed(1)}" cy="${cy}" r="4.6" fill="${COL.fg}"/>` :
      `<circle cx="${X(i).toFixed(1)}" cy="${cy}" r="2.8" fill="${COL.bg}" stroke="${i < at ? COL.body : COL.line3}" stroke-width="1.2"/>`;
    box.innerHTML = `<svg viewBox="0 0 ${W} 18" width="${W}" height="18" role="img" aria-label="${esc(FLOW_SCALE)}">${s}</svg>`;
  }

  function drawFunnel() {
    const bar = $('fnBar'); if (!bar) return;
    const scale = v => v == null ? null : Math.max(2.5, 100 * Math.sqrt(v / LEFT.raw));
    let last = LEFT.raw;
    bar.innerHTML = STAGES.map((st, i) => {
      const v = FLOW_LEFT[i], w = scale(v == null ? last : v), state = i === at ? 'now' : i < at ? 'done' : 'next';
      if (v != null) last = v;
      return `<li class="${state}"><button type="button" data-i="${i}" ${i === at ? 'aria-current="step"' : ''} title="${esc(st.chip[0] + ' ' + st.chip[1])}">` +
        `<span class="fn-lab"><i>${String(i + 1).padStart(2, '0')}</i>${esc(st.name)}</span>` +
        `<span class="fn-track"><span class="fn-fill${v == null ? ' nolog' : ''}" style="width:${w.toFixed(1)}%"></span></span>` +
        `<span class="fn-n">${v == null ? 'not logged' : fmt(v)}</span></button></li>`;
    }).join('');
  }

  function mount(el) {
    root = el;
    if (FUNNEL) el.classList.add('dv-funnel');
    el.innerHTML =
      `<nav id="dvNav" aria-label="Pipeline stages">` + (FUNNEL ? `<ol id="fnBar"></ol><p id="fnCap">Recordings still in after each step</p>` : '') + `<div id="dvRiver"></div><ol id="dvFlow">` + STAGES.map((s, i) =>
        `<li><button type="button" data-i="${i}" title="${esc(s.chip[0] + ' ' + s.chip[1])}"><i>${i + 1}</i>${esc(s.name)}</button></li>`).join('') + `</ol><p id="dvScale">${esc(FLOW_SCALE)}</p></nav>` +
      `<div id="dvMain"><section id="dvStage" aria-label="Picture">` +
      `<p id="dvKicker"></p>` + (FUNNEL ? `<p class="fn-num"><b id="fnNum"></b><span id="fnUnit"></span><em id="fnDelta"></em></p>` : '') +
      `<h2 id="dvHeadline" aria-live="polite"></h2>` + (FUNNEL ? `<p id="fnDo"></p>` : '') + `<p id="dvStand"></p>` +
      `<div id="dvTop"><div id="dvTabs"></div><div id="dvTools">` +
      `<button type="button" id="dvStored" aria-pressed="false" title="Show the four numbers the file stores instead of the three angles (S)">As stored</button>` +
      `<button type="button" id="dvPlay" aria-pressed="false" title="Replay the head (Space)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg><span>Play</span></button></div></div>` +
      `<div id="dvPic"><div id="dvFig"></div><div id="dvHead" aria-label="The head, replaying the recording"></div></div>` +
      `<div id="dvFoot"><p id="dvCap"></p></div></section>` +
      `<div id="dvSide"><div id="dvText"><aside id="dvCard" aria-label="Notes"></aside></div>` +
      `<div id="dvBar" role="toolbar" aria-label="Data stage controls"><p class="keys">← → stage · ↑ ↓ picture · Space replay</p>` +
      `<button type="button" id="dvBack" aria-label="Previous stage">← Back</button>` +
      `<button type="button" id="dvNext"><span>Next</span> →</button></div></div></div>`;
    $('dvFlow').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) go(+b.dataset.i); });
    if (FUNNEL) $('fnBar').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) go(+b.dataset.i); });
    $('dvCard').addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) { tab = +b.dataset.v; draw(); } });
    $('dvTabs').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) { tab = +b.dataset.t; draw(); } });
    $('dvBack').addEventListener('click', () => go(at - 1));
    $('dvNext').addEventListener('click', () => (at === STAGES.length - 1 ? toModel() : go(at + 1)));
    $('dvCard').addEventListener('click', e => { if (e.target.closest('.cta')) toModel(); });
    $('dvPlay').addEventListener('click', () => { if (!player.playing && player.u >= player.span) player.u = 0; player.asked = true; play(!player.playing); });
    $('dvStored').addEventListener('click', () => { asStored = !asStored; draw(); });
    const fig = $('dvFig');
    fig.addEventListener('pointermove', e => { if (e.pointerType !== 'touch' || e.buttons) point(e, false); });
    fig.addEventListener('pointerdown', e => point(e, true));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && player.playing && !player.raf && visible) { player.last = performance.now(); player.raf = requestAnimationFrame(tick); } });
    window.addEventListener('resize', () => {
      if (!visible) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { drawFlow(); draw(); }, 150);
    });
    const start = STAGES.findIndex(s => s.key === new URLSearchParams(location.search).get('stage'));
    at = start < 0 ? 0 : start;
    const problems = check();
    if (problems.length) console.warn('data view: number checks failed', problems);
  }

  function toModel() { if (window.K8Side) window.K8Side.set('model'); }

  function go(i) {
    at = Math.max(0, Math.min(STAGES.length - 1, i));
    tab = 0;
    render();
  }

  function render() {
    const s = STAGES[at];
    root.querySelectorAll('#dvFlow button').forEach((b, i) => { if (i === at) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    $('dvKicker').textContent = `Stage ${at + 1} of ${STAGES.length} · ${s.title}`;
    $('dvHeadline').textContent = s.head;
    $('dvStand').innerHTML = s.stand;
    if (FUNNEL) {
      $('fnNum').textContent = s.chip[0]; $('fnUnit').textContent = s.chip[1] === 'windows' ? 'training windows' : s.chip[1] + ' left';
      const prev = STAGES[at - 1], cur = FLOW_LEFT[at], was = at ? FLOW_LEFT[at - 1] : null;
      $('fnDelta').textContent = at && cur != null && was != null && prev.chip[1] === s.chip[1] && was > cur ? `−${fmt(was - cur)} at this step` : '';
      const doLine = (s.story.find(([k]) => k === DO) || s.story.find(([, t]) => !s.head.includes(t.replace(/\.$/, ''))) || s.story[0])[1];
      $('fnDo').textContent = doLine;
      const views = s.tabs.length > 1 ? `<div class="lab">Other views</div><div class="fn-views">` + s.tabs.map((t, i) => `<button type="button" data-v="${i}" aria-pressed="${i === tab}">${t.name}</button>`).join('') + `</div>` : '';
      $('dvCard').innerHTML =
        `<details id="dvDetails" class="fn-fold"><summary>The numbers, other views and the rule</summary>` +
        `<p class="what">${s.what}</p><div class="lab">The numbers</div><table>${s.left}</table>` + (s.note ? `<p class="nt">${s.note}</p>` : '') + views +
        `<div class="lab ab">About this picture</div><p id="dvAbout" class="ab"></p><div class="lab">The rule, from the code</div><pre id="dvRule"></pre><div id="dvSrc" class="src"></div></details>` +
        (s.cta ? `<button type="button" class="cta">Now see what the model does with this&nbsp;→</button>` : '');
    } else
    $('dvCard').innerHTML =
      `<p class="what">${s.what}</p>` +
      `<div class="lab">The numbers</div><table>${s.left}</table>` +
      (s.note ? `<p class="nt">${s.note}</p>` : '') +
      `<details id="dvDetails"><summary>Details: the exact rule and the sources</summary><div class="lab ab">About this picture</div><p id="dvAbout" class="ab"></p><div class="lab">The rule, from the code</div><pre id="dvRule"></pre><div id="dvSrc" class="src"></div></details>` +
      (s.cta ? `<button type="button" class="cta">Now see what the model does with this&nbsp;→</button>` : '');
    $('dvRule').textContent = s.rule;
    $('dvSrc').innerHTML = s.src;
    $('dvBack').disabled = at === 0;
    $('dvNext').querySelector('span').textContent = at === STAGES.length - 1 ? 'To the model' : 'Next';
    $('dvTabs').innerHTML = s.tabs.length === 1 ? `<span class="solo">${s.tabs[0].name}</span>` :
      s.tabs.map((t, i) => `<button type="button" data-t="${i}" aria-pressed="false">${t.name}</button>`).join('');
    if (window.K8Phone) window.K8Phone.dataStage();
    drawFlow(); if (FUNNEL) drawFunnel();
    const m = $('dvMain'); m.classList.remove('dv-in'); void m.offsetWidth; m.classList.add('dv-in');
    draw();
  }

  function fit() {
    const card = $('dvCard'), main = $('dvMain');
    const over = () => card.scrollHeight > card.clientHeight + 1;
    card.classList.remove('tight', 'small');
    main.style.removeProperty('--dv-card');
    if (!over() || getComputedStyle(main).gridTemplateColumns.split(' ').length < 2) return;
    card.classList.add('tight');
    if (!over()) return;
    card.classList.add('small');
    const limit = main.clientWidth * 0.45;
    for (let w = card.offsetWidth + 24; over() && w <= limit; w += 24) main.style.setProperty('--dv-card', w + 'px');
  }

  function draw() {
    const s = STAGES[at], t = s.tabs[tab], box = $('dvFig');
    root.querySelectorAll('#dvTabs button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === tab)));
    const heads = FUNNEL && !HEAD_STAGES.has(s.key) ? 0 : (t.head || 0);
    $('dvPic').dataset.heads = heads;
    $('dvHead').hidden = !heads;
    root.querySelectorAll('.fn-views button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === tab)));
    $('dvStored').hidden = !t.stored;
    $('dvStored').setAttribute('aria-pressed', String(asStored));
    $('dvCap').innerHTML = t.cap;
    $('dvAbout').innerHTML = t.cap;
    const stage = $('dvStage');
    stage.style.removeProperty('grid-template-rows');
    fit();
    const wpx = Math.max(Math.round(box.clientWidth), 250), hpx = Math.max(Math.round(box.clientHeight), 150);
    scale = clamp(Math.min(wpx / 860, hpx / 430), 1, 1.7);
    const W = Math.round(wpx / scale), H = Math.round(hpx / scale);
    const res = t.fig(W, H, { stored: asStored && !!t.stored }), out = typeof res === 'string' ? { svg: res } : res;
    box.innerHTML = svg(W, H, `${s.title}: ${t.name}`, out.svg);
    addSourceTag(box.querySelector('svg'), t.name, W, H);
    if (!heads) {
      const el = box.querySelector('svg'), bb = el.getBBox(), used = Math.ceil(bb.y + bb.height + 10);
      if (bb.height && H - used > 30) {
        el.setAttribute('viewBox', `0 0 ${W} ${used}`);
        stage.style.gridTemplateRows = FUNNEL ? `auto auto auto auto auto ${Math.round(used * scale)}px` : `auto auto auto auto ${Math.round(used * scale)}px auto`;
      }
    }
    hoverFn = out.hover || null;
    setTracks(out.tracks || [], `${at}:${tab}`);
  }

  function show() { visible = true; render(); }
  function hide() { visible = false; play(false); }

  function key(e) {
    if (!visible || e.altKey || e.ctrlKey || e.metaKey) return;
    const tag2 = e.target && e.target.tagName;
    if (tag2 === 'INPUT' || tag2 === 'SELECT' || tag2 === 'TEXTAREA') return;
    const n = STAGES[at].tabs.length;
    let used = true;
    if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { play(false); player.u = clamp(player.u + (e.key === 'ArrowRight' ? 1 : -1) * Math.max(player.span / 100, 0.02), 0, player.span); paint(); }
    else if (e.key === 'ArrowRight' || e.key === 'n' || e.key === 'N') go(at + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'b' || e.key === 'B') go(at - 1);
    else if (e.key === 'ArrowDown') { tab = (tab + 1) % n; draw(); }
    else if (e.key === 'ArrowUp') { tab = (tab + n - 1) % n; draw(); }
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(STAGES.length - 1);
    else if (e.key >= '1' && e.key <= '9') go(+e.key - 1);
    else if (e.key === ' ' && tag2 !== 'BUTTON' && tag2 !== 'SUMMARY') { if (!$('dvPlay').hidden) $('dvPlay').click(); }
    else if ((e.key === 's' || e.key === 'S') && !$('dvStored').hidden) { asStored = !asStored; draw(); }
    else used = false;
    if (used) e.preventDefault();
  }

  return { mount, show, hide, key, go, check, fits: () => { const c = $('dvCard'); return c.scrollHeight <= c.clientHeight + 1; }, stages: () => STAGES.map(s => ({ key: s.key, tabs: s.tabs.map(t => t.name) })),
    state: () => ({ stage: STAGES[at].key, tab, stored: asStored, playing: player.playing, u: player.u, span: player.span, heads: player.heads.length }),
    setTab: i => { tab = i; draw(); }, setStored: on => { asStored = !!on; draw(); }, play, seek: u => { player.u = clamp(u, 0, player.span); paint(); } };
})();
