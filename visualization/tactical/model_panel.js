
const VIEW_DELAY = 150;
const INSET_VIEWS = ['head', 'traj'];
const REAL_RATE = 100;

const clamp = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ease = t => t < .5 ? 2 * t * t : 1 - (2 - 2 * t) * (1 - t);

let el = null, host = null, V = null, ready = false, starting = false, released = false;
let state = 'far', paused = false;
let want = null, timer = 0;
let pos = { s: 0, key: null, lead: 0, tail: 0 }, grownTo = -1;
let insetHome = null, insetStyle = '', insetAt = null;
let speedTick = 0;
let entered = false;
let geo = null, nSteps = 9;
let full = false;

function mount(target) {
  if (el || released) return;
  if (!(window.K8_BOOT && window.K8_BOOT.live3d)) return;
  el = target;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' });
  el.appendChild(host);
  const track = el.closest('.dk-track'); if (track) nSteps = track.querySelectorAll('.dk-step').length;
  host.addEventListener('webglcontextlost', () => { if (!entered) release(); }, true);
  new ResizeObserver(restage).observe(el);
  addEventListener('resize', restage, { passive: true });
  queueMicrotask(start);
}

function start() {
  if (starting) return; starting = true;
  window.K8_NOSTART = null;
  window.K8_EMBED = { el: host, user: 'test50', view: want || 'input', clear: true };
  const sc = document.createElement('script'); sc.type = 'module'; sc.src = 'viewer.mjs?embed=f2';
  sc.onload = () => { if (window.K8Viewer && window.K8Viewer.ready) window.K8Viewer.ready.then(onReady, () => {}); };
  document.head.appendChild(sc);
}

function onReady() {
  if (released) return;
  V = window.K8Viewer; ready = true;
  for (const v of INSET_VIEWS) { const m = stepOf(v, '.dk-math'); if (m) m.textContent = V.math(v).join('\n'); }
  applyState();
  if (want && V.step() !== want) V.showStep(want);
  placeInset(want);
  setPos(pos.s, pos.key, { lead: pos.lead, tail: pos.tail });
  el.setAttribute('data-live', 'on');
  speedText();
}

function setState(s) {
  if (entered || released) return;
  state = s === 'current' || s === 'near' ? s : 'far';
  applyState();
}
function applyState() {
  if (!V) return;
  if (state === 'far') { V.setPlaying(false); V.setActive(false); }
  else { V.setActive(true); V.setPlaying(state === 'current' && !paused); }
  clearInterval(speedTick); speedTick = state === 'current' ? setInterval(speedText, 1000) : 0;
  speedText();
}

function showStep(view) {
  if (entered || released) return;
  want = view;
  clearTimeout(timer);
  timer = setTimeout(() => { timer = 0; if (!ready) return; if (V.step() !== want) V.showStep(want); placeInset(want); V.arrive(pos.lead); }, VIEW_DELAY);
}

function setPos(s, key, extra) {
  if (entered || released) return;
  pos = { s: +s || 0, key, lead: extra ? +extra.lead || 0 : 0, tail: extra ? +extra.tail || 0 : 0 };
  if (!ready) return;
  V.arrive(pos.lead);
  grow(pos.s);
}

function measureStage() {
  const r = el.getBoundingClientRect();
  geo = { left: r.left, width: r.width, height: r.height, W: document.documentElement.clientWidth };
}
function restage() {
  if (!el || released || entered) return;
  measureStage();
  if (!ready) return;
  full = false; grownTo = -1; grow(pos.s);
}
function grow(s) {
  const g = ease(clamp(s - (nSteps - 2)));
  if (Math.abs(g - grownTo) < 1e-4) return;
  grownTo = g;
  if (!geo) measureStage();
  const E = window.K8_EMBED, { left, width, height, W } = geo;
  if (g === 0) {
    if (full || host.style.width !== '100%') { Object.assign(host.style, { left: '0', width: '100%' }); }
    full = false;
    if (E) { E.free = null; E.lens = null; }
    edge(0, 0, width);
    return;
  }
  const wasFull = full;
  if (!full) {
    full = true;
    host.style.left = (-left).toFixed(1) + 'px';
    host.style.width = W.toFixed(1) + 'px';
    if (E) E.free = { left, top: 0, width, height };
  }
  const L = left * (1 - g), R = L + width + (W - width) * g;
  edge(g, L, R);
  if (E) E.lens = g >= 1 ? null : { cx: (L + R) / 2, w: W, h: height };
  if (wasFull && V.reframe) V.reframe();
}
const EDGE_FADE = 12;
function edge(g, L, R) {
  const track = el.closest('.dk-track'), toRight = !track || track.dataset.side !== 'left';
  const f = EDGE_FADE * (1 - g) / 100 * (R - L), px = v => v.toFixed(1) + 'px';
  const m = g === 0 ? `linear-gradient(to ${toRight ? 'left' : 'right'}, transparent 0, #000 ${EDGE_FADE.toFixed(2)}%)` : g >= 1 ? 'none'
    : toRight ? `linear-gradient(to right, transparent ${px(L)}, #000 ${px(L)}, #000 ${px(R - f)}, transparent ${px(R)})`
    : `linear-gradient(to right, transparent ${px(L)}, #000 ${px(L + f)}, #000 ${px(R)}, transparent ${px(R)})`;
  host.style.webkitMaskImage = m; host.style.maskImage = m;
}

