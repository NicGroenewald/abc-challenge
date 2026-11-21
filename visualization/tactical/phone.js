(() => {
  'use strict';
  const html = document.documentElement, BOOT = window.K8_BOOT || {};
  const coarse = matchMedia('(pointer: coarse)');
  const $ = id => document.getElementById(id);
  const vp = () => window.K8Viewport ? window.K8Viewport() : { left: 0, top: 0, width: innerWidth, height: innerHeight };

  const story = () => html.classList.contains('story');
  function formNow() {
    if (/[?&]nophone=1/.test(location.search)) return null;
    if (window.K8_EMBED || story()) return null;
    const { width: w, height: h } = vp();
    if (h <= 500 && w > h) return 'column';
    if (w <= 900) return w > h ? 'column' : 'sheet';
    return null;
  }
  function apply() {
    const f = formNow(), was = html.dataset.form || null, br = $('brand');
    if (br) html.style.setProperty('--brand-w', Math.ceil([...br.children].reduce((m, c) => Math.max(m, c.getBoundingClientRect().right), 0)) + 'px');
    if (f) html.dataset.form = f; else delete html.dataset.form;
    html.classList.toggle('touch', coarse.matches && !story());
    if (f !== was) { placeData(); placeTools(); syncTabs(); legendSoon(); }
    return f !== was;
  }
  const form = () => window.K8_EMBED ? null : html.dataset.form || null;

  const tabs = document.createElement('div');
  tabs.id = 'sheetTabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'What the panel shows');
  tabs.innerHTML =
    '<button type="button" role="tab" data-t="card" aria-selected="true">Explain</button>' +
    '<button type="button" role="tab" data-t="step" aria-selected="false">This step</button>' +
    '<button type="button" role="tab" data-t="user" aria-selected="false">Test user</button>' +
    '<button type="button" class="fold" aria-expanded="true" aria-label="Fold the panel away"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>';
  const side = $('side'), card = $('card'), bar = $('bar');
  if (side) side.before(tabs); else document.body.appendChild(tabs);
  if ($('userbox')) { const n = document.createElement('p'); n.id = 'sheetUserNote';
    n.textContent = 'Five players: one real recording and four synthetic ones, from calm to very fast head motion. Pick one to run its motion through the model.';
    $('userbox').after(n); }

  let sheet = 'card';
  html.dataset.sheet = sheet;
  const stepHasContent = () => !!(($('inset') && $('inset').classList.contains('show')) || ($('gazeKey') && $('gazeKey').classList.contains('show')));
  function syncTabs() {
    const has = stepHasContent(), stepB = tabs.querySelector('[data-t="step"]');
    stepB.disabled = !has;
    if (!has && sheet === 'step') sheet = 'card';
    html.dataset.sheet = sheet;
    for (const b of tabs.querySelectorAll('[data-t]')) b.setAttribute('aria-selected', String(b.dataset.t === sheet));
    const min = html.hasAttribute('data-sheetmin'), fold = tabs.querySelector('.fold');
    fold.setAttribute('aria-expanded', String(!min));
    fold.setAttribute('aria-label', min ? 'Open the panel' : 'Fold the panel away');
  }
  const relayout = () => { requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); };
  function setMin(on) {
    if (on === html.hasAttribute('data-sheetmin')) return;
    html.toggleAttribute('data-sheetmin', on); syncTabs(); if (form()) relayout();
  }
  function setSheet(t) { sheet = t; syncTabs(); setMin(false); }
  tabs.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.classList.contains('fold')) return setMin(!html.hasAttribute('data-sheetmin'));
    if (b.dataset.t === sheet && !html.hasAttribute('data-sheetmin')) return;
    setSheet(b.dataset.t);
  });
  for (const id of ['inset', 'gazeKey']) if ($(id)) new MutationObserver(syncTabs).observe($(id), { attributes: true, attributeFilter: ['class'] });

  const WORDS = [
    [/the top-right panel/g, 'the This step tab'],
    [/top-right panel/g, 'This step tab'],
    [/the Key on the right/g, 'the Key in the This step tab'],
    [/\bhover to go back in time\b/g, 'tap or slide to go back in time'],
    [/\bhover a step\b/g, 'tap or slide to pick a step'],
    [/\bClick\b/g, 'Tap'], [/\bclick\b/g, 'tap'],
    [/scroll to zoom/g, '− / + to zoom', 'touch'],
  ];
  const words = s => { if (!s || !form()) return s; for (const [re, to, only] of WORDS) if (!only || html.classList.contains(only)) s = s.replace(re, to); return s; };

  const rect = el => { if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); return r.width && r.height ? r : null; };
  function free() {
    const f = form(); if (!f || document.body.classList.contains('wearing') || document.body.classList.contains('lite')) return null;
    const { width: VW, height: VH } = vp(), m = 8, tr = rect(tabs), br = rect(bar), hud = rect($('guideHud')), min = html.hasAttribute('data-sheetmin');
    if (!tr) return null;
    let L = m, R = VW - m, T = 50, B = (br ? br.top : VH) - m;
    if (f === 'sheet') { B = tr.top - m; if (hud) T = Math.max(T, hud.bottom + 4); }
    else if (min) T = tr.bottom + m;
    else L = tr.right + m;
    if (R - L < 80 || B - T < 60) return null;
    return { L, R, T, B };
  }
  function offset() { const r = free(), v = vp(); return r ? { x: Math.round(v.width / 2 - (r.L + r.R) / 2), y: Math.round(v.height / 2 - (r.T + r.B) / 2) } : null; }
  function distK() { const r = free(); return r ? Math.max(1, vp().height / 900 * Math.max(670 / (r.R - r.L), 750 / (r.B - r.T))) : 1; }

  function tip(t, box) {
    const f = form(); if (!box) return false;
    if (!f) { box.classList.remove('ptop'); return false; }
    const el = t && t.dom ? document.querySelector(t.dom.replace(/:not\(\[disabled\]\)/, '')) : null;
    const top = !!(t && t.dom);
    if (el && card && card.contains(el)) setSheet('card');
    else if (el && side && side.contains(el)) setSheet(el.closest('#userbox') ? 'user' : 'step');
    if (el) {
      const sc = el.closest('#card') || el.closest('#side');
      if (sc) { const er = el.getBoundingClientRect(), sr = sc.getBoundingClientRect(); if (er.top < sr.top || er.bottom > sr.bottom) sc.scrollTop += er.top - sr.top - (sr.height - er.height) / 2; }
    }
    box.classList.toggle('ptop', top);
    if (top) {
      const hud = rect($('guideHud')), tr = rect(tabs), col = f === 'column' && tr && !html.hasAttribute('data-sheetmin');
      const y = f === 'sheet' && hud ? hud.bottom + 6 : 52, l = col ? tr.right + 8 : 8;
      box.style.setProperty('--tip-top', y + 'px'); box.style.setProperty('--tip-l', l + 'px'); box.style.setProperty('--tip-w', (vp().width - l - 8) + 'px');
      const lim = f === 'sheet' && tr ? tr.top - 8 - y : vp().height - y - 8 - (rect(bar) ? rect(bar).height + 16 : 0);
      box.style.setProperty('--tip-h', Math.max(110, lim) + 'px');
    }
    return true;
  }

  function placeData() {
    const foot = $('dvFoot'), text = $('dvText'), stage = $('dvStage'); if (!foot || !text || !stage) return;
    if (form()) { if (foot.parentElement !== text) text.prepend(foot); }
    else if (foot.parentElement !== stage) stage.appendChild(foot);
  }
  function dataStage() {
    placeData(); if (!form()) return;
    const text = $('dvText'), cur = document.querySelector('#dvFlow button[aria-current="step"]'), flow = $('dvFlow');
    if (text) text.scrollTop = 0;
    if (cur && flow) flow.scrollLeft = cur.parentElement.offsetLeft - flow.offsetLeft - (flow.clientWidth - cur.offsetWidth) / 2;
  }

  const menu = $('menu'), keys = $('keysHelp');
  const MOVED = ['guideBtn', 'all', 'scrub', 'readout'].map($).filter(Boolean), HOME = new Map(MOVED.map(el => [el, [el.parentElement, el.nextSibling]]));
  let tools = null;
  function placeTools() {
    if (!menu || !MOVED.length) return;
    if (html.dataset.form === 'sheet') {
      if (!tools) {
        tools = document.createElement('div'); tools.id = 'phoneTools';
        tools.innerHTML = '<div class="pt-row"></div><label class="pt-time"><span>Time</span></label>';
        const step = d => { const s = $('scrub'); if (!s) return; if (window.K8Viewer && K8Viewer.setPlaying) K8Viewer.setPlaying(false);
          s.value = String(Math.max(+s.min, Math.min(+s.max, +s.value + d))); s.dispatchEvent(new Event('input', { bubbles: true })); };
        for (const [d, l, p] of [[-1, 'One sample back', 'm15 18-6-6 6-6'], [1, 'One sample on', 'm9 18 6-6-6-6']]) {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'b-icon pt-step'; b.setAttribute('aria-label', l);
          b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${p}"/></svg>`; b.onclick = () => step(d); tools.querySelector('.pt-time').append(b); }
        menu.querySelector('.mh').after(tools);
        tools.addEventListener('click', e => { if (e.target.closest('#guideBtn, #all') && menu.classList.contains('show')) $('more').click(); }, true);
      }
      const row = tools.querySelector('.pt-row'), time = tools.querySelector('.pt-time');
      for (const el of MOVED) if (el.tagName === 'BUTTON') row.appendChild(el); else time.insertBefore(el, el.id === 'scrub' ? time.querySelector('.pt-step') : null);
    } else for (const el of MOVED) { const [par, next] = HOME.get(el); if (el.parentElement !== par) par.insertBefore(el, next && next.parentElement === par ? next : null); }
    buttonHelp();
  }

  if (menu && keys) {
    const d = document.createElement('details'); d.className = 'hint'; d.id = 'touchHelp'; d.open = true;
    d.innerHTML = '<summary>Touch</summary><dl>' +
      '<dt>drag with one finger</dt><dd>turn the model</dd><dt>pinch</dt><dd>zoom</dd><dt>drag with two fingers</dt><dd>move the view</dd>' +
      '<dt>tap a name in the scene</dt><dd>open that part</dd><dt>double-tap a part</dt><dd>fly to it</dd>' +
      '<dt>tap or slide on a chart</dt><dd>pick a step</dd></dl><dl id="btnHelp"></dl>';
    keys.before(d);
    buttonHelp();
  }
  function buttonHelp() {
    const list = $('btnHelp'); if (!list) return;
    list.replaceChildren();
    for (const id of ['play', 'guideBtn', 'call', 'all']) {
      const b = $(id), svg = b && b.querySelector('svg'); if (!b || !b.dataset.tip || b.closest('#phoneTools')) continue;
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      if (svg) { const c = svg.cloneNode(true); c.setAttribute('width', 16); c.setAttribute('height', 16); c.style.cssText = 'stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle'; dt.appendChild(c); }
      dd.textContent = b.dataset.tip.replace(' with W A S D and the mouse', ''); list.append(dt, dd);
    }
  }

  const all = $('all');
  function stages() {
    const steps = window.__k8steps || [], out = [];
    for (const el of document.querySelectorAll('#labels .lbl.stage[data-key]')) { const i = steps.indexOf(el.dataset.key); if (i < 0) continue;
      if (!el.dataset.n) { el.dataset.n = i + 1; el.dataset.name = el.textContent; el.setAttribute('aria-label', el.textContent); }
      out.push({ n: i + 1, key: el.dataset.key, name: el.dataset.name, el }); }
    return out.sort((a, b) => a.n - b.n);
  }
  function legend() {
    const whole = !!(all && all.getAttribute('aria-pressed') === 'true');
    html.toggleAttribute('data-whole', whole);
    const bd = card && card.querySelector('.bd'), old = $('stageLegend');
    if (!form() || !whole || !bd) { if (old) old.remove(); return; }
    const list = stages(); if (!list.length) return;
    let nav = old; if (!nav || nav.parentElement !== bd) { if (old) old.remove(); nav = document.createElement('nav'); nav.id = 'stageLegend'; nav.setAttribute('aria-label', 'The parts of the model, by number'); bd.prepend(nav);
      for (const s of list) { const b = document.createElement('button'); b.type = 'button'; b.dataset.key = s.key; const i = document.createElement('i'); i.textContent = s.n; b.append(i, ' ' + s.name.replace(/ 7→32 \+ ReLU$/, '')); nav.appendChild(b); }
      nav.onclick = e => { const b = e.target.closest('button'); const s = b && list.find(x => x.key === b.dataset.key); if (s) s.el.click(); }; }
    for (const b of nav.children) b.setAttribute('aria-pressed', String(list.find(x => x.key === b.dataset.key).el.classList.contains('on')));
  }
  let legendT = 0; const legendSoon = () => { clearTimeout(legendT); legendT = setTimeout(legend, 0); };
  if (card) new MutationObserver(legendSoon).observe(card, { childList: true });
  if (card) new MutationObserver(() => { if (form()) card.scrollTop = 0; }).observe(card, { childList: true });
  if (all) new MutationObserver(legendSoon).observe(all, { attributes: true, attributeFilter: ['aria-pressed'] });
  addEventListener('load', legendSoon);

  apply(); syncTabs();
  addEventListener('resize', apply);
  if (coarse.addEventListener) coarse.addEventListener('change', apply);
  if (bar && window.ResizeObserver) { let h = 0; new ResizeObserver(() => { const n = bar.offsetHeight; if (n !== h) { h = n; if (form()) relayout(); } }).observe(bar); }

  window.K8Phone = { apply, words, form, free, offset, distK, tip, dataStage, setSheet, setMin, sheet: () => sheet, isPhone: !!BOOT.phone };
})();
