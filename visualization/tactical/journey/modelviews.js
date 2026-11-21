
const SIGNS = [1, -1, -1, 1, -1, 1, 1];
const DIL = [1, 8, 47];
const FEAT = ['ωx', 'ωy', 'ωz', 'speed', 'gx', 'gy', 'gz'];
let TRACE = null, loading = null;
export const trace = () => TRACE;
export function loadTrace() {
  if (loading) return loading;
  loading = new Promise((ok, bad) => {
    window.TRACES = window.TRACES || {};
    const s = document.createElement('script'); s.src = '../traces/test50.js?r=q1';
    s.onload = () => { TRACE = window.TRACES.test50 || Object.values(window.TRACES)[0]; ok(TRACE); };
    s.onerror = () => { loading = null; s.remove(); bad(new Error('traces/test50.js did not load')); };
    document.head.append(s);
  });
  return loading;
}
const geo = (a, b) => { const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI; };
function frame(i) {
  const s = TRACE.steps[i], f = s.features[0][0];
  const lanes = a => [0, 1].map(l => a[0].map(c => c[l][0]));
  return { i, t: s.t, time: s.time_s, q: s.input_quaternion, f, fm: f.map((v, k) => v * SIGNS[k]),
    proj: lanes(s.projection_relu), blk: [0, 1, 2].map(b => lanes(s['block_' + b])), coef: s.head_coefficients[0],
    r: s.trajectory_r[0], pred: s.prediction[0], truth: s.ground_truth, err: s.error_step20_deg, hold: s.hold_error_step20_deg,
    errs: s.prediction[0].map((p, k) => geo(p, s.ground_truth[k])) };
}
function blockInput(i, b) {
  const n = 7 * DIL[b] + 1, out = [];
  for (let k = i - n + 1; k <= i; k++) { const s = TRACE.steps[Math.max(0, k)], a = b === 0 ? s.projection_relu : s['block_' + (b - 1)];
    let m = 0; for (const c of a[0]) m += c[0][0]; out.push(m / 32); }
  return out;
}
function makeClock() {
  const c = { rate: 25, playing: true, i: 0, acc: 0, first: 0, last: 0,
    init() { const st = TRACE.steps; this.first = st.findIndex(s => s.prediction); this.last = st.length - 1; this.i = this.first; },
    tick(dt) { if (!this.playing) return false; this.acc += dt * this.rate; let moved = false;
      while (this.acc >= 1) { this.acc -= 1; this.i = this.i >= this.last ? this.first : this.i + 1; moved = true; } return moved; } };
  return c;
}

export const STAGES = [
  { k: 'input', n: '01', title: 'Input', short: 'INPUT\nQUATERNION IN',
    text: 'Every 10 ms the headset reports one orientation: four numbers (w, x, y, z). The model reads only the two newest; everything older is already summarised in its memory.' },
  { k: 'feat', n: '02', title: 'Seven measurements', short: 'FEATURES\n7, NOTHING LEARNED',
    text: 'A pose says where the head is, not how it is moving. Fixed geometry turns the two newest poses into seven measurements: turning speed about three axes, overall speed, and which way is down.' },
  { k: 'mirror', n: '03', title: 'Mirror', short: 'MIRROR\nFLIP ωY ωZ GX',
    text: 'A left turn and its mirror-image right turn follow the same rules. A mirrored copy is made by flipping the sign of three measurements, and both pass through exactly the same weights. That halves the model.' },
  { k: 'proj', n: '04', title: 'Projection 7 → 32', short: 'PROJECTION\n7 → 32',
    text: 'One small learned matrix spreads each lane\'s seven measurements over 32 channels, and negative values are cut to zero. The rest of the model works on these 32 channels per lane.' },
  { k: 'blocks', n: '05', title: 'Three blocks look back 3.9 s', short: 'BLOCKS\nLOOK BACK 3.9 S',
    text: 'Each block reads eight past samples: the first spaces them 1 apart, the second 8, the third 47. Stacked, one output sees 393 samples with no gaps, nearly the whole 4-second window.' },
  { k: 'head', n: '06', title: 'Nine dials', short: 'READOUT\n9 DIALS',
    text: 'Instead of guessing 20 poses one by one, the readout gives nine numbers, three per rotation axis. They shape one smooth correction curve.' },
  { k: 'traj', n: '07', title: 'Momentum plus correction', short: 'TRAJECTORY\n20 STEPS',
    text: 'A momentum guess keeps the current turn going while it fades; the nine dials steer it. Their sum is the turn expected over each of the next 20 steps.' },
  { k: 'out', n: '08', title: 'Twenty poses, scored on the last', short: 'FORECAST\n+200 MS',
    text: 'The curve becomes 20 future orientations, 10 ms apart, each built straight from the present pose. The challenge scores the last one, 200 ms ahead.' },
];
const byK = Object.fromEntries(STAGES.map(s => [s.k, s]));

const CSS = `
.mv { position: fixed; inset: 0; background: #010101; color: #f1f0ea; font-family: Geist, sans-serif; opacity: 0; visibility: hidden; overflow: hidden; }
.mv .mono, .mv .w { font-family: GeistMono, monospace; letter-spacing: .06em; text-transform: uppercase; }
.w { font-size: 11px; color: #b0b0a9; }
.w .rw { display: flex; justify-content: space-between; line-height: 1.75; gap: 10px; }
.w .rw b { color: #f1f0ea; font-weight: 500; font-variant-numeric: tabular-nums; }
.w .dim { color: #6c6e6b; }
.w .hb { display: grid; grid-template-columns: 34px 1fr 56px; align-items: center; gap: 6px; line-height: 1.75; }
.w .hb .tr { position: relative; height: 6px; background: #161819; }
.w .hb .tr i { position: absolute; top: 0; bottom: 0; background: #b0b0a9; }
.w .hb .tr::after { content: ''; position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: #3a3d40; }
.w .hb b { text-align: right; color: #f1f0ea; font-weight: 500; font-variant-numeric: tabular-nums; }
.w .hb.fl span { color: #dff140; }
.w .strip { display: grid; grid-template-columns: repeat(32, 1fr); gap: 1px; height: 14px; margin: 3px 0 7px; }
.w .strip i { display: block; background: #111; }
.w .spark { width: 100%; height: 34px; display: block; margin: 2px 0 8px; }
.w .g9 { display: grid; grid-template-columns: 18px repeat(3, 1fr); gap: 2px; text-align: center; }
.w .g9 i { font-style: normal; padding: 7px 0; color: #010101; font-weight: 600; font-variant-numeric: tabular-nums; }
.w .big { font: 500 38px/1 Geist; color: #f1f0ea; letter-spacing: -.02em; text-transform: none; font-variant-numeric: tabular-nums; }
.w .big small { font: 12px GeistMono; color: #b0b0a9; }
.w .rf { margin: 4px 0 18px; } .w .rf svg { width: 100%; height: auto; display: block; margin: 6px 0 4px; cursor: crosshair; } .w .rfcap { display: block; line-height: 1.5; } .w .rfcap b { color: #dff140; font-weight: 500; }
.w .seepredict { all: unset; margin-top: 16px; display: inline-flex; font: 500 12px GeistMono, monospace; letter-spacing: .1em; color: #010101; background: #dff140; padding: 10px 16px; cursor: pointer; }
.w .seepredict:hover { background: #f1f0ea; }
.w .bars { display: flex; align-items: flex-end; gap: 2px; height: 40px; margin: 8px 0 4px; }
.w .bars i { flex: 1; background: #505544; } .w .bars i:last-child { background: #dff140; }
.mv .pause { position: absolute; left: 40px; bottom: 30px; font: 11px GeistMono; letter-spacing: .08em; color: #6c6e6b; background: none; border: 1px solid #2f3234; color: #b0b0a9; padding: 7px 12px; cursor: pointer; }
.mv .pause:hover { border-color: #f1f0ea; color: #f1f0ea; }
@keyframes mvflow { to { stroke-dashoffset: -100; } }
html.phone .mv .pause { left: 12px; bottom: calc(66px + env(safe-area-inset-bottom)); min-height: 44px; }
`;
const isPhone = () => document.documentElement.classList.contains('phone');
export function addCSS(extra) { const s = document.createElement('style'); s.textContent = CSS + extra; document.head.append(s); }
const heat = v => `rgba(223,241,64,${Math.min(1, .05 + Math.abs(v) * 2.2)})`;
const cellFill = v => { const a = Math.min(1, Math.abs(v) / .063); return v > 0 ? `rgba(223,241,64,${.25 + .75 * a})` : `rgba(176,176,169,${.2 + .6 * a})`; };
export const fx = (v, d = 3) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);