function release() {
  released = true; clearTimeout(timer); clearInterval(speedTick);
  if (V) { V.setPlaying(false); V.setActive(false); }
  placeInset(null);
  for (const v of INSET_VIEWS) { const m = stepOf(v, '.dk-math'); if (m) m.textContent = ''; }
  if (el) el.removeAttribute('data-live');
}

function stepOf(view, sel) {
  const track = el && el.closest('.dk-track'), st = track && track.querySelector(`.dk-step[data-view="${view}"]`);
  return st ? st.querySelector(sel) : null;
}
const BORROWED = { position: 'static', top: 'auto', right: 'auto', width: 'auto', maxHeight: 'none', overflow: 'visible', padding: '0',
  background: 'none', border: '0', borderRadius: '0', backdropFilter: 'none', webkitBackdropFilter: 'none', boxShadow: 'none' };
const COMPACT = '.dk-inset > #inset .tabs, .dk-inset > #inset .m, .dk-inset > #inset table { display:none !important; }'
  + ' .dk-inset > #inset h3 { font-size:12px; margin:0 0 6px; } .dk-inset > #inset svg[role="img"] { max-height:16vh; width:auto !important; max-width:100%; }'
  + ' @media (max-height: 820px) { .dk-inset > #inset h3 { display:none; } .dk-inset > #inset svg[role="img"] { max-height:8.5vh; } }';
function compactStyle() {
  if (document.getElementById('k8ModelInsetCss')) return;
  const st = document.createElement('style'); st.id = 'k8ModelInsetCss'; st.textContent = COMPACT; document.head.appendChild(st);
}
function placeInset(view) {
  const ins = V && V.inset ? V.inset() : null; if (!ins) return;
  compactStyle();
  const slot = INSET_VIEWS.includes(view) ? stepOf(view, '.dk-inset') : null;
  if (slot) {
    if (!insetHome) { insetHome = [ins.parentNode, ins.nextSibling]; insetStyle = ins.getAttribute('style') || ''; }
    if (ins.parentNode !== slot) slot.appendChild(ins);
    Object.assign(ins.style, BORROWED); ins.inert = true; insetAt = view;
  } else if (insetHome) {
    insetHome[0].insertBefore(ins, insetHome[1]);
    if (insetStyle) ins.setAttribute('style', insetStyle); else ins.removeAttribute('style');
    ins.inert = false; insetHome = null; insetAt = null;
  }
}

function speedText() {
  const t = document.getElementById('modelSpeed'); if (!t) return;
  if (!V) { t.textContent = ''; return; }
  const r = V.speed();
  t.textContent = paused ? 'paused' : r === REAL_RATE ? 'playing at real speed' : `playing at ${+(r / REAL_RATE).toFixed(2)}× speed`;
}
function setPaused(p) {
  paused = !!p;
  const b = document.getElementById('modelPause'); if (b) b.setAttribute('aria-pressed', paused ? 'true' : 'false');
  applyState();
}
document.addEventListener('click', e => { const b = e.target && e.target.closest && e.target.closest('#modelPause'); if (b) setPaused(!paused); });
{ const b = document.getElementById('modelPause'); if (b) b.setAttribute('aria-pressed', 'false'); }

const canEnter = () => ready && !released && !entered && !!V && typeof V.enter === 'function' && !!el && el.getAttribute('data-live') === 'on';
document.addEventListener('click', e => {
  const a = e.target && e.target.closest && e.target.closest('#exploreBtn');
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !canEnter()) return;
  e.preventDefault(); enterViewer();
});
function enterViewer() {
  const wasPlaying = V.playing();
  clearTimeout(timer); timer = 0;
  setState('far');
  const task = window.K8StageTask;
  if (task) { try { task.setState('far'); if (task.release) task.release(); } catch (err) { setTimeout(() => { throw err; }); } }
  if (window.K8Story && window.K8Story.suspend) window.K8Story.suspend();
  placeInset(null);
  entered = true; clearInterval(speedTick); speedTick = 0;
  const story = document.getElementById('story'); if (story) story.inert = true;
  addEventListener('k8:side', () => { if (story) story.inert = true; });
  V.enter();
  V.setPlaying(wasPlaying);
}

(function returnFocus() {
  const back = !!(window.K8Story && window.K8Story.returned);
  if (!back || location.hash !== '#s-explore') return;
  let tries = 0;
  const go = () => {
    const b = document.getElementById('exploreBtn'), a = document.activeElement;
    if (b && (!a || a === document.body)) b.focus({ preventScroll: true });
    if (document.activeElement !== b && ++tries < 120 && (!a || a === document.body)) requestAnimationFrame(go);
  };
  go();
})();

export const stage = { mount, setState, setPos, showStep, release, homeInset: () => placeInset(null) };
window.K8StageModel = stage;
window.__model = { ready: () => ready, want: () => want, pending: () => !!timer, insetAt: () => insetAt, paused: () => paused };
if (window.K8Story && typeof window.K8Story.addLive === 'function') window.K8Story.addLive('model', stage);
