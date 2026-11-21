(function (root) {
  const TOP = [.45, 1, .3];
  const SIDE3 = [-.6, .35, .7];
  const NEAR = [.9, .45, .8];
  const PRESETS = {
    'input.now': { dir: [.75, .3, 1], dist: 3.4 },
    'input.rows': { dir: [1, .45, .3], dist: 5.5 },
    'input.headset': { dir: [.3, .35, 1], dist: 6.5 },
    'feat.rows': { dir: [.35, .45, 1], dist: 4.6 },
    'feat.fork': { dir: [.8, .3, 1], dist: 3.4 },
    'feat.flip': { dir: [.5, .15, 1], dist: 4, ty: 0 },
    'proj.fan': { dir: [.25, .3, 1], dist: 5 },
    'proj.cells': { dir: [.5, .35, 1], dist: 5 },
    'mirror.top': { dir: [1, .18, .45], dist: 9.5, ty: 0, tz: -3 },
    'mirror.bottom': { dir: [1, .18, .45], dist: 9.5, ty: 0, tz: -3 },
    'reach.tree': { dir: [-.078, 1, 0], dist: 14, tx: 6, tz: -4.9 },
    'head.grid': { dir: [.9, .6, .7], dist: 3 },
    'traj.prior': { dir: NEAR, dist: 3 }, 'traj.corr': { dir: NEAR, dist: 3 }, 'traj.r': { dir: NEAR, dist: 3 },
    'out.pred': { dir: NEAR, dist: 3 }, 'out.truth': { dir: NEAR, dist: 3 }, 'out.err': { dir: NEAR, dist: 3 },
    'out.scored': { dir: [.7, .35, 1], dist: 2.4 },
    'gaze.headset': 'follow', 'gaze.dots': 'follow',
  };
  [0, 1, 2].forEach(b => { const fx = { live: 7 * [1, 8, 47][b] + 4, hide: ['tree', 'links'], lb: 2.5, feedKey: ['proj', 'blk0', 'blk1'][b] }; Object.assign(PRESETS, {
    [`blk${b}.mem`]: b === 2 ? { dir: TOP, dist: 1.3, mem: b, ...fx, lb: 0 } : { dir: SIDE3, dist: 9.5, blockMid: b, ...fx, lb: 0 },
    [`blk${b}.taps`]: b === 2 ? { dir: TOP, dist: 1.3, mem: b, ...fx, lb: 0 } : { dir: SIDE3, dist: 9.5, blockMid: b, ...fx, lb: 0 },
    [`blk${b}.mix`]: { dir: [-.4, .18, 1], dist: 7, mixMid: b, mix: b, ...fx },
    [`blk${b}.skip`]: { dir: SIDE3, dist: 9.5, blockMid: b, ...fx },
    [`blk${b}.ctx`]: { dir: [-1, -.1, .05], dist: 15, ctxMid: b, ...fx, lb: 0 },
  }); });
  const presetOf = t => t.center ? 'keep' : t.dom ? 'keep' : PRESETS[t.at];

  const SUMMARY = { center: true, text: 'That is the whole model. Each call reads the two newest poses and turns them into 7 measurements, plus a mirrored copy. '
    + 'Both are mixed into 32 channels. Three blocks, each with its own memory, look back 393 samples (about 3.9 s). Nine dials shape a correction to the momentum guess, '
    + 'which gives 20 future poses; only step 20 (200 ms ahead) is scored. On 1,049 unseen test users its error at 200 ms is 4.50° (4.1836° on the team\'s 20-user benchmark). It has 7,555 parameters (44,196 bytes) and takes about 78 µs median per call on an AMD Ryzen 7 5800X3D desktop CPU (relative only).' };

  function shotsFrom(TIPS, STEPS) {
    const out = [];
    STEPS.forEach((k, si) => (TIPS[k] || []).forEach((t, i) => out.push({ k, si, i, t, preset: presetOf(t) })));
    out.push({ k: 'overview', si: -1, i: 0, t: SUMMARY, preset: 'keep', end: true });
    return out;
  }
  const SPEEDS = [.25, 3];
  const readMs = (text, speed = 1) => Math.max(6000, 2000 + text.length * 60) / speed;

  const CSS = `
#guideHud { position:fixed; top:52px; left:50%; transform:translateX(-50%); z-index:31; display:flex; align-items:center; gap:10px; padding:6px 8px 8px 12px;   /* theme: 2 px tighter, so Geist's wider type keeps the bar as wide as before */
 
  background:var(--panel-solid, rgba(10,10,10,.95)); border:1px solid var(--line, #2c2c2c); border-radius:var(--r-lg, 10px); font:500 13px var(--sans, system-ui, sans-serif); color:var(--body, #a6a6a6); overflow:hidden; max-width:calc(100% - 32px); }
#guideHud[hidden] { display:none; }
#guideHud .gt { font-weight:500; color:var(--fg, #eaeaea); white-space:nowrap; } #guideHud .gp { font:400 12px var(--mono, ui-monospace, monospace); font-variant-numeric:tabular-nums; color:var(--muted, #808080); white-space:nowrap; }
#guideHud button { min-height:32px; padding:0 9px; font-size:12px; border-radius:var(--r-md, 6px); }
#guideHud button[aria-pressed="true"] { background:var(--on, #1c1c1c); border-color:var(--line-hi, #6b6b6b); } #guideHud button[hidden] { display:none; }
#guideHud .gsl { display:flex; align-items:center; gap:5px; color:var(--muted, #808080); white-space:nowrap; } #guideHud .gs { width:96px; accent-color:#6fa8ff; }
#guideHud .gsv { font:400 12px var(--mono, ui-monospace, monospace); font-variant-numeric:tabular-nums; color:var(--fg, #eaeaea); min-width:38px; }
#guideHud .gr { background:transparent; border-color:#f0b24a; color:#ffe2a6; }
#guideHud .gb { position:absolute; left:0; bottom:0; height:2px; background:#6fa8ff; transition:width .3s ease; }
#guideBtn[aria-pressed="true"] { background:var(--on, #1c1c1c); border-color:#9b8cff; }   /* round 8: violet only while the tour is on (theme: as an outline, not a fill) */
.gHL { outline:2px solid #f0b24a !important; outline-offset:2px; border-radius:var(--r-md, 6px); }
@media (prefers-reduced-motion: reduce) { #guideHud .gb { transition:none; } }
@media (max-width: 700px) { #guideHud .gt { display:none; } }`;

  function create(api) {
    const doc = document, reduce = !!api.reduce, TIPS = api.tips, STEPS = api.steps, SHOTS = shotsFrom(TIPS, STEPS);
    const N = SHOTS.length - 1;
    const st = doc.createElement('style'); st.textContent = CSS; doc.head.appendChild(st);
    const hud = doc.createElement('div'); hud.id = 'guideHud'; hud.hidden = true; hud.setAttribute('role', 'region'); hud.setAttribute('aria-label', 'Guided tour');
    hud.innerHTML = '<span class="gt">Guided tour</span><span class="gp" aria-live="polite"></span>'
      + '<button class="ga" type="button" aria-keyshortcuts="A" title="advance by itself after a reading time (A)">Auto-play</button>'
      + '<label class="gsl" title="auto-play speed: reading time ÷ speed (+ / − keys)">speed <input class="gs" type="range" min="0.25" max="3" step="0.05" value="1" aria-label="Auto-play speed"> <span class="gsv">1.0×</span></label>'
      + '<button class="gr" type="button" aria-keyshortcuts="R" title="re-frame this shot and carry on (R)" hidden>⟲ Resume</button>'
      + '<button class="gx" type="button" aria-keyshortcuts="Escape" title="exit the tour, stay on this step (Esc)">Exit ✕</button><span class="gb"></span>';
    doc.body.appendChild(hud);
    const speedB = hud.querySelector('.gs'), speedV = hud.querySelector('.gsv');
    let speed = 1; try { const v = +localStorage.getItem('k8guideSpeed'); if (v >= SPEEDS[0] && v <= SPEEDS[1]) speed = v; } catch {  }
    const prog = hud.querySelector('.gp'), autoB = hud.querySelector('.ga'), resB = hud.querySelector('.gr'), bar = hud.querySelector('.gb');

    let on = false, n = 0, auto = !reduce, paused = false, hover = false, waiting = false, shownT = 0, readT = 0, inner = 0, hl = null, last = 0;
    const self = () => inner > 0;
    const asSelf = f => { inner++; try { return f(); } finally { inner--; } };

    function setHL(sel) {
      if (hl) hl.classList.remove('gHL'); hl = null;
      const el = sel && doc.querySelector(sel); if (el) { el.classList.add('gHL'); hl = el; }
    }
    function hudUI() {
      const s = SHOTS[n];
      const ph = window.K8Phone && window.K8Phone.form();
      prog.textContent = s.end ? `summary · whole model` : `${ph ? '' : 'tip '}${n + 1}${ph ? '/' : ' / '}${N} · ${api.stepName(s.k)}${paused ? ' · paused' : ''}`;
      bar.style.width = `${(Math.min(n + 1, N) / N) * 100}%`;
      autoB.setAttribute('aria-pressed', auto); autoB.textContent = 'Auto-play';
      resB.hidden = !paused; speedB.value = String(speed); speedV.textContent = `${speed.toFixed(speed < 1 ? 2 : 1)}×`;
    }
    function setSpeed(d, v) {
      speed = Math.round(Math.max(SPEEDS[0], Math.min(SPEEDS[1], v !== undefined ? v : speed + d * .25)) * 100) / 100;
      try { localStorage.setItem('k8guideSpeed', String(speed)); } catch {  } hudUI();
    }
    const extraOf = s => api.level() === 'expert' ? api.expert(s.k) || '' : '';
    function bubble(hidden) {
      const s = SHOTS[n];
      api.tour.guide({ t: s.t, extra: extraOf(s), label: s.end ? 'summary' : `${n + 1}/${N}`, first: n === 0, last: !!s.end, hidden,
        onNext: next, onBack: back });
    }
    function frameCam() {
      const s = SHOTS[n], pr = s.preset;
      if (s.end || pr === 'keep') return;
      if (pr === 'follow' || pr === 'build') api.stage(null);
      if (pr === 'follow') return api.follow();
      const v = api.view(s.t.at, pr); if (!v) return;
      if (pr !== 'build') api.stage(s.t.at, pr, v.t0 || v.t);
      api.fly(v.p, v.t);
    }
    function triggers(s) {
      if (s.k === 'mirror') api.swap(s.i >= 2);
    }
    function go(m) {
      m = Math.max(0, Math.min(SHOTS.length - 1, m));
      n = m; const s = SHOTS[n]; paused = false; hover = false; readT = 0;
      setHL(null);
      asSelf(() => {
        if (s.end) { if (api.build() !== -1) api.home(); }
        else if (api.build() !== s.si) api.showBuild(s.si);
      });
      api.fx(s); triggers(s); frameCam();
      if (s.t.dom) setHL(s.t.dom.replace(/:not\([^)]*\)/g, ''));
      waiting = true; bubble(true); hudUI(); api.render();
      tick(performance.now());
    }
    function next() { if (!on) return; if (n >= SHOTS.length - 1) return exit(); go(n + 1); }
    function back() { if (!on || n === 0) return; go(n - 1); }
    function start(from = 0) {
      if (on) return go(from);
      on = true; api.tour.close(); hud.hidden = false; api.started(true); go(from);
    }
    function exit() {
      if (!on) return; on = false; waiting = false; paused = false;
      api.tour.guide(null); setHL(null); api.stage(null); api.fx(null); hud.hidden = true; api.started(false); api.render();
    }
    function resume() { if (!on) return; paused = false; readT = 0; frameCam(); hudUI(); }
    function toggleAuto() { auto = !auto; paused = false; readT = 0; hudUI(); }

    function tick(now) {
      const dt = Math.min(250, now - (last || now)); last = now;
      if (!on) return;
      if (waiting && !api.flying()) { waiting = false; shownT = now; bubble(false); }
      if (waiting || !auto || paused || hover) return;
      const s = SHOTS[n]; if (s.end) return;
      readT += dt;
      if (readT >= readMs(s.t.text + extraOf(s), speed)) next();
    }

    function userCamera() { if (!on || paused) return; paused = true; hudUI(); }
    function onBuild(i) {
      if (!on || self()) return;
      if (SHOTS[n].si === i) { triggers(SHOTS[n]); frameCam(); return; }
      go(SHOTS.findIndex(s => s.si === i));
    }
    function onHome() { if (on && !self()) exit(); }
    function jumpStep(d) {
      const si = SHOTS[n].end ? STEPS.length : SHOTS[n].si, to = si + d;
      if (to < 0) return; if (to >= STEPS.length) return go(SHOTS.length - 1);
      go(SHOTS.findIndex(s => s.si === to));
    }
    function refresh() { if (on && !waiting) bubble(false); }

    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return false;
      const k = e.key;
      if (k === 'g' || k === 'G') { on ? exit() : start(0); return true; }
      if (!on) return false;
      if (k === 'Escape') { exit(); return true; }
      if (k === 'n' || k === 'Enter' || k === 't' || k === 'T' || k === 'PageDown') { next(); return true; }
      if (k === 'b' || k === 'PageUp') { back(); return true; }
      if (k === 'a' || k === 'A') { toggleAuto(); return true; }
      if (k === 'r' || k === 'R') { if (paused) resume(); return true; }
      if (k === '+' || k === '=') { setSpeed(1); return true; }
      if (k === '-' || k === '_') { setSpeed(-1); return true; }
      return false;
    }

    autoB.onclick = toggleAuto; speedB.oninput = () => setSpeed(0, +speedB.value);
    speedB.addEventListener('keydown', e => e.stopPropagation());
    resB.onclick = resume; hud.querySelector('.gx').onclick = exit;
    for (const el of [hud]) el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); });
    const tb = doc.getElementById('tour');
    if (tb) { tb.addEventListener('pointerenter', () => { hover = true; }); tb.addEventListener('pointerleave', () => { hover = false; }); }

    return { start, exit, next, back, go, tick, onKey, userCamera, onBuild, onHome, jumpStep, refresh, resume, reframe: frameCam,
      on: () => on, shot: () => n, SHOTS, state: () => ({ on, n, auto, paused, waiting, hover, speed }) };
  }

  root.K8GUIDE = { PRESETS, SUMMARY, SPEEDS, presetOf, shotsFrom, readMs, create };
})(typeof window !== 'undefined' ? window : globalThis);