let MEANS = null;
function means() {
  if (MEANS) return MEANS;
  const st = TRACE.steps, m = a => { let s = 0; for (const c of a[0]) s += c[0][0]; return s / 32; };
  MEANS = [st.map(s => m(s.projection_relu)), ...[0, 1, 2].map(b => st.map(s => m(s['block_' + b])))];
  MEANS.scale = MEANS.map(arr => { const v = arr.map(Math.abs).sort((a, b) => a - b); return v[Math.floor(.98 * (v.length - 1))] || 1; });
  return MEANS;
}
function reachTree(root, w, h, compact, bottomLabel) {
  const NS = 'http://www.w3.org/2000/svg', mk = (tag, a, p = root) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); p.append(e); return e; };
  const L = compact ? 26 : 58, R = w - 2, X = a => R - a / 392 * (R - L);
  const ROWS = [['B3', 3], ['B2', 2], ['B1', 1], [bottomLabel || (compact ? 'IN' : 'PROJ'), 0]];
  const rh = h * (compact ? .085 : .075), gap = (h - 4 * rh) / 3, top = r => r * (rh + gap), bot = r => top(r) + rh;
  const fs = compact ? 7.5 : 15;
  ROWS.forEach(([lab], r) => { const e = mk('text', { x: 0, y: top(r) + rh * .85, fill: '#6c6e6b', 'font-size': fs, 'font-family': 'GeistMono', 'letter-spacing': 1 }); e.textContent = lab; });
  const BINS = 131, bw = (R - L) / BINS;
  const strips = ROWS.map((_, r) => [...Array(BINS)].map((_, b) => mk('rect', { x: (R - (b + 1) * bw).toFixed(2), y: top(r), width: (bw + .3).toFixed(2), height: rh, fill: '#111' })));
  let d3 = '', d2 = '', d1 = '';
  for (let j = 0; j < 8; j++) { const a2 = 47 * j; d3 += `M${X(0)} ${bot(0)}L${X(a2)} ${top(1)}`;
    for (let k = 0; k < 8; k++) { const a1 = a2 + 8 * k; d2 += `M${X(a2)} ${bot(1)}L${X(a1)} ${top(2)}`;
      for (let m = 0; m < 8; m++) d1 += `M${X(a1)} ${bot(2)}L${X(a1 + m)} ${top(3)}`; } }
  const sw = compact ? .5 : 1;
  mk('path', { d: d1, stroke: '#b0b0a9', 'stroke-width': sw * .6, opacity: .16, fill: 'none' });
  mk('path', { d: d2, stroke: '#f1f0ea', 'stroke-width': sw * .8, opacity: .32, fill: 'none' });
  mk('path', { d: d3, stroke: '#dff140', 'stroke-width': sw * 1.2, opacity: .75, fill: 'none' });
  const hl = mk('path', { stroke: '#dff140', 'stroke-width': sw * 1.6, fill: 'none', opacity: .95 });
  const dots = [0, 1, 2].map(() => mk('circle', { r: compact ? 1.6 : 3.2, fill: '#dff140' }));
  if (!compact) { const cap = mk('text', { x: L, y: h + 22, fill: '#6c6e6b', 'font-size': 13, 'font-family': 'GeistMono', 'letter-spacing': 1.2 });
    cap.textContent = 'REACH · 8 + 64 + 512 LINKS · 393 SAMPLES, NO GAPS'; }
  let step = 0;
  const showChain = () => { const j = step >> 3, k = step & 7, a2 = 47 * j, a1 = a2 + 8 * k;
    let d = `M${X(0)} ${bot(0)}L${X(a2)} ${top(1)}M${X(a2)} ${bot(1)}L${X(a1)} ${top(2)}`;
    for (let m = 0; m < 8; m++) d += `M${X(a1)} ${bot(2)}L${X(a1 + m)} ${top(3)}`;
    hl.setAttribute('d', d);
    [[X(0), bot(0)], [X(a2), top(1)], [X(a1), top(2)]].forEach(([x, y], n) => { dots[n].setAttribute('cx', x); dots[n].setAttribute('cy', y); }); };
  const iv = setInterval(() => { if (!root.isConnected) return clearInterval(iv); step = (step + 1) % 64; showChain(); }, 650);
  showChain();
  return F => { const M = means();
    ROWS.forEach(([, li], r) => { const arr = M[li], sc = M.scale[li];
      strips[r].forEach((c, b) => { const v = arr[Math.max(0, F.i - 3 * b)]; c.setAttribute('fill', `rgba(223,241,64,${(.06 + .8 * Math.min(1, Math.abs(v) / sc)).toFixed(3)})`); }); }); };
}


