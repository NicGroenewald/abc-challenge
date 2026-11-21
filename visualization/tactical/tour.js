(function (root) {
  const TIPS = {
    input: [
      { at: 'input.now', text: 'This front edge is “now”, the newest sample. Each call (one run of the model) reads only the two front-most poses. Everything older is already held in the blocks’ memory, which you meet at Block 1.' },
      { at: 'input.rows', text: 'The four rows w, x, y and z are one quaternion: four numbers that give the headset’s orientation, which way it faces and tilts. Each column is one sample, 10 ms apart; older ones sit further back.' },
      { at: 'input.headset', text: 'This is the headset at “now”. Press Play to see it turn with the recorded motion.' },
      { dom: '#inset [data-hx="input"]', touch: 'Tap or slide along these lines', text: 'Hover over these lines to go back in time: the headset shows that older pose and its column lights up.' },
    ],
    feat: [
      { at: 'feat.rows', text: 'Why this step: a pose says where the head is, not how it moves. From the two newest poses come seven measurements, with no learned weights: turning speed around three axes (ω), total speed, and which way is down (g).' },
      { at: 'feat.fork', text: 'Here the measurements are copied in two: one stream for the motion as recorded, one for its mirror image. The design assumes a turn and its mirror image follow the same rules, which the team tested, so one set of weights can serve both.' },
      { at: 'feat.flip', text: 'On the mirrored copy, the outlined rows (ωy, ωz, gx) have their sign flipped. Flipping those three gives exactly the measurements of the mirrored motion.' },
    ],
    proj: [
      { at: 'proj.fan', text: 'Next, the 7 measurements are mixed into 32 channels, the signals the blocks work on. Each line carries one measurement into one channel. All the lines come from one 7×32 table of learned weights, shared by both streams.' },
      { at: 'proj.cells', text: 'These are the 32 channels for “now”: this is what the next part, Block 1, reads. Brighter orange means a bigger value; dark means zero.' },
      { dom: '#inset [data-grid="pch"]', text: 'This grid is that table of weights. Click a column to see how one channel adds up its 7 inputs.' },
    ],
    mirror: [
      { at: 'mirror.top', text: 'No new part here: this step shows the two streams together. The top sheets hold the motion as it was recorded.' },
      { at: 'mirror.bottom', text: 'The bottom sheets hold its mirror image, worked out with exactly the same weights. Sharing them halves the model: 7,555 parameters instead of 15,113.' },
      { dom: '#swapBtn:not([disabled])', text: 'Press this to mirror the motion: the two sheets simply trade places.' },
    ],
    blk0: [
      { at: 'blk0.mem', text: 'Why blocks: to forecast motion the model must look back in time. The violet box is this block’s memory: its last 7 inputs, kept from earlier calls so they are not worked out again.' },
      { at: 'blk0.taps', text: 'The 8 coloured markers are the taps: the 8 samples this block reads, 1 sample (10 ms) apart. Seven come from the memory and one is “now”.' },
      { at: 'blk0.ctx', text: 'So the strip under the block marks what one output depends on: the last 8 samples (0.08 s).' },
      { at: 'blk0.mix', text: 'After the taps, the block mixes its 32 channels. Solid lines mix within one stream; dashed lines pass information across the mirror to the other stream.' },
      { at: 'blk0.skip', text: 'This grey tube is a shortcut: the block’s input is added back onto its result. So the output is the input plus an update, not a replacement.' },
      { dom: '#call', text: 'Press One call (or C) to watch one new sample go through this block, step by step.' },
    ],
    blk1: [
      { at: 'blk1.mem', text: 'Block 2 is built like Block 1 and reads Block 1’s output. Two things differ. First, its memory is longer: its last 56 inputs (0.56 s).' },
      { at: 'blk1.taps', text: 'Second, its 8 taps are 8 samples (80 ms) apart; the small numbers (−8 … −56) say how far back each one reads.' },
      { at: 'blk1.ctx', text: 'Each tap reads a Block 1 output that already summarises 8 samples, so this strip reaches 64 samples (0.64 s). The mixing and the shortcut work as in Block 1, with this block’s own learned weights.' },
    ],
    blk2: [
      { at: 'blk2.mem', text: 'Block 3 reads Block 2’s output and again differs only in spacing and memory length. Its memory holds its last 329 inputs (3.29 s).' },
      { at: 'blk2.taps', text: 'These 8 taps are 47 samples apart, so on their own they span about 3.3 s.' },
      { at: 'blk2.ctx', text: 'Each tap reads a Block 2 output that already summarises 64 samples, so this strip reaches 393 samples (3.93 s). Amber marks the ones reached twice.' },
      { dom: '#call', text: 'Press One call (or C) to watch the oldest sample leave this long memory as the newest arrives.' },
    ],
    reach: [
      { at: 'reach.tree', text: 'Why three blocks: stacked, their reaches add up. This purple tree starts at one output of Block 3 and branches back through all three blocks to every sample it can see.' },
      { dom: '#inset h3 + .m', text: 'Each block adds 7 gaps of its own spacing, plus “now”: 1 + 7×1 + 7×8 + 7×47 = 393 samples, about 3.9 s of history. The bar below shows there are no gaps.' },
    ],
    head: [
      { at: 'head.grid', text: 'From here the history becomes a forecast, in four parts: readout, trajectory, forecast, head direction. First the readout. It reads Block 3’s output and sets these 9 dials (coefficients), one row per turning axis (x, y, z). They shape the learned correction.' },
      { dom: '#inset [data-act="htab:basis"]', text: 'Open this tab to see the three basic curve shapes and how the dials mix them at this moment.' },
    ],
    traj: [
      { at: 'traj.prior', text: 'Next the trajectory. This strip is the momentum guess: how far the head would turn if its current turning speed carried on, fading as it goes. It uses no learned weights.' },
      { at: 'traj.corr', text: 'This strip is the learned correction: the curve shaped by the nine dials from the readout.' },
      { at: 'traj.r', text: 'This strip adds the two: the turn the model expects at each of the next 20 steps. The forecast turns these into poses.' },
      { dom: '#inset [data-hx="traj"]', touch: 'Tap or slide on these charts', text: 'Hover these charts to pick a step: its numbers appear below and its column lights up in 3D.' },
    ],
    out: [
      { at: 'out.pred', text: 'Then the forecast. This row is 20 future headset poses, 10 ms apart. Each is worked out straight from “now” by applying one of the trajectory’s turns, so errors do not build up from step to step.' },
      { at: 'out.truth', text: 'This row is what the headset really did, taken from the recording.' },
      { at: 'out.err', text: 'This row shows the error at each step: the redder, the further off.' },
      { at: 'out.scored', text: 'Only this outlined column, step 20 (200 ms ahead), counts toward the challenge score.' },
    ],
    gaze: [
      { at: 'gaze.headset', text: 'Last, the same forecast shown as head direction. This headset turns with the recorded motion; the white line shows where it points now.' },
      { at: 'gaze.dots', text: 'Blue dots show where the model says the head will point, green dots where it really pointed (big dots: step 20). This is head direction, not where the eyes look.' },
      { dom: '#gazeKey .err', text: 'Here is the gap between the two at 200 ms, and the scored error, which also counts head tilt (roll).' },
    ],
    wear: [
      { dom: '#wearX', text: 'You are inside the headset now. The + marks where the head points at this moment.' },
      { at: 'wear.dots', text: 'Blue dots show where the model says the head will point over the next 200 ms, green dots where it really pointed. The big ones are step 20, the scored step.' },
      { dom: '#wearRings text', text: 'The dashed rings are 1°, 2°, 5° and 10° away from where the head points now, so you can read how far apart the dots are.' },
      { dom: '#wearHud', text: 'The numbers for this moment: the scored error at 200 ms (it includes head tilt, roll), the pointing gap, and the no-change baseline. Drag to glance around, scroll to zoom.' },
    ],
  };

  const CSS = `
#tour { position:fixed; left:0; top:0; z-index:30; max-width:280px; max-height:calc(100vh - 110px); overflow:auto; padding:10px 12px 8px; background:var(--panel-solid, rgba(10,10,10,.95)); border:1px solid var(--line-hi, #6b6b6b); border-radius:var(--r-lg, 10px);
  font:13.5px/1.5 var(--sans, system-ui, sans-serif); color:#d4d4d4; }
#tour .tt { margin:0 0 6px; }
#tour .tf { display:flex; align-items:center; gap:6px; }
#tour .tn { font:400 12px var(--mono, ui-monospace, monospace); font-variant-numeric:tabular-nums; color:var(--muted, #808080); margin-right:auto; }
#tour button { min-height:32px; padding:0 10px; font-size:12px; border-radius:var(--r-md, 6px); }
#tour .ts { background:none; border-color:transparent; color:var(--muted, #808080); }
#tour .tx { background:var(--on, #1c1c1c); border-color:var(--line-hi, #6b6b6b); }
#tour.g { max-width:290px; } #tour.g.c { max-width:460px; } #tour .te { margin:-2px 0 7px; font-size:12px; color:var(--muted, #808080); border-left:1px solid var(--line-hi, #6b6b6b); padding-left:8px; }
#tour .te[hidden], #tour button[hidden] { display:none; }
#tour.in { animation:tourIn .18s ease-out; }
@keyframes tourIn { from { opacity:0; } to { opacity:1; } }
#tourLine { position:fixed; inset:0; width:100%; height:100%; pointer-events:none; z-index:29; }
#tourEdge { position:fixed; z-index:30; transform:translate(-50%,-50%); display:flex; gap:6px; align-items:center; min-height:32px; padding:2px 10px; font-size:12px;
  background:var(--panel-solid, rgba(10,10,10,.95)); border:1px solid var(--line-hi, #6b6b6b); border-radius:999px; color:var(--body, #a6a6a6); }
#tourEdge .ar { display:inline-block; color:var(--fg, #eaeaea); }
#tour[hidden], #tourEdge[hidden] { display:none; }
@media (prefers-reduced-motion: reduce) { #tour.in { animation:none; } }`;

  const AVOID = ['#card', '#side', '#tip', '#inset', '#bar', '#gazeKey', '#caption', '#menu', '#userbox', '#brand', '#guideHud'];
  const HARD = ['#caption', '#bar', '#guideHud'];
  const vpEdges = () => { const v = root.K8Viewport ? root.K8Viewport() : { left: 0, top: 0, width: innerWidth, height: innerHeight }; return [v.left + v.width, v.top + v.height]; };
  function clearHard(x, y, bw, bh) {
    const [W, H] = vpEdges(), rs = HARD.map(q => document.querySelector(q)).filter(el => el && !el.hidden && el.getClientRects().length).map(el => el.getBoundingClientRect()).filter(r => r.width);
    for (let it = 0; it < 4; it++) {
      const R = rs.find(r => x < r.right && x + bw > r.left && y < r.bottom && y + bh > r.top); if (!R) break;
      const up = R.top - 6 - bh, down = R.bottom + 6;
      y = (up >= 8 && (Math.abs(up - y) <= Math.abs(down - y) || down + bh > H - 8)) ? up : Math.min(H - 8 - bh, down);
    }
    return [Math.max(8, Math.min(W - 8 - bw, x)), Math.max(8, Math.min(H - 8 - bh, y))];
  }
  const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
  const rectOf = r => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });

  function create(api) {
    const doc = document, NS = 'http://www.w3.org/2000/svg', reduce = !!api.reduce;
    let seen; try { seen = new Set(JSON.parse(sessionStorage.getItem('k8tourSeen') || '[]')); } catch { seen = new Set(); }
    const remember = k => { seen.add(k); try { sessionStorage.setItem('k8tourSeen', JSON.stringify([...seen])); } catch {  } };

    const st = doc.createElement('style'); st.textContent = CSS; doc.head.appendChild(st);
    const box = doc.createElement('div'); box.id = 'tour'; box.hidden = true; box.setAttribute('role', 'note'); box.setAttribute('aria-live', 'polite');
    box.innerHTML = '<p class="tt"></p><p class="te" hidden></p><div class="tf"><span class="tn"></span><button class="tb" type="button" aria-keyshortcuts="B" hidden>◀ Back</button><button class="ts" type="button" aria-keyshortcuts="Escape">Skip</button><button class="tx" type="button" aria-keyshortcuts="T">Next tip</button></div>';
    const svg = doc.createElementNS(NS, 'svg'); svg.id = 'tourLine'; svg.style.display = 'none';
    const line = doc.createElementNS(NS, 'line'), ring = doc.createElementNS(NS, 'circle');
    line.setAttribute('stroke', '#e6ebf2'); line.setAttribute('stroke-opacity', '.6'); line.setAttribute('stroke-width', '1');
    ring.setAttribute('r', '4'); ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#e6ebf2'); ring.setAttribute('stroke-opacity', '.8');
    svg.append(line, ring);
    const chip = doc.createElement('button'); chip.id = 'tourEdge'; chip.type = 'button'; chip.hidden = true; chip.title = 'next tip (T)';
    chip.innerHTML = '<span class="ar" aria-hidden="true">➜</span><span class="ct"></span>';
    doc.body.append(svg, box, chip);
    const txt = box.querySelector('.tt'), ext = box.querySelector('.te'), num = box.querySelector('.tn'), nextB = box.querySelector('.tx'), backB = box.querySelector('.tb'), skipB = box.querySelector('.ts');
    for (const el of [box, chip]) el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); });

    let key = null, i = 0, timer = null, cand = -1, G = null;
    const has = k => !!(k && TIPS[k] && TIPS[k].length);
    const tip = () => G ? G.t : TIPS[key][i];
    const say = t => { const s = t.touch && doc.documentElement.classList.contains('touch') ? t.text.replace(/^Hover[^:]*? to /, t.touch + ' to ') : t.text;
      return window.K8Phone ? window.K8Phone.words(s) : s; };
    const docked = () => !!(root.K8Phone && root.K8Phone.form());
    function hideAll() { box.hidden = true; chip.hidden = true; svg.style.display = 'none'; if (api.highlight) api.highlight(null); }
    function close() { if (G) return; clearTimeout(timer); timer = null; key = null; hideAll(); }
    function show() {
      if (G) {
        box.classList.toggle('c', !!G.t.center); txt.textContent = say(G.t); ext.textContent = G.extra || ''; ext.hidden = !G.extra; num.textContent = G.label;
        nextB.textContent = G.last ? 'Finish' : 'Next ▶'; backB.hidden = false; backB.disabled = !!G.first; skipB.hidden = true; box.classList.add('g');
      } else {
        const list = TIPS[key];
        txt.textContent = say(tip()); num.textContent = `${i + 1}/${list.length}`; nextB.textContent = i === list.length - 1 ? 'Done' : 'Next tip';
        ext.hidden = true; backB.hidden = true; skipB.hidden = false; box.classList.remove('g', 'c');
      }
      if (root.K8Phone) root.K8Phone.tip(tip(), box);
      if (api.highlight) api.highlight(tip());
      cand = -1; pin = null; sm = null; box.classList.remove('in'); if (!reduce) { void box.offsetWidth; box.classList.add('in'); }
      frame();
    }
    function start(k) { if (G) return; clearTimeout(timer); timer = null; if (!has(k)) return close(); key = k; i = 0; remember(k); show(); }
    function next() { if (G) return G.onNext(); if (!key) return; if (i < TIPS[key].length - 1) { i++; show(); } else close(); }
    function enter(k) {
      if (G) { clearTimeout(timer); timer = null; return; }
      if (api.step() === 'wear') k = 'wear';
      if (key && key === k) return;
      close(); if (!api.beginner() || !has(k) || seen.has(k)) return;
      timer = setTimeout(() => { timer = null; if (api.beginner() && api.step() === k) start(k); }, reduce ? 0 : 1000);
    }
    function onKey(e) {
      if (G || e.metaKey || e.ctrlKey || e.altKey) return false;
      if (e.key === 'Escape' && key) { close(); return true; }
      if (e.key === 't' || e.key === 'T') { if (key) next(); else { const k = api.step(); if (api.beginner() && has(k)) start(k); else return false; } return true; }
      return false;
    }
    nextB.onclick = next; skipB.onclick = close; chip.onclick = next; backB.onclick = () => { if (G) G.onBack(); };
    function guide(g) {
      clearTimeout(timer); timer = null; key = null; G = g || null;
      if (!G || G.hidden) return hideAll();
      show();
    }

    let lastXY = null;
    let pin = null, sm = null;
    function edgeChip(p, label) {
      pin = null; sm = null; svg.style.display = 'none'; chip.hidden = false; box.hidden = false;
      { const [W0, H0] = vpEdges(), bw = box.offsetWidth, bh = box.offsetHeight;
        let bx = lastXY ? lastXY[0] : (W0 - bw) / 2 + 100, by = lastXY ? lastXY[1] : 92;
        bx = Math.max(8, Math.min(W0 - 8 - bw, bx)); by = Math.max(8, Math.min(H0 - 8 - bh, by)); [bx, by] = clearHard(bx, by, bw, bh);
        box.style.left = `${bx}px`; box.style.top = `${by}px`; }
      const [W, H] = vpEdges();
      chip.querySelector('.ct').textContent = G ? `tip ${G.label} ${label}` : `tip ${i + 1}/${TIPS[key].length} ${label}`;
      const ar = chip.querySelector('.ar');
      if (!p) { ar.style.display = 'none'; const F = root.K8Phone && root.K8Phone.free(); chip.style.left = `${F ? (F.L + F.R) / 2 : W / 2}px`; chip.style.top = `${F ? (F.T + F.B) / 2 : H * .5}px`; return; }
      ar.style.display = '';
      const F = root.K8Phone && root.K8Phone.free(), cx = F ? (F.L + F.R) / 2 : W / 2, cy = F ? (F.T + F.B) / 2 : H / 2; let dx = p.x - cx, dy = p.y - cy; if (p.behind) { dx = -dx; dy = -dy; }
      if (Math.abs(dx) + Math.abs(dy) < 1e-3) dy = 1;
      const mx = F ? Math.max(20, (F.R - F.L) / 2 - 80) : W / 2 - 90, my = F ? Math.max(20, (F.B - F.T) / 2 - 30) : H / 2 - 90, k = Math.min(mx / (Math.abs(dx) || 1e-9), my / (Math.abs(dy) || 1e-9));
      chip.style.left = `${cx + dx * k}px`; chip.style.top = `${cy + dy * k}px`;
      ar.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    }

    function frame() {
      if (!key && !G) return;
      if (G && G.hidden) return hideAll();
      const t = tip(), [W, H] = vpEdges(); let A = null, pt = null;
      if (t.center) {
        chip.hidden = true; box.hidden = false; svg.style.display = 'none';
        const bw = box.offsetWidth; box.style.left = `${Math.max(8, Math.min(W - 8 - bw, (W - bw) / 2 + 100))}px`; box.style.top = '92px'; return;
      }
      if (t.dom) {
        const el = doc.querySelector(t.dom), r = el && el.getBoundingClientRect();
        if (!r || (!r.width && !r.height)) return edgeChip(null, 'is hidden in this view');
        A = rectOf(r); if (A.r < 0 || A.l > W || A.b < 0 || A.t > H) return edgeChip({ x: (A.l + A.r) / 2, y: (A.t + A.b) / 2 }, 'is off-screen');
      } else {
        const p = api.point(t.at);
        if (!p || !p.vis) return edgeChip(null, 'is hidden in this view');
        if (p.behind || p.x < 8 || p.x > W - 8 || p.y < 8 || p.y > H - 8) return edgeChip(p, 'is off-screen · drag to look');
        pt = p; A = { l: p.x - 16, t: p.y - 16, r: p.x + 16, b: p.y + 16 };
      }
      chip.hidden = true; box.hidden = false;
      const moving = !!(api.moving && api.moving(t.at || t.dom)), bw = box.offsetWidth, bh = box.offsetHeight;
      let x, y;
      if (docked()) { const r = box.getBoundingClientRect(); x = r.left; y = r.top; pin = null; sm = null; }
      else if (moving && pin && pin.W === W && pin.H === H) [x, y] = [pin.x, pin.y];
      else {
      const g = t.dom ? 14 : 34, cx = (A.l + A.r) / 2, cy = (A.t + A.b) / 2;
      const C = [[A.r + g, cy - bh / 2], [A.l - g - bw, cy - bh / 2], [cx - bw / 2, A.t - g - bh], [cx - bw / 2, A.b + g],
                 [A.r + g * .6, A.t - g * .6 - bh], [A.l - g * .6 - bw, A.t - g * .6 - bh], [A.r + g * .6, A.b + g * .6], [A.l - g * .6 - bw, A.b + g * .6]];
      const avoid = AVOID.map(s => doc.querySelector(s)).filter(el => el && el.getClientRects().length).map(el => rectOf(el.getBoundingClientRect()));
      const view = { l: 8, t: 8, r: W - 8, b: H - 8 };
      const score = C.map(([x, y], n) => { const R = { l: x, t: y, r: x + bw, b: y + bh };
        return (bw * bh - overlap(R, view)) * 4 + avoid.reduce((a, P) => a + overlap(R, P), 0) + overlap(R, A) * 8 + n * 20; });
      let best = score.indexOf(Math.min(...score)); if (cand >= 0 && score[cand] <= score[best] + 400) best = cand; cand = best;
      x = Math.max(8, Math.min(W - 8 - bw, C[best][0])); y = Math.max(8, Math.min(H - 8 - bh, C[best][1]));
      [x, y] = clearHard(x, y, bw, bh);
      { const shown = AVOID.filter(s => { const el = doc.querySelector(s); return el && el.getClientRects().length; }), big = ['#card', ...(t.dom ? [] : ['#side'])].map(s => avoid[shown.indexOf(s)]).filter(Boolean);
        const cost = ([a, b]) => { const R = { l: a, t: b, r: a + bw, b: b + bh }; return avoid.reduce((s, P) => s + overlap(R, P) * (big.includes(P) ? 50 : 1), 0) + overlap(R, A) * 8; };
        for (const cr of big) { if (!(overlap({ l: x, t: y, r: x + bw, b: y + bh }, cr) > 0)) continue;
          const side = cr.l > W / 2, nx = side ? cr.l - 8 - bw : cr.r + 8;
          const opts = [[nx, y], [x, cr.t - 8 - bh], [x, cr.b + 8], [nx, cr.t - 8 - bh]].filter(([a, b]) => a >= 8 && a + bw <= W - 8 && b >= 8 && b + bh <= H - 8).map(([a, b]) => clearHard(a, b, bw, bh));
          if (opts.length) { const o = opts.reduce((m, c) => cost(c) < cost(m) ? c : m); if (cost(o) < cost([x, y])) [x, y] = o; } } }
      pin = moving ? { x, y, W, H } : null; sm = null;
      }
      lastXY = [x, y];
      box.style.left = `${x}px`; box.style.top = `${y}px`;
      const bx = x + bw / 2, by = y + bh / 2; let ax = pt ? pt.x : Math.max(A.l, Math.min(A.r, bx)), ay = pt ? pt.y : Math.max(A.t, Math.min(A.b, by));
      if (moving) {
        const now = performance.now();
        if (sm) { const a = 1 - Math.exp(-(now - sm.t) / 150); sm.x += (ax - sm.x) * a; sm.y += (ay - sm.y) * a; sm.t = now; }
        else sm = { x: ax, y: ay, t: now };
        sm.d = Math.hypot(ax - sm.x, ay - sm.y); ax = sm.x; ay = sm.y;
      } else sm = null;
      const ex = Math.max(x, Math.min(x + bw, ax)), ey = Math.max(y, Math.min(y + bh, ay));
      svg.style.display = ''; line.setAttribute('x1', ax); line.setAttribute('y1', ay); line.setAttribute('x2', ex); line.setAttribute('y2', ey);
      ring.style.display = pt ? '' : 'none'; if (pt) { ring.setAttribute('cx', ax); ring.setAttribute('cy', ay); }
    }

    return { start, enter, close, next, frame, onKey, has, guide, isOpen: () => !!key || !!G, settling: () => !!(sm && sm.d > .5 && !box.hidden) };
  }

  root.K8TOUR = { TIPS, create };
})(typeof window !== 'undefined' ? window : globalThis);