export function widget(k, el, big = false) {
  el.classList.add('w'); el.innerHTML = '';
  const add = h => { el.insertAdjacentHTML('beforeend', h); return el.lastElementChild; };
  const strip = () => { const s = add('<div class="strip"></div>'); for (let c = 0; c < 32; c++) s.append(document.createElement('i')); return [...s.children]; };
  const hbar = (name, flip) => { const r = add(`<div class="hb${flip ? ' fl' : ''}"><span>${name}</span><span class="tr"><i></i></span><b></b></div>`);
    return v => { const i = r.querySelector('i'), w = Math.min(50, Math.abs(v) * 50); i.style.left = (v < 0 ? 50 - w : 50) + '%'; i.style.width = w + '%'; r.querySelector('b').textContent = fx(v); }; };
  if (k === 'input') {
    const rows = ['w', 'x', 'y', 'z'].map(c => add(`<div class="rw">${c} <b></b></div>`).querySelector('b'));
    add('<div class="rw dim">1 QUATERNION / 10 MS</div>');
    return F => rows.forEach((b, j) => b.textContent = fx(F.q[j], 4));
  }
  if (k === 'feat') { const u = FEAT.map(n => hbar(n)); if (big) add('<div class="rw dim">BARS: −1 … 0 … +1</div>'); return F => u.forEach((f, j) => f(F.f[j])); }
  if (k === 'mirror') {
    add('<div class="rw dim">OBSERVED H⁰</div>'); const a = FEAT.map(n => hbar(n));
    add('<div class="rw dim" style="margin-top:6px">MIRRORED H¹ (YELLOW = FLIPPED)</div>'); const b = FEAT.map((n, j) => hbar(n, SIGNS[j] < 0));
    return F => { a.forEach((f, j) => f(F.f[j])); b.forEach((f, j) => f(F.fm[j])); };
  }
  if (k === 'proj') {
    add('<div class="rw dim">LANE H⁰ · 32 CHANNELS</div>'); const s0 = strip(); add('<div class="rw dim">LANE H¹ · 32 CHANNELS</div>'); const s1 = strip();
    const act = add('<div class="rw">ACTIVE CHANNELS <b></b></div>').querySelector('b');
    return F => { F.proj[0].forEach((v, c) => s0[c].style.background = heat(v)); F.proj[1].forEach((v, c) => s1[c].style.background = heat(v));
      act.textContent = F.proj.flat().filter(v => v > 0).length + ' / 64'; };
  }
  if (k === 'blocks') {
    if (!big) {
      const sv = add('<svg viewBox="0 0 250 132" style="width:100%;height:auto;display:block;margin:2px 0 8px"></svg>');
      const u = reachTree(sv, 250, 132, true);
      [0, 1, 2].forEach(b => add(`<div class="rw">BLOCK ${b + 1} · EVERY ${DIL[b] === 1 ? 'SAMPLE' : DIL[b] + 'TH'} <b>${(7 * DIL[b] / 100).toFixed(2)} S</b></div>`));
      add('<div class="rw dim">TOGETHER: 393 SAMPLES, 3.9 S</div>');
      return u;
    }
    add('<div class="rw dim">HOW 8 TAPS PER BLOCK REACH 393 SAMPLES</div>');
    const tv = add('<svg viewBox="0 0 300 150" style="width:100%;height:auto;display:block;margin:4px 0 2px"></svg>');
    const tree = reachTree(tv, 300, 150, true, 'PROJ');
    add('<div class="rw dim" style="margin-bottom:14px">8 + 64 + 512 LINKS · 393 SAMPLES, NO GAPS</div>');
    const parts = [0, 1, 2].map(b => {
      add(`<div class="rw">BLOCK ${b + 1} · TAPS ${DIL[b]} APART <b>${(7 * DIL[b] / 100).toFixed(2)} S</b></div>`);
      const sp = add('<svg class="spark" viewBox="0 0 300 34" preserveAspectRatio="none"><path fill="none" stroke="#6c6e6b" stroke-width="1"/><g fill="#dff140"></g></svg>');
      const g = sp.querySelector('g'); for (let j = 0; j < 8; j++) g.insertAdjacentHTML('beforeend', `<rect width="2.5" height="34" y="0"/>`);
      const st = big ? strip() : null; return { sp, g, st };
    });
    add('<div class="rw dim">LINE: THE BLOCK\'S INPUT · YELLOW: THE 8 SAMPLES IT READS</div>');
    return F => { tree(F); parts.forEach(({ sp, g, st }, b) => {
      const h = blockInput(F.i, b), n = h.length, lo = Math.min(...h), hi = Math.max(...h) || 1, X = j => j / (n - 1) * 300, Y = v => 32 - (v - lo) / (hi - lo || 1) * 30;
      sp.querySelector('path').setAttribute('d', h.map((v, j) => (j ? 'L' : 'M') + X(j).toFixed(1) + ' ' + Y(v).toFixed(1)).join(''));
      [...g.children].forEach((r, j) => r.setAttribute('x', (X(n - 1 - j * DIL[b]) - 1.2).toFixed(1)));
      if (st) F.blk[b][0].forEach((v, c) => st[c].style.background = heat(v));
    }); };
  }
  if (k === 'head') {
    const g = add('<div class="g9"><span></span><span>κ</span><span>κ²</span><span>κ³</span></div>'); const cells = [];
    for (let a = 0; a < 3; a++) { g.insertAdjacentHTML('beforeend', `<span>${'xyz'[a]}</span>`); for (let p = 0; p < 3; p++) { const i = document.createElement('i'); g.append(i); cells.push(i); } }
    add('<div class="rw dim" style="margin-top:8px">ROWS: AXIS · COLUMNS: CURVE SHAPE</div>');
    return F => cells.forEach((c, j) => { const v = F.coef[j / 3 | 0][j % 3]; c.style.background = cellFill(v); c.textContent = fx(v).replace('0.', '.'); });
  }
  if (k === 'traj') {
    const sv = add('<svg viewBox="0 0 200 70" style="width:100%;height:' + (big ? 110 : 60) + 'px;display:block"><line x1="0" y1="35" x2="200" y2="35" stroke="#2f3234"/><path fill="none" stroke="#dff140" stroke-width="1.5"/><path fill="none" stroke="#b0b0a9" stroke-width="1.2"/><path fill="none" stroke="#6c6e6b" stroke-width="1.2" stroke-dasharray="3 3"/></svg>');
    add(big ? '<div class="rw dim">TURN EXPECTED OVER 20 STEPS · X <span style="color:#dff140">━</span> Y ━ Z ┅</div>' : '<div class="rw dim">20 STEPS · <span style="color:#dff140">X</span> Y Z</div>');
    const P = [...sv.querySelectorAll('path')];
    return F => { const m = Math.max(1e-6, ...F.r.flat().map(Math.abs));
      P.forEach((p, a) => p.setAttribute('d', F.r.map((v, j) => (j ? 'L' : 'M') + (j / 19 * 200).toFixed(1) + ' ' + (35 - v[a] / m * 32).toFixed(1)).join(''))); };
  }
  if (k === 'out') {
    const e = add('<div class="big"></div>'); const h = add('<div class="rw" style="margin-top:10px">IF THE HEAD HELD STILL <b></b></div>').querySelector('b');
    add('<div class="rw">TEST-SET MEAN (1,049 PLAYERS) <b>4.50°</b></div>');
    const bars = add('<div class="bars"></div>'); for (let j = 0; j < 20; j++) bars.append(document.createElement('i'));
    add('<div class="rw dim">ERROR AT EACH OF THE 20 STEPS · SCORED: THE LAST</div>');
    if (big) { const go = add('<button type="button" class="seepredict">SEE IT PREDICT  →</button>');
      go.addEventListener('click', () => dispatchEvent(new CustomEvent('k8:finale'))); }
    return F => { e.innerHTML = F.err.toFixed(2) + '°<small> OFF</small>'; h.textContent = F.hold.toFixed(2) + '°';
      const m = Math.max(1, ...F.errs); [...bars.children].forEach((b, j) => b.style.height = (F.errs[j] / m * 100) + '%'); };
  }
}

export function level(name, layer, onFrame, api) {
  let clock = null, raf = 0, last = 0, F = null, pauseBtn = null;
  const run = now => { const dt = Math.min(.1, (now - last) / 1000); last = now; if (clock.tick(dt) || !F) { F = frame(clock.i); onFrame(F); }
    if (api.tick) api.tick(dt, clock.playing);
    raf = requestAnimationFrame(run); };
  const key = e => { if (e.key === ' ' && lvl.active) { e.preventDefault(); toggle(); } };
  const setPlaying = p => { clock.playing = p; pauseBtn.textContent = p ? '❚❚ PAUSE (SPACE)' : '▶ PLAY (SPACE)'; if (api.onPlaying) api.onPlaying(p); };
  const toggle = () => setPlaying(!clock.playing);
  const lvl = { name, external: true, layer, active: false, hotspots: [],
    async load() { await loadTrace(); if (!clock) { clock = makeClock(); clock.init(); api.build(); F = frame(clock.i); onFrame(F);
      pauseBtn = document.createElement('button'); pauseBtn.className = 'pause'; pauseBtn.type = 'button'; pauseBtn.textContent = '❚❚ PAUSE (SPACE)';
      pauseBtn.addEventListener('click', toggle); layer.append(pauseBtn); addEventListener('keydown', key); } },
    enter() { this.active = true; last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(run); },
    leave() { this.active = false; cancelAnimationFrame(raf); },
    reset() { api.select(null); },
    unzoom() { api.select(null); },
    get frame() { return F; },
    seek(i) { if (!clock) return; clock.i = Math.max(clock.first, Math.min(clock.last, i)); clock.acc = 0; F = frame(clock.i); onFrame(F); },
    setPlaying(p) { if (clock) setPlaying(p); },
    get clip() { return clock ? { first: clock.first, last: clock.last, playing: clock.playing } : null; },
  };
  return lvl;
}

const A_CSS = `
#mvA .stage { position: absolute; left: 0; top: 0; width: 62vw; height: 100%; perspective: 1600px; display: grid; place-items: center; }
#mvA .die { width: min(58vw, 96vh); aspect-ratio: 1.3; transform-style: preserve-3d; border-radius: 4px;
  box-shadow: 0 60px 120px rgba(0,0,0,.9), 0 0 0 1px #1c1f22; transition: transform 1.2s cubic-bezier(.65,0,.35,1); }
#mvA .die svg { width: 100%; height: 100%; display: block; }
#mvA .st { cursor: pointer; }
#mvA .st .hit { fill: transparent; }
#mvA .st .dot { fill: #010101; stroke: #f1f0ea; stroke-width: 1.5; transition: r .2s; }
#mvA .st .core { fill: #f1f0ea; }
#mvA .st .lab { font: 500 15px GeistMono, monospace; letter-spacing: 1.5px; fill: #dff140; opacity: 0; transition: opacity .2s; pointer-events: none; }
#mvA .st:hover .dot, #mvA .st.on .dot { stroke: #dff140; r: 14; } #mvA .st:hover .core, #mvA .st.on .core { fill: #dff140; }
#mvA .st:hover .lab, #mvA .st.on .lab { opacity: 1; }
#mvA .panel { position: absolute; right: 0; top: 0; width: 38vw; height: 100%; box-sizing: border-box; padding: 92px 56px 90px 40px; overflow-y: auto;
  background: linear-gradient(90deg, rgba(1,1,1,0), #010101 12%); }
#mvA h1 { font-weight: 500; font-size: clamp(30px, 3vw, 44px); line-height: 1.02; letter-spacing: -.02em; margin: 0 0 40px; }
#mvA .row { border-top: 1px solid #2f3234; }
#mvA .row:last-child { border-bottom: 1px solid #2f3234; }
#mvA .row > button { all: unset; box-sizing: border-box; width: 100%; display: grid; grid-template-columns: 56px 1fr 20px; align-items: center; min-height: 46px; font-size: 17px; color: #b0b0a9; cursor: pointer; }
#mvA .row > button:hover { color: #f1f0ea; }
#mvA .row > button:focus-visible { outline: 1px solid #dff140; outline-offset: 2px; }
#mvA .row .n { color: #6c6e6b; font: 14px GeistMono; } #mvA .row .pm { text-align: right; color: #6c6e6b; font-size: 21px; font-weight: 300; }
#mvA .row.open > button { color: #f1f0ea; } #mvA .row.open .pm { color: #f1f0ea; }
#mvA .row .body { display: none; padding: 4px 0 22px 56px; }
#mvA .row.open .body { display: block; }
#mvA .row .body p { font-size: 18px; line-height: 1.35; margin: 0 0 16px; }
#mvA .hud { position: absolute; left: 40px; top: 30px; font-size: 12px; color: #b0b0a9; }
#mvA .hud b { color: #f1f0ea; font-weight: 500; }
#mvA .nav { position: absolute; right: 56px; bottom: 30px; display: flex; gap: 12px; }
#mvA .circ { all: unset; width: 44px; height: 44px; border: 1px solid #f1f0ea; border-radius: 50%; display: grid; place-items: center; font-size: 17px; cursor: pointer; }
#mvA .circ:hover { background: #f1f0ea; color: #010101; }
#mvA .note { position: absolute; left: 40px; bottom: 74px; font-size: 10.5px; color: #6c6e6b; }
#mvA .st .hit2, #mvA .prule, #mvA .phint, #mvA .morebtn, #mvA .row .n i { display: none; }
html.phone #mvA .stage { top: var(--ph); width: 100%; height: calc(100% - var(--ph) - 116px); }
html.phone #mvA .die { width: min(94vw, calc((100vh - var(--ph) - 136px) * 1.3)); }
html.phone #mvA .st .hit2 { display: inline; fill: transparent; }
html.phone #mvA .st .dot { r: 16px; } html.phone #mvA .st .core { r: 6px; } html.phone #mvA .st:hover .dot, html.phone #mvA .st.on .dot { r: 20px; }
html.phone #mvA .panel { left: 0; right: 0; width: auto; height: var(--ph); padding: 12px 16px 64px; overflow: hidden; display: flex; flex-direction: column;
  background: rgba(1,1,1,.35); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); }
html.phone #mvA.more .panel { height: var(--pmore); overflow-y: auto; }
html.phone #mvA h1 { flex: none; min-height: 44px; display: flex; align-items: center; margin: 0 112px 6px 0; font-size: 24px; }
html.phone #mvA h1 br { display: none; }
html.phone #mvA .prule { display: block; flex: none; position: relative; height: 1px; background: #2f3234; margin: 4px 0 10px; }
html.phone #mvA .prule::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: calc(var(--p, 0) * 100%); background: #dff140; transition: width .4s; }
html.phone #mvA:not(.has-open) .phint { display: block; margin: 0; font-size: 11px; line-height: 1.5; color: #b0b0a9; }
html.phone #mvA .row, html.phone #mvA .row:last-child { display: none; border: 0; }
html.phone #mvA .row.open { display: block; }
html.phone #mvA .row > button { display: flex; gap: 14px; min-height: 0; padding-bottom: 6px; font: 500 12px/1.3 GeistMono, monospace; letter-spacing: .08em; text-transform: uppercase; color: #f1f0ea; }
html.phone #mvA .row .n { font: inherit; color: #dff140; } html.phone #mvA .row .n i { display: inline; font-style: normal; color: #6c6e6b; }
html.phone #mvA .row .pm, html.phone #mvA .row .wg { display: none; }
html.phone #mvA .row .body { padding: 0; }
html.phone #mvA .row .body p { font-size: 15px; line-height: 1.32; margin: 0; cursor: pointer; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
html.phone #mvA.more .row .body p { display: block; margin-bottom: 14px; } html.phone #mvA.more .row .wg { display: block; }
html.phone #mvA .nav { top: calc(var(--ph) - 56px); right: 12px; bottom: auto; gap: 10px; }
html.phone #mvA.has-open .morebtn { display: block; position: absolute; left: 16px; top: calc(var(--ph) - 56px); height: 44px; padding: 0; background: none; border: 0;
  font-size: 11px; color: #b0b0a9; cursor: pointer; }
html.phone #mvA.more .nav, html.phone #mvA.more .morebtn { top: calc(var(--pmore) - 56px); }
html.phone #mvA .note { left: 16px; right: 16px; top: calc(var(--ph) + 8px); bottom: auto; font-size: 9px; line-height: 1.5; }
`;
const AZ = { input: [105, 500, 2.6], feat: [215, 500, 2.6], mirror: [230, 620, 2.4], proj: [345, 500, 2.2], blocks: [665, 640, 1.3],
  head: [1085, 500, 2.4], traj: [1085, 690, 2.4], out: [1195, 500, 2.4] };
export function makeA(ctx) {
  addCSS(A_CSS);
  const layer = document.createElement('div'); layer.className = 'mv'; layer.id = 'mvA';
  let sel = null, live = null, cellsP = [], cellsB = [], cellsR = [], outTxt = null, trajP = null, taps = [], reachUpd = null, pulseTick = null;
  const api = {
    tick(dt, playing) { if (pulseTick && playing) pulseTick(dt); },
    build() {
      layer.innerHTML = `<div class="stage"><div class="die"></div></div>
        <aside class="panel"><h1>k8:<br> Inside the NPU</h1><div class="prule"></div><p class="phint mono">Tap a stage on the chip, or use → to step through</p><div class="rows"></div></aside>
        <button type="button" class="morebtn mono" aria-expanded="false">MORE +</button>
        <div class="nav"><button class="circ" data-d="-1" aria-label="Previous stage">←</button><button class="circ" data-d="1" aria-label="Next stage">→</button></div>
        <div class="note mono">ILLUSTRATIVE FLOORPLAN, NOT TO SCALE · LIVE VALUES: TEST PLAYER, QUARTER SPEED</div>`;
      const die = layer.querySelector('.die'); die.innerHTML = dieSVG();
      const svg = die.querySelector('svg'), NS = 'http://www.w3.org/2000/svg';
      const HIT = { input: [55, 425, 100, 150], feat: [170, 435, 90, 130], mirror: [160, 585, 140, 90], proj: [290, 330, 110, 340], blocks: [430, 300, 560, 380],
        head: [1030, 410, 105, 150], traj: [1025, 630, 120, 110], out: [1145, 425, 100, 150] };
      const rg = document.createElementNS(NS, 'g'); rg.setAttribute('transform', 'translate(300 768)'); svg.append(rg);
      reachUpd = reachTree(rg, 700, 150, false);
      for (const s of STAGES) {
        const [x, y, w, h] = HIT[s.k], [cx, cy] = s.k === 'blocks' ? [735, 500] : AZ[s.k], g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'st'); g.dataset.k = s.k; g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', s.title);
        g.innerHTML = (s.k === 'blocks' ? '<rect class="hit" x="300" y="760" width="700" height="185"/>' : '') + `<rect class="hit" x="${x}" y="${y}" width="${w}" height="${h}"/><circle class="hit2" cx="${cx}" cy="${cy}" r="54"/><circle class="dot" cx="${cx}" cy="${cy}" r="10"/><circle class="core" cx="${cx}" cy="${cy}" r="3.5"/>
          <text class="lab" x="${cx + 20}" y="${cy - 16}">${s.short.split('\n')[0]}</text>`;
        g.addEventListener('click', () => api.select(s.k)); g.addEventListener('keydown', e => { if (e.key === 'Enter') api.select(s.k); });
        svg.append(g);
      }
      pulseTick = modelPulse(svg);
      layer.querySelector('.note').textContent += ' · LIGHT: ONE SAMPLE THROUGH K8, SLOWED DOWN';
      cellsP = [...svg.querySelectorAll('.cp')]; cellsB = [...svg.querySelectorAll('.cb')]; cellsR = [...svg.querySelectorAll('.cr')];
      outTxt = svg.querySelector('#aOut'); trajP = [...svg.querySelectorAll('.tj')]; taps = [...svg.querySelectorAll('.tap')];
      const rows = layer.querySelector('.rows');
      for (const s of STAGES) {
        rows.insertAdjacentHTML('beforeend', `<div class="row" data-k="${s.k}"><button type="button" aria-expanded="false"><span class="n">${s.n}<i>/${String(STAGES.length).padStart(2, '0')}</i></span><span>${s.title}</span><span class="pm">+</span></button><div class="body"><p>${s.text}</p><div class="wg"></div></div></div>`);
        rows.lastElementChild.querySelector('button').addEventListener('click', () => api.select(sel === s.k ? null : s.k));
      }
      layer.querySelectorAll('.circ').forEach(b => b.addEventListener('click', () => {
        const j = sel ? STAGES.findIndex(s => s.k === sel) : -1, d = +b.dataset.d; api.select(STAGES[(j + d + STAGES.length) % STAGES.length].k); }));
      const more = on => { layer.classList.toggle('more', on); const m = layer.querySelector('.morebtn'); m.textContent = on ? 'LESS —' : 'MORE +'; m.setAttribute('aria-expanded', on); };
      api.more = more;
      layer.querySelector('.morebtn').addEventListener('click', () => more(!layer.classList.contains('more')));
      rows.addEventListener('click', e => { if (isPhone() && e.target.closest('.body p')) more(!layer.classList.contains('more')); });
      addEventListener('resize', () => api.select(sel));
      api.select(null);
    },
    select(k) {
      sel = k;
      const die = layer.querySelector('.die'); if (!die) return;
      const phone = isPhone();
      if (!k) die.style.transform = phone ? 'rotateX(22deg) rotateZ(-8deg)' : 'rotateX(34deg) rotateZ(-12deg)';
      else { const [cx, cy, s] = AZ[k], W = die.offsetWidth, H = die.offsetHeight;
        die.style.transform = `${phone ? 'rotateX(18deg) rotateZ(-4deg)' : 'rotateX(24deg) rotateZ(-6deg)'} scale(${s}) translate(${(-(cx / 1300 - .5) * W).toFixed(1)}px, ${(-(cy / 1000 - .5) * H).toFixed(1)}px)`; }
      const j = STAGES.findIndex(s => s.k === k);
      layer.classList.toggle('has-open', j >= 0); layer.querySelector('.prule').style.setProperty('--p', (j + 1) / STAGES.length);
      if (api.more) api.more(false);
      layer.querySelectorAll('.st').forEach(g => g.classList.toggle('on', g.dataset.k === k));
      layer.querySelectorAll('.row').forEach(r => { const on = r.dataset.k === k; r.classList.toggle('open', on);
        r.querySelector('button').setAttribute('aria-expanded', on); r.querySelector('.pm').textContent = on ? '—' : '+'; });
      live = null;
      if (k) { const wg = layer.querySelector(`.row[data-k="${k}"] .wg`); live = widget(k, wg, true); if (lvl.frame) live(lvl.frame); }
      ctx.setZoomed(!!k);
    },
  };
  function onFrame(F) {
    cellsP.forEach((c, j) => c.setAttribute('fill', heat(F.proj[j >> 5][j & 31])));
    cellsB.forEach((c, j) => { const b = Math.floor(j / 64), r = j % 64; c.setAttribute('fill', heat(F.blk[b][r >> 5][r & 31])); });
    cellsR.forEach((c, j) => c.setAttribute('fill', cellFill(F.coef[j / 3 | 0][j % 3])));
    if (outTxt) outTxt.textContent = F.err.toFixed(2) + '°';
    if (trajP.length) { const m = Math.max(1e-6, ...F.r.flat().map(Math.abs));
      trajP.forEach((p, a) => p.setAttribute('d', F.r.map((v, j) => (j ? 'L' : 'M') + (1035 + j / 19 * 100).toFixed(1) + ' ' + (690 - v[a] / m * 34).toFixed(1)).join(''))); }
    if (reachUpd) reachUpd(F);
    if (live) live(F);
  }
  const lvl = level('04 / MODEL · A ETCHED', layer, onFrame, api);
  layer.addEventListener('pointerdown', e => { if (e.target.closest('.st, .panel, .circ, .pause')) return; if (sel) api.select(null); });
  return lvl;
}

function modelPulse(svg) {
  const NS = 'http://www.w3.org/2000/svg', mk = (tag, a, p) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); (p || svg).append(e); return e; };
  const R = [
    { p: [105, 470], s: 'input', hold: .3 }, { p: [180, 470] }, { p: [215, 470], s: 'feat', hold: .35 }, { p: [250, 470] }, { p: [250, 380] },
    { p: [345, 380], s: 'proj', hold: .35 }, { p: [515, 380], s: 'b1', hold: .3 }, { p: [710, 380], s: 'b2', hold: .3 }, { p: [905, 380], s: 'b3', hold: .3 },
    { p: [1030, 380] }, { p: [1030, 470] }, { p: [1080, 470], s: 'head', hold: .45 }, { p: [1085, 470] }, { p: [1085, 690], s: 'traj', hold: .35 },
    { p: [1195, 690] }, { p: [1195, 500], s: 'out', hold: .6 },
  ];
  const MERGE = R.findIndex(r => r.s === 'head');
  const BOX = { input: [[60, 430, 90, 140]], feat: [[180, 440, 70, 120]], proj: [[300, 340, 90, 80], [300, 580, 90, 80]],
    b1: [[440, 330, 150, 100], [440, 570, 150, 100]], b2: [[635, 330, 150, 100], [635, 570, 150, 100]], b3: [[830, 330, 150, 100], [830, 570, 150, 100]],
    head: [[1034, 424, 112, 148]], traj: [[1030, 640, 110, 100]], out: [[1150, 430, 90, 140]] };
  const defs = mk('defs', {}); defs.innerHTML = '<filter id="aGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>';
  const g = mk('g', { 'pointer-events': 'none' });
  const glows = {}; for (const k in BOX) glows[k] = BOX[k].map(([x, y, w, h]) => mk('rect', { x, y, width: w, height: h, fill: '#dff140', 'fill-opacity': 0, stroke: '#dff140', 'stroke-opacity': 0, 'stroke-width': 2 }, g));
  const lane = op => ({ tail: mk('path', { fill: 'none', stroke: '#dff140', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: .85 * op }, g),
    halo: mk('circle', { r: 18, fill: '#dff140', opacity: .6 * op, filter: 'url(#aGlow)' }, g), core: mk('circle', { r: 5.5, fill: '#ffffff', opacity: op }, g) });
  const top = lane(1), bot = lane(.55);
  const cum = [0]; for (let i = 1; i < R.length; i++) cum.push(cum[i - 1] + Math.hypot(R[i].p[0] - R[i - 1].p[0], R[i].p[1] - R[i - 1].p[1]));
  const pointAt = d => { d = Math.max(0, Math.min(cum[cum.length - 1], d)); let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
    const f = cum[i] > cum[i - 1] ? (d - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0, a = R[i - 1].p, b = R[i].p; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
  const ease = x => x < .5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2, SPEED = 560;
  const stops = R.map((r, i) => ({ d: cum[i], s: r.s, hold: r.hold || 0 })).filter(r => r.s);
  const plan = []; let T = 0;
  stops.forEach((st, k) => { if (k) { const pv = stops[k - 1], dur = (st.d - pv.d) / SPEED; plan.push({ t0: T, t1: T + dur, d0: pv.d, d1: st.d }); T += dur; }
    plan.push({ t0: T, t1: T + st.hold, d0: st.d, d1: st.d, s: st.s }); T += st.hold; });
  const total = T + .8, mergeD = cum[MERGE];
  const at = t => { for (const seg of plan) if (t < seg.t1) { if (seg.d0 === seg.d1) return { d: seg.d0, v: 0, s: seg.s };
      const x = (t - seg.t0) / (seg.t1 - seg.t0); return { d: seg.d0 + (seg.d1 - seg.d0) * ease(x), v: 1 - Math.abs(2 * x - 1) }; }
    return { d: cum[cum.length - 1], v: 0, done: true }; };
  const mirror = ([x, y]) => [x, 1000 - y];
  const place = (L, d, v, show, flip) => {
    const P = q => flip ? mirror(pointAt(q)) : pointAt(q), [x, y] = P(d);
    for (const e of [L.halo, L.core]) { e.setAttribute('cx', x.toFixed(1)); e.setAttribute('cy', y.toFixed(1)); e.style.display = show ? '' : 'none'; }
    const len = 140 * v; let path = '';
    if (show && len > 2) for (let i = 0; i <= 10; i++) { const [a, b] = P(d - len * (1 - i / 10)); path += (i ? 'L' : 'M') + a.toFixed(1) + ' ' + b.toFixed(1); }
    L.tail.setAttribute('d', path);
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { place(top, 0, 0, false); place(bot, 0, 0, false, true); return () => {}; }
  let clock = 0;
  return dt => {
    clock = (clock + dt) % total; const now = at(clock);
    place(top, now.d, now.v, !now.done, false);
    place(bot, Math.min(now.d, mergeD), now.d < mergeD ? now.v : 0, !now.done && now.d < mergeD - 1, true);
    for (const k in glows) { const on = now.s === k ? 1 : 0;
      for (const r of glows[k]) { const f = +r.getAttribute('fill-opacity'), o = f + (on * .14 - f) * Math.min(1, dt * 9);
        r.setAttribute('fill-opacity', o.toFixed(3)); r.setAttribute('stroke-opacity', (o / .14 * .9).toFixed(3)); } }
  };
}

function dieSVG() {
  const o = [];
  o.push(`<svg viewBox="0 0 1300 1000" aria-label="The k8 model drawn as a floorplan on the NPU tile">
  <defs><pattern id="aCells" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#0e110d"/><rect x="2" y="2" width="5" height="5" fill="#151a13"/></pattern>
  <linearGradient id="aSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3f6a" stop-opacity=".18"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#5a6a3a" stop-opacity=".16"/></linearGradient></defs>
  <rect width="1300" height="1000" fill="url(#aCells)"/>`);
  for (let i = 0; i < 26; i++) { const x = 40 + i * 47.6; o.push(`<rect x="${x}" y="14" width="22" height="22" fill="#7d7150"/><rect x="${x}" y="964" width="22" height="22" fill="#7d7150"/>`); }
  for (let i = 0; i < 20; i++) { const y = 40 + i * 47.6; o.push(`<rect x="14" y="${y}" width="22" height="22" fill="#7d7150"/><rect x="1264" y="${y}" width="22" height="22" fill="#7d7150"/>`); }
  const L0 = 'M150 470 H250 V380 H1030 V470 H1150', L1 = 'M150 530 H250 V620 H1030 V530 H1150';
  o.push(`<g fill="none" stroke="#3b3a2c" stroke-width="7" stroke-linejoin="round"><path d="${L0}"/><path d="${L1}"/><path d="M1085 560 V640 M1135 690 H1195 V570"/></g>
  <g font-family="GeistMono, monospace" font-size="17" letter-spacing="1.5" fill="#b0b0a9">
  <rect x="60" y="430" width="90" height="140" fill="#1b1d1f" stroke="#6c6e6b"/><text x="62" y="418">IN · WXYZ</text>
  <rect x="180" y="440" width="70" height="120" fill="#1a1e16" stroke="#6c6e6b"/><text x="176" y="590">FEAT 7</text>
  <path d="M215 455 V545" stroke="#dff140" stroke-width="1" stroke-dasharray="4 5"/>
  <text x="166" y="655" font-size="14" fill="#6c6e6b">MIRROR: FLIP ωY ωZ GX</text>
  <text x="290" y="318">PROJ 7→32</text>
  <path d="M300 712 H1000" stroke="#505544" stroke-width="2"/><text x="520" y="742" font-size="14" fill="#6c6e6b">SHARED WEIGHTS · BOTH LANES</text>
  <text x="1030" y="410">READOUT 3×3</text>
  <rect x="1030" y="640" width="110" height="100" fill="#151a13" stroke="#6c6e6b"/><text x="1030" y="770" font-size="14">TRAJECTORY</text>
  <rect x="1150" y="430" width="90" height="140" fill="#1b1d1f" stroke="#dff140"/><text x="1136" y="600" fill="#dff140">OUT +200 MS</text>
  <text id="aOut" x="1195" y="552" text-anchor="middle" font-size="22" fill="#f1f0ea">–</text>`);
  for (const [l, y] of [[0, 340], [1, 580]]) { o.push(`<rect x="300" y="${y}" width="90" height="80" fill="#10130e" stroke="#6c6e6b"/>`);
    for (let c = 0; c < 32; c++) o.push(`<rect class="cp" x="${303 + (c % 8) * 10.6}" y="${y + 3 + (c >> 3) * 18.6}" width="9" height="16" fill="#111"/>`); }
  ['BLOCK 1 · D1', 'BLOCK 2 · D8', 'BLOCK 3 · D47'].forEach((name, b) => {
    const x = 440 + b * 195; o.push(`<text x="${x}" y="312">${name}</text>`);
    for (const [l, y] of [[0, 330], [1, 570]]) {
      o.push(`<rect x="${x}" y="${y}" width="150" height="100" fill="#151a13" stroke="#6c6e6b"/>`);
      const px = 130 / 329;
      for (let j = 0; j < 8; j++) o.push(`<rect class="tap" x="${(x + 140 - j * [1, 8, 47][b] * px).toFixed(1)}" y="${y + 12}" width="3" height="30" fill="#dff140" opacity="${b === 0 ? .9 : .8}"/>`);
      o.push(`<line x1="${x + 10}" y1="${y + 44}" x2="${x + 142}" y2="${y + 44}" stroke="#505544"/>`);
      for (let c = 0; c < 32; c++) o.push(`<rect class="cb" x="${(x + 10 + c * 4.1).toFixed(1)}" y="${y + 56}" width="3.4" height="32" fill="#111"/>`);
    }
  });
  for (let a = 0; a < 3; a++) for (let p = 0; p < 3; p++) o.push(`<rect class="cr" x="${1040 + p * 30}" y="${430 + a * 46}" width="26" height="42" fill="#222" stroke="#2f3234"/>`);
  o.push(`<path class="tj" fill="none" stroke="#dff140" stroke-width="2"/><path class="tj" fill="none" stroke="#b0b0a9" stroke-width="1.5"/><path class="tj" fill="none" stroke="#6c6e6b" stroke-width="1.5" stroke-dasharray="4 4"/>`);
  o.push(`</g><rect width="1300" height="1000" fill="url(#aSheen)" pointer-events="none"/></svg>`);
  return o.join('');
}

const B_CSS = `
#mvB { background: #010101 radial-gradient(circle, #1a1c1d 1px, transparent 1px) 0 0 / 24px 24px; }
#mvB .bar { position: absolute; left: 40px; right: 40px; top: 66px; display: flex; gap: 26px; align-items: center; font-size: 12px; color: #b0b0a9; flex-wrap: wrap; }
#mvB .bar b { color: #f1f0ea; font-weight: 500; font-variant-numeric: tabular-nums; }
#mvB .bar .live { color: #dff140; } #mvB .bar .live::before { content: '● '; }
#mvB .bar .live.off { color: #6c6e6b; }
#mvB .bar .sp { flex: 1; }
#mvB h1 { position: absolute; left: 40px; top: 100px; margin: 0; font-weight: 500; font-size: clamp(34px, 3.8vw, 56px); letter-spacing: -.025em; line-height: 1; transition: opacity .4s; }
#mvB h1 small { display: block; font: 400 15px/1.5 Geist; color: #b0b0a9; letter-spacing: 0; margin-top: 12px; max-width: 46em; }
#mvB .vp { position: absolute; left: 40px; right: 40px; top: 232px; bottom: 100px; }
#mvB .flow { position: absolute; left: 0; top: 0; width: 1360px; height: 470px; transform-origin: 0 0; transition: transform 1.1s cubic-bezier(.65,0,.35,1); }
#mvB .wires { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
#mvB .wires .w0 { fill: none; stroke: #6c6e6b; stroke-width: 1; }
#mvB .wires .wp { fill: none; stroke: #dff140; stroke-width: 2; stroke-dasharray: 14 86; animation: mvflow 1.8s linear infinite; }
#mvB.paused .wires .wp { animation-play-state: paused; }
#mvB .node { all: unset; position: absolute; box-sizing: border-box; padding: 14px 14px 12px; background: rgba(1,1,1,.88); cursor: pointer; transition: opacity .5s; }
#mvB .node::before, #mvB .node::after { content: ''; position: absolute; width: 12px; height: 12px; border: 1px solid #6c6e6b; transition: all .2s; }
#mvB .node::before { left: -1px; top: -1px; border-right: 0; border-bottom: 0; }
#mvB .node::after { right: -1px; bottom: -1px; border-left: 0; border-top: 0; }
#mvB .node:hover::before, #mvB .node:hover::after, #mvB .node.on::before, #mvB .node.on::after { border-color: #dff140; width: 18px; height: 18px; }
#mvB .node:focus-visible { outline: 1px solid #dff140; }
#mvB .node .hd { display: flex; justify-content: space-between; font: 11.5px GeistMono; letter-spacing: .06em; color: #f1f0ea; margin-bottom: 10px; text-transform: uppercase; }
#mvB .node .hd span:first-child { color: #6c6e6b; }
#mvB .node.on .hd, #mvB .node:hover .hd { color: #dff140; }
#mvB.zoomed .node:not(.on) { opacity: .22; }
#mvB .detail { position: absolute; right: 0; top: 0; bottom: 0; width: min(440px, 34vw); box-sizing: border-box; padding: 140px 40px 90px; background: #010101; border-left: 1px solid #2f3234;
  transform: translateX(100%); transition: transform .7s cubic-bezier(.65,0,.35,1); overflow-y: auto; }
#mvB.zoomed .detail { transform: none; }
#mvB .detail .k { font: 12px GeistMono; color: #dff140; letter-spacing: .08em; }
#mvB .detail h2 { font-weight: 500; font-size: 32px; letter-spacing: -.02em; line-height: 1.05; margin: 10px 0 18px; }
#mvB .detail p { font-size: 17px; line-height: 1.4; margin: 0 0 22px; }
#mvB .detail .x { all: unset; position: absolute; right: 32px; top: 84px; width: 40px; height: 40px; border-radius: 50%; background: #565654; display: grid; place-items: center; cursor: pointer; }
#mvB .tick { position: absolute; left: 0; right: 0; bottom: 0; height: 36px; border-top: 1px solid #2f3234; overflow: hidden; font: 11.5px/36px GeistMono; letter-spacing: .05em; color: #6c6e6b; white-space: nowrap; padding-left: 40px; }
#mvB .tick b { color: #f1f0ea; font-weight: 400; }
#mvB .pause { bottom: 54px; }
#mvB .scrub { position: absolute; left: 40px; right: 40px; bottom: 112px; display: flex; align-items: center; gap: 14px; }
#mvB .vp { bottom: 160px; }
#mvB > .pause { display: none; }
#mvB .scrub .sbtn { all: unset; cursor: pointer; width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid #2f3234; color: #f1f0ea; font-size: 11px; }
#mvB .scrub .sbtn:hover { border-color: #dff140; color: #dff140; }
#mvB .scrub .sbtn:focus-visible { outline: 2px solid #dff140; outline-offset: 2px; }
#mvB .scrub input { flex: 1; appearance: none; -webkit-appearance: none; height: 30px; background: none; cursor: pointer; margin: 0; }
#mvB .scrub input::-webkit-slider-runnable-track { height: 2px; background: #2f3234; }
#mvB .scrub input::-moz-range-track { height: 2px; background: #2f3234; }
#mvB .scrub input::-webkit-slider-thumb { -webkit-appearance: none; width: 4px; height: 18px; margin-top: -8px; background: #dff140; border: 0; }
#mvB .scrub input::-moz-range-thumb { width: 4px; height: 18px; background: #dff140; border: 0; border-radius: 0; }
#mvB .scrub input:focus-visible { outline: 2px solid #dff140; outline-offset: 2px; }
#mvB .scrub .stime { font: 11.5px GeistMono; letter-spacing: .05em; color: #b0b0a9; min-width: 128px; text-align: right; font-variant-numeric: tabular-nums; }
html.phone #mvB .bar { left: 16px; right: 16px; top: 64px; gap: 4px 14px; font-size: 10px; }
html.phone #mvB h1 { left: 16px; right: 16px; top: 122px; font-size: 26px; }
html.phone #mvB h1 small { font-size: 13px; }
html.phone #mvB .vp { left: 16px; right: 16px; top: 286px; bottom: 166px; }
html.phone #mvB.zoomed .vp { top: 122px; }
html.phone #mvB .detail { z-index: 2; left: 0; right: 0; top: auto; bottom: calc(66px + env(safe-area-inset-bottom)); width: auto; height: calc(50% - 50px); padding: 18px 16px 24px; border-left: 0; border-top: 1px solid #2f3234; transform: translateY(calc(100% + 66px + env(safe-area-inset-bottom))); }
html.phone #mvB.zoomed .detail { transform: none; }
html.phone #mvB .detail .x { top: 10px; right: 12px; width: 44px; height: 44px; }
html.phone #mvB .detail h2 { font-size: 24px; margin-right: 56px; } html.phone #mvB .detail p { font-size: 15px; }
html.phone #mvB .scrub { left: 16px; right: 16px; bottom: 112px; gap: 10px; }
html.phone #mvB .scrub .sbtn { width: 44px; height: 44px; } html.phone #mvB .scrub .stime { min-width: 0; font-size: 10px; }
html.phone #mvB .tick { bottom: 66px; padding-left: 16px; }
`;
const BN = { input: [0, 120, 150], feat: [195, 20, 190], mirror: [195, 300, 190], proj: [430, 120, 175], blocks: [650, 40, 270], head: [965, 20, 160], traj: [965, 270, 160], out: [1170, 120, 190] };
const BW = [['input', 'feat'], ['input', 'mirror'], ['feat', 'proj'], ['mirror', 'proj'], ['proj', 'blocks'], ['blocks', 'head'], ['blocks', 'traj'], ['head', 'out'], ['traj', 'out']];
export function makeB(ctx) {
  addCSS(B_CSS);
  const layer = document.createElement('div'); layer.className = 'mv'; layer.id = 'mvB';
  let sel = null, lives = [], detailLive = null, hdr = {}, tickEl = null, fit = 1, scrub = null, scrubTime = null, scrubBtn = null;
  const api = {
    onPlaying(p) {
      layer.classList.toggle('paused', !p); const live = layer.querySelector('.bar .live');
      if (live) { live.classList.toggle('off', !p); live.textContent = p ? 'LIVE · QUARTER SPEED' : 'PAUSED'; }
      if (scrubBtn) { scrubBtn.textContent = p ? '❚❚' : '▶'; scrubBtn.setAttribute('aria-label', p ? 'Pause' : 'Play'); }
    },
    build() {
      layer.innerHTML = `<div class="bar mono"><span class="live">LIVE · QUARTER SPEED</span><span>SAMPLE <b data-h="t"></b></span><span>T <b data-h="time"></b></span><span class="sp"></span><span>44,196 BYTES</span><span>≈78 <span style="text-transform:none">µs</span> / CALL ON A PC</span></div>
        <h1>One prediction, every 10 ms.<small>The newest head orientation comes in on the left. Seven stages later, 20 future poses come out on the right. Click a stage.</small></h1>
        <div class="vp"><div class="flow"><svg class="wires"></svg></div></div>
        <aside class="detail" aria-live="polite"><button class="x" type="button" aria-label="Close">✕</button><div class="k"></div><h2></h2><p></p><div class="wg"></div></aside>
        <div class="scrub"><button type="button" class="sbtn" aria-label="Pause">❚❚</button><input type="range" step="1" aria-label="Position in the test clip"><span class="stime mono"></span></div>
        <div class="tick"></div>`;
      layer.querySelectorAll('[data-h]').forEach(b => hdr[b.dataset.h] = b);
      scrub = layer.querySelector('.scrub input'); scrubTime = layer.querySelector('.stime'); scrubBtn = layer.querySelector('.sbtn');
      const c = lvl.clip; scrub.min = c.first; scrub.max = c.last; scrub.value = c.first;
      scrub.addEventListener('input', () => { if (lvl.clip.playing) lvl.setPlaying(false); lvl.seek(+scrub.value); });
      scrubBtn.addEventListener('click', () => lvl.setPlaying(!lvl.clip.playing));
      tickEl = layer.querySelector('.tick');
      const flow = layer.querySelector('.flow');
      for (const s of STAGES) {
        const [x, y, w] = BN[s.k], b = document.createElement('button'); b.type = 'button'; b.className = 'node'; b.dataset.k = s.k;
        Object.assign(b.style, { left: x + 'px', top: y + 'px', width: w + 'px' });
        b.innerHTML = `<div class="hd"><span>${s.n}</span><span>${s.short.split('\n')[0]}</span></div><div class="wg"></div>`;
        b.addEventListener('click', () => api.select(sel === s.k ? null : s.k));
        flow.append(b);
        const wg = b.querySelector('.wg'); lives.push(s.k === 'mirror' ? miniMirror(wg) : widget(s.k, wg));
      }
      const svg = flow.querySelector('.wires'), at = k => flow.querySelector(`.node[data-k="${k}"]`);
      for (const [a, b] of BW) { const A = at(a), B = at(b), x0 = A.offsetLeft + A.offsetWidth, y0 = A.offsetTop + A.offsetHeight / 2, x1 = B.offsetLeft, y1 = B.offsetTop + B.offsetHeight / 2, mx = (x0 + x1) / 2;
        const d = `M${x0} ${y0} H${mx} V${y1} H${x1}`; svg.insertAdjacentHTML('beforeend', `<path class="w0" d="${d}"/><path class="wp" pathLength="100" d="${d}"/>`); }
      layer.querySelector('.detail .x').addEventListener('click', () => api.select(null));
      addEventListener('resize', () => api.select(sel));
      api.select(null);
    },
    select(k) {
      sel = k; const flow = layer.querySelector('.flow'), vp = layer.querySelector('.vp'); if (!flow) return;
      layer.classList.toggle('zoomed', !!k); layer.querySelector('h1').style.opacity = k ? (isPhone() ? 0 : .15) : 1;
      const W = vp.clientWidth, H = vp.clientHeight; fit = Math.min(1, W / 1360, H / 470);
      layer.querySelectorAll('.node').forEach(n => n.classList.toggle('on', n.dataset.k === k));
      if (!k) { flow.style.transform = `translate(${((W - 1360 * fit) / 2).toFixed(0)}px, 0) scale(${fit})`; detailLive = null; ctx.setZoomed(false); return; }
      const n = flow.querySelector(`.node[data-k="${k}"]`), det = layer.querySelector('.detail'), phone = isPhone();
      const room = phone ? W : W - det.offsetWidth + 40, Hv = phone ? Math.max(80, det.offsetTop - vp.offsetTop) : H;
      const s = Math.min(2.2, (room * (phone ? .8 : .55)) / n.offsetWidth, (Hv * .9) / n.offsetHeight), cx = n.offsetLeft + n.offsetWidth / 2, cy = n.offsetTop + n.offsetHeight / 2;
      flow.style.transform = `translate(${(room / 2 - cx * s).toFixed(0)}px, ${(Hv / 2 - cy * s).toFixed(0)}px) scale(${s.toFixed(3)})`;
      const st = byK[k], d = layer.querySelector('.detail');
      d.querySelector('.k').textContent = st.n + ' · ' + st.short.replace('\n', ' · ');
      d.querySelector('h2').textContent = st.title; d.querySelector('p').textContent = st.text;
      detailLive = widget(k, d.querySelector('.wg'), true); if (lvl.frame) detailLive(lvl.frame);
      ctx.setZoomed(true);
    },
  };
  function onFrame(F) {
    lives.forEach(u => u && u(F)); if (detailLive) detailLive(F);
    if (hdr.t) { hdr.t.textContent = F.t; hdr.time.textContent = F.time.toFixed(2) + ' S'; }
    if (scrub) { if (document.activeElement !== scrub) scrub.value = F.i;
      const st = TRACE.steps, t0 = st[+scrub.min].time_s, t1 = st[+scrub.max].time_s;
      scrubTime.textContent = `${(F.time - t0).toFixed(2)} S / ${(t1 - t0).toFixed(1)} S`; }
    if (tickEl) { const s = TRACE.steps, parts = []; for (let k = 0; k < 6; k++) { const q = s[Math.max(0, F.i - k)].input_quaternion;
      parts.push(`<b>${s[Math.max(0, F.i - k)].t}</b> W ${fx(q[0], 4)} X ${fx(q[1], 4)} Y ${fx(q[2], 4)} Z ${fx(q[3], 4)}`); } tickEl.innerHTML = parts.join(' &nbsp;·&nbsp; '); }
  }
  const lvl = level('04 / MODEL · B CONSOLE', layer, onFrame, api);
  return lvl;
}
function miniMirror(el) {
  el.classList.add('w'); el.innerHTML = [1, 2, 4].map(j => `<div class="rw">${FEAT[j]} <b data-j="${j}"></b></div>`).join('') + '<div class="rw dim">OBSERVED → MIRRORED</div>';
  const bs = [...el.querySelectorAll('b')];
  return F => bs.forEach(b => { const j = +b.dataset.j; b.textContent = fx(F.f[j]) + ' → ' + fx(F.fm[j]); });
}
