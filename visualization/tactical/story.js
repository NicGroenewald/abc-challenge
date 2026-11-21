(function () {
  'use strict';
  if (!window.K8_STORY) return;
  var html = document.documentElement;
  var returned = false;
  try { returned = sessionStorage.getItem('k8StoryReturn') === '1'; sessionStorage.removeItem('k8StoryReturn'); } catch (e) {  }
  var wants = window.matchMedia('(prefers-reduced-motion: no-preference) and (min-width: 1000px) and (min-height: 600px)');

  var STEP_SVH = 160;
  var GLIDE = .5;
  var MAX_RATE = 1;
  var HOLD = .35;
  var STICK = .04;
  var TILT_Y = 24, TILT_X = 5;
  var BACK = 120, FRONT = 260;
  var OPEN = { tiltY: 5, tiltX: 2, offX: .07, offY: .06 };
  var FLIP = [.3, .7];
  var TEXT_OUT = [.05, .3], TEXT_IN = [.7, .95];
  var FADE_MS = 300;
  var GATE = /[?&]gate=1(&|#|$)/.test(location.search);
  var CARRY = !/[?&]gate=0(&|#|$)/.test(location.search);
  var GATE_REST = 180;
  var GATE_DWELL = 900;
  var MODULES = { task: 'stage_task.js?r=q1', model: 'model_panel.js?r=f2' };

  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var range = function (v, a, b) { return clamp((v - a) / (b - a)); };
  var ease = function (t) { return t < .5 ? 2 * t * t : 1 - (2 - 2 * t) * (1 - t); };

  var decks = [], byKey = {}, byName = {}, on = false, suspended = false, queued = false;

  function call(p, name, args) {
    if (!p || typeof p[name] !== 'function') return;
    try { p[name].apply(p, args || []); } catch (e) { setTimeout(function () { throw e; }); }
  }

  function Deck(track) {
    var d = this;
    d.track = track; d.name = track.dataset.deck;
    d.stage = track.querySelector('.dk-stage');
    d.space = d.stage ? d.stage.querySelector(':scope > .dk-space') : null;
    d.rail = Array.prototype.slice.call(track.querySelectorAll('.dk-rail [data-phase]'));
    d.steps = Array.prototype.slice.call(track.querySelectorAll('.dk-step'));
    d.N = d.steps.length;
    d.keys = d.steps.map(function (st) { return st.dataset.key; });
    d.sides = d.steps.map(function (st) { return st.dataset.side === 'left' ? 1 : 0; });
    d.closes = track.dataset.end === 'close';
    d.grow = parseFloat(track.dataset.grow) || 1;
    d.open = track.dataset.layers === 'open';
    d.slotOf = []; d.slotNames = []; d.panels = [];
    d.steps.forEach(function (st, i) {
      var name = st.dataset.slot || st.dataset.key;
      var first = i === 0 || name !== d.steps[i - 1].dataset.slot;
      if (first) { d.slotNames.push(name); d.panels.push(st.querySelector('.dk-panel')); }
      d.slotOf.push(d.slotNames.length - 1);
      st.classList.toggle('dk-follow', !first);
      var img = st.querySelector('.dk-panel img'), tag = st.querySelector('.dk-panel .pn-tag');
      st._pic = img ? { src: img.getAttribute('src'), alt: img.getAttribute('alt') } : null;
      st._tag = tag ? tag.textContent : '';
      byKey[st.dataset.key] = { deck: d, i: i };
      if (st.id) byKey['#' + st.id] = byKey[st.dataset.key];
    });
    d.M = d.panels.length;
    d.s = -1; d.cur = -1; d.pw = 0;
    d.size = null;
    d.live = null; d.lstate = null; d.lpos = ''; d.lview = null;
  }

  Deck.prototype.sigma = function (s) {
    var i = Math.floor(s), f = s - i;
    if (i >= this.N - 1) return this.slotOf[this.N - 1];
    return this.slotOf[i] + (this.slotOf[i + 1] - this.slotOf[i]) * f;
  };

  Deck.prototype.sideAt = function (s) {
    var i = Math.min(this.N - 1, Math.floor(s)), f = s - i, a = this.sides[i], b = this.sides[Math.min(this.N - 1, i + 1)];
    if (a === b) return { flip: a, ta: 1 };
    return { flip: a + (b - a) * ease(range(f, FLIP[0], FLIP[1])), ta: f < .5 ? 1 - range(f, TEXT_OUT[0], TEXT_OUT[1]) : range(f, TEXT_IN[0], TEXT_IN[1]) };
  };

  Deck.prototype.place = function (s) {
    var d = this, M = d.M, N = d.N, sg = d.sigma(s), side = d.sideAt(s);
    d.track.style.setProperty('--flip', side.flip.toFixed(4));
    d.track.style.setProperty('--ta', side.ta.toFixed(3));
    var mirror = 1 - 2 * side.flip;
    var tY = d.open ? OPEN.tiltY : TILT_Y, tX = d.open ? OPEN.tiltX : TILT_X;
    var end = d.closes && M > 1 ? ease(range(sg, M - 2, M - 1)) : 0;
    var grow = d.grow > 1 && N > 1 ? ease(range(s, N - 2, N - 1)) : 0;
    var tilt = ease(range(sg, .1, 1)) * (1 - end) * (1 - grow);
    for (var j = 0; j < M; j++) {
      var el = d.panels[j], dist = j - sg;
      if (!el) continue;
      if (dist >= 1 || dist <= -4.5) { if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'; continue; }
      var z = dist <= 0 ? dist * BACK : dist * FRONT;
      var show = dist > 0 ? range(dist, .6, 0) : dist > -3 ? 1 : 1 - (-3 - dist) / 1.5;
      if (j < M - 1) show *= 1 - end;
      var glass = dist >= 0 ? 1 : Math.max(.12, 1 + .6 * dist);
      if (dist < 0 && dist > -1.5 && el.dataset.keep) glass = Math.max(glass, +el.dataset.keep);
      var scale = j === M - 1 ? (1 + .05 * end) * (1 + (d.grow - 1) * grow) : 1;
      var shift = d.open && dist < 0 ? 'translate3d(' + (dist * OPEN.offX * d.pw * mirror).toFixed(1) + 'px,' + (dist * OPEN.offY * d.pw).toFixed(1) + 'px,0) ' : '';
      el.style.visibility = 'visible';
      el.style.opacity = show.toFixed(3);
      el.style.transform = shift + 'rotateY(' + (tY * tilt * mirror).toFixed(2) + 'deg) rotateX(' + (tX * tilt).toFixed(2) + 'deg) translateZ(' + z.toFixed(1) + 'px) scale(' + scale.toFixed(3) + ')';
      el.style.setProperty('--k', glass.toFixed(3));
      el.style.setProperty('--u', range(-dist, -.5, -.05).toFixed(3));
    }
    var c = d.curAt(s);
    if (c !== d.cur) d.setCur(c);
  };

  Deck.prototype.curAt = function (p) {
    var c = this.cur, last = this.N - 1, reach = .5 + STICK;
    if (c < 0) return Math.min(last, Math.max(0, Math.round(p)));
    if (p > c + reach) return Math.min(last, Math.ceil(p - reach));
    if (p < c - reach) return Math.max(0, Math.floor(p + reach));
    return c;
  };

  Deck.prototype.setCur = function (c) {
    var d = this, prev = d.cur, st = d.steps[c];
    if (prev >= 0) d.steps[prev].classList.remove('is-cur');
    st.classList.add('is-cur'); d.cur = c;
    var phase = st.dataset.phase || '';
    d.track.dataset.phase = phase;
    d.track.dataset.side = st.dataset.side || 'right';
    d.rail.forEach(function (li) { li.classList.toggle('is-on', li.dataset.phase === phase); });
    d.showPic(c, prev >= 0 && d.slotOf[prev] === d.slotOf[c]);
    d.view();
    window.dispatchEvent(new CustomEvent('k8:story-step', { detail: { deck: d.name, i: c, key: st.dataset.key, slot: st.dataset.slot || st.dataset.key } }));
  };

  Deck.prototype.showPic = function (c, fade) {
    var d = this, el = d.panels[d.slotOf[c]], st = d.steps[c];
    if (!el || !st._pic) return;
    var img = el.querySelector('img'), tag = el.querySelector('.pn-tag');
    if (!img || img.getAttribute('src') === st._pic.src) return;
    if (fade && img.animate) {
      if (d._ghost) d._ghost.remove();
      var g = img.cloneNode(false); g.removeAttribute('id'); g.alt = ''; g.setAttribute('aria-hidden', 'true'); g.className = 'pn-xfade';
      img.parentNode.appendChild(g); d._ghost = g;
      g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-out' }).onfinish = function () { g.remove(); if (d._ghost === g) d._ghost = null; };
    }
    img.setAttribute('src', st._pic.src); img.setAttribute('alt', st._pic.alt || '');
    if (tag) tag.textContent = st._tag;
  };

  Deck.prototype.reset = function () {
    var d = this;
    d.steps.forEach(function (st) { st.classList.remove('is-cur'); });
    d.panels.forEach(function (el) { if (el) el.removeAttribute('style'); });
    d.rail.forEach(function (li) { li.classList.remove('is-on'); });
    delete d.track.dataset.phase; delete d.track.dataset.side;
    d.track.style.removeProperty('--flip'); d.track.style.removeProperty('--ta');
    if (d._ghost) { d._ghost.remove(); d._ghost = null; }
    for (var j = 0; j < d.N; j++) if (!d.steps[j].classList.contains('dk-follow')) d.showPic(j, false);
    d.cur = -1; d.s = -1;
  };

  Deck.prototype.sizes = function () {
    if (!this.size) {
      this.size = { sh: this.stage.offsetHeight, pinTop: parseFloat(getComputedStyle(this.stage).top) || 0 };
      if (this.open && this.panels[0]) this.pw = this.panels[0].offsetWidth;
    }
    return this.size;
  };
  Deck.prototype.geom = function () {
    var z = this.sizes(), r = this.track.getBoundingClientRect(), budget = r.height - z.sh;
    return { top: r.top, bottom: r.bottom, sh: z.sh, H: window.innerHeight, pinTop: z.pinTop, stepPx: budget > 0 ? budget / (this.N - 1 + HOLD) : 0 };
  };
  Deck.prototype.apply = function (g, dt) {
    var t = g.stepPx > 0 ? Math.min(this.N - 1, Math.max(0, (g.pinTop - g.top) / g.stepPx)) : 0, s = this.s;
    if (dt === null || s < 0 || g.bottom <= 0 || g.top >= g.H) s = t;
    else if (s !== t) {
      var diff = t - s, a = Math.abs(diff);
      var step = Math.min(a * (1 - Math.exp(-dt / GLIDE)), MAX_RATE * Math.max(1, a) * dt);
      s = a - step < .001 ? t : s + (diff > 0 ? step : -step);
    }
    this.t = t; this.moving = s !== t;
    if (s !== this.s) { this.s = s; this.place(s); }
    this.view();
    this.feed(g);
  };
  Deck.prototype.measure = function () { this.apply(this.geom(), 0); };
  function resetSizes() { decks.forEach(function (d) { d.size = null; }); stopsAt = null; gate.on = false; if (rest.raf || rest.timer) restCancel(); }
  Deck.prototype.stepY = function (i) {
    var g = this.geom();
    return Math.round(window.scrollY + g.top - g.pinTop + g.stepPx * i);
  };

  Deck.prototype.feed = function (g) {
    var d = this, L = d.live; if (!L) return;
    var lead = clamp((g.top - g.pinTop) / Math.max(1, g.H - g.pinTop)), tail = clamp((g.pinTop + g.sh - g.bottom) / Math.max(1, g.sh));
    d.tell(lead === 0 && tail === 0 ? 'current' : g.bottom > -g.H && g.top < 2 * g.H ? 'near' : 'far');
    if (d.lstate === 'far') return;
    var key = d.keys[Math.max(0, d.cur)], sig = d.s + '|' + key + '|' + lead + '|' + tail;
    if (sig === d.lpos) return;
    d.lpos = sig;
    call(L, 'setPos', [d.s, key, { lead: lead, tail: tail }]);
  };
  Deck.prototype.tell = function (st) {
    if (!this.live || st === this.lstate) return;
    this.lstate = st;
    if (st === 'far') this.lpos = '';
    call(this.live, 'setState', [st]);
  };
  Deck.prototype.view = function () {
    var st = this.steps[this.cur], v = st && st.dataset.view;
    if (this.t !== undefined && this.curAt(this.t) !== this.cur) return;
    if (!this.live || !v || v === this.lview) return;
    this.lview = v;
    call(this.live, 'showStep', [v]);
  };

  function allFar() { decks.forEach(function (d) { d.tell('far'); }); }

  Deck.prototype.syncLive = function () {
    var on2 = on && !!this.space && this.space.getAttribute('data-live') === 'on';
    if (this.track.classList.contains('is-live') !== on2) this.track.classList.toggle('is-live', on2);
  };

  function addLive(name, p) {
    var d = byName[name];
    if (!d || !d.space || !p || d.live) return;
    d.live = p; d.lstate = null; d.lpos = ''; d.lview = null;
    call(p, 'mount', [d.space]);
    if (!on || suspended) { d.tell('far'); return; }
    d.measure(); d.view();
  }

  var loads = {}, pageLoaded = false, openedBeyond = false;
  function liveAllowed() { return !!(window.K8_BOOT && window.K8_BOOT.live3d) && on && !suspended && !/[?&]live=0(&|#|$)/.test(location.search); }
  function exists(url, cb) {
    var w, src;
    try {
      src = URL.createObjectURL(new Blob(['onmessage=function(e){fetch(e.data,{method:"HEAD",cache:"no-store"}).then(function(r){postMessage(r.ok)},function(){postMessage(false)})}'], { type: 'text/javascript' }));
      w = new Worker(src);
    } catch (e) { cb(false); return; }
    var done = function (ok) { w.terminate(); URL.revokeObjectURL(src); cb(ok); };
    w.onmessage = function (e) { done(e.data === true); };
    w.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); done(false); };
    w.postMessage(new URL(url, location.href).href);
  }
  function load(name) {
    if (loads[name] || !liveAllowed()) return;
    loads[name] = 'asking';
    exists(MODULES[name], function (ok) {
      if (!ok || !liveAllowed()) { loads[name] = ok ? null : 'missing'; checkModel(); return; }
      var sc = document.createElement('script'); sc.type = 'module'; sc.src = MODULES[name];
      sc.onload = function () { loads[name] = 'loaded'; checkModel(); };
      sc.onerror = function () { loads[name] = 'failed'; checkModel(); };
      loads[name] = 'loading'; document.head.appendChild(sc);
    });
  }
  function checkModel() {
    var t = byName.task;
    if (loads.model || !pageLoaded || !liveAllowed()) return;
    var taskSettled = !t || !t.space || t.space.dataset.live === 'on' || loads.task === 'missing' || loads.task === 'failed';
    var leftFirst = !t || t.s >= .5;
    if (!(taskSettled || openedBeyond) || !leftFirst) return;
    loads.model = 'waiting';
    var go = function () { loads.model = null; load('model'); };
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 200);
  }
  function onLoaded() {
    pageLoaded = true;
    var t = byName.task; openedBeyond = !!(t && t.s >= .5);
    load('task'); checkModel();
    var sp = t && t.space;
    if (sp && window.MutationObserver) new MutationObserver(checkModel).observe(sp, { attributes: true, attributeFilter: ['data-live'] });
  }

  (function () {
    var bar = document.querySelector('.st-top'), b = bar && bar.querySelector('.st-menu'); if (!b) return;
    function set(open) { bar.classList.toggle('is-chap', open); b.setAttribute('aria-expanded', open ? 'true' : 'false'); }
    b.addEventListener('click', function () { set(!bar.classList.contains('is-chap')); });
    bar.querySelector('.st-chap').addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    document.addEventListener('click', function (e) { if (!bar.contains(e.target)) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && bar.classList.contains('is-chap')) { set(false); b.focus(); } });
  })();

  var lastT = 0;
  function measureAll(now) {
    queued = false; if (!on || suspended) { lastT = 0; return; }
    var dt = now === undefined ? null : lastT ? Math.min(.05, Math.max(0, (now - lastT) / 1000)) : 1 / 60;
    var gs = decks.map(function (d) { return d.geom(); }), moving = false;
    for (var i = 0; i < decks.length; i++) { decks[i].apply(gs[i], dt); if (decks[i].moving) moving = true; }
    lastT = moving && now !== undefined ? now : 0;
    if (moving) ask();
    if (pageLoaded && !loads.model) checkModel();
  }
  var gate = { on: false, until: 0, lo: -Infinity, hi: Infinity, held: 0 }, stopsAt = null, exitsAt = null;
  function stops() {
    if (!stopsAt) {
      stopsAt = []; exitsAt = [];
      decks.forEach(function (d) {
        for (var i = 0; i < d.N; i++) stopsAt.push(d.stepY(i));
        var g = d.geom(), top = window.scrollY + g.top - g.pinTop, h = g.bottom - g.top;
        exitsAt.push({ pinned: Math.round(top + h - g.sh), out: Math.round(top + h) });
        stopsAt.push(Math.round(top + h));
      });
      for (var k = 1; k < decks.length; k++) { var a0 = exitsAt[k - 1].out, b0 = decks[k].stepY(0);
        if (b0 - a0 > 8 && b0 - a0 < window.innerHeight * .6) exitsAt.push({ pinned: a0, out: b0 }); }
      stopsAt.sort(function (a, b) { return a - b; });
    }
    return stopsAt;
  }
  function gateFrom(y) {
    var S = stops(), lo = -Infinity, hi = Infinity;
    for (var i = 0; i < S.length; i++) { if (S[i] < y - 2) lo = S[i]; else if (S[i] > y + 2) { hi = S[i]; break; } }
    gate.lo = lo; gate.hi = hi; gate.held = 0; gate.on = true;
  }
  function gateInput() {
    if (!GATE || !on || suspended) return;
    var now = performance.now();
    if (!gate.on || now > gate.until) gateFrom(window.scrollY);
    gate.until = now + GATE_REST;
  }
  function gateScroll() {
    if (!gate.on) return;
    var now = performance.now(), y = window.scrollY;
    if (now > gate.until || !on || suspended) { gate.on = false; return; }
    var to = y > gate.hi ? gate.hi : y < gate.lo ? gate.lo : null;
    if (to === null) return;
    if (!gate.held) gate.held = now;
    jump(to);
    if (now - gate.held > GATE_DWELL) gateFrom(to);
  }
  function ask() { if (!queued) { queued = true; requestAnimationFrame(measureAll); } }

  var SETTLE_REST = 420, SETTLE_MS = 850, CARRY_REACH = .3;
  var rest = { timer: 0, raf: 0, lastY: 0, dir: 1 };
  function restCancel() { if (rest.raf) cancelAnimationFrame(rest.raf); rest.raf = 0; if (rest.timer) clearTimeout(rest.timer); rest.timer = 0; }
  function restScroll() {
    if (!CARRY || !on || suspended) return;
    if (rest.raf) return;
    var y = window.scrollY; if (y !== rest.lastY) rest.dir = y > rest.lastY ? 1 : -1; rest.lastY = y;
    restCancel(); rest.timer = setTimeout(restSettle, SETTLE_REST);
  }
  function restSettle() {
    rest.timer = 0;
    if (!on || suspended) return;
    stops();
    var y = window.scrollY, z = null;
    for (var i = 0; i < exitsAt.length; i++) if (y > exitsAt[i].pinned + 4 && y < exitsAt[i].out - 4) z = exitsAt[i];
    if (!z) return;
    var toOut = z.out - y, toPin = y - z.pinned;
    if (Math.min(toOut, toPin) > (z.out - z.pinned) * CARRY_REACH) return;
    var from = y, to = toOut < toPin ? z.out : z.pinned, t0 = performance.now();
    gate.on = false;
    (function frame(now) {
      var k = Math.min(1, Math.max(0, (now - t0) / SETTLE_MS)), yy = Math.round(from + (to - from) * ease(k));
      jump(yy); rest.lastY = yy; ask();
      rest.raf = k < 1 ? requestAnimationFrame(frame) : 0;
    })(t0);
  }

  function jump(y) {
    var sb = html.style.scrollBehavior; html.style.scrollBehavior = 'auto';
    window.scrollTo(0, y);
    html.style.scrollBehavior = sb;
  }
  function find(key) { return key ? byKey[key] || byKey['#' + key] || null : null; }
  function stepY(key) {
    var f = find(key); if (!f) return null;
    if (on) return f.deck.stepY(f.i);
    var bar = parseFloat(getComputedStyle(f.deck.steps[f.i]).scrollMarginTop) || 0;
    return Math.round(window.scrollY + f.deck.steps[f.i].getBoundingClientRect().top - bar);
  }
  function go(key) { var y = stepY(key); if (y === null) return false; gate.on = false; restCancel(); jump(y); measureAll(); return true; }

  function onClick(e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null, h = a ? a.getAttribute('href') : '';
    if (!on || !find(h)) return;
    e.preventDefault(); go(h); history.replaceState(null, '', h);
  }
  function fromHash() { if (on && find(location.hash)) go(location.hash); }

  function setMotion() {
    on = wants.matches;
    html.classList.toggle('st-motion', on);
    resetSizes();
    decks.forEach(function (d) {
      d.reset(); d.syncLive();
      d.track.style.height = on ? 'calc(100svh - var(--bar) + ' + ((d.N - 1 + HOLD) * STEP_SVH).toFixed(1) + 'svh)' : '';
    });
    if (!on) allFar();
    else if (pageLoaded) { load('task'); }
    ask();
  }

  function state() {
    var o = { on: on, suspended: suspended, moving: decks.some(function (d) { return !!d.moving; }), decks: {}, live: { task: null, model: null } };
    decks.forEach(function (d) {
      var st = d.steps[d.cur];
      o.decks[d.name] = { s: d.s, goal: d.t === undefined ? d.s : d.t, cur: d.cur, key: st ? st.dataset.key : null, slot: st ? (st.dataset.slot || st.dataset.key) : null,
        steps: d.N, phase: st ? st.dataset.phase || '' : null, keys: d.keys.slice(), side: st ? st.dataset.side || 'right' : null };
      if (d.name in o.live) o.live[d.name] = d.live ? d.lstate || 'far' : null;
    });
    return o;
  }

  function start() {
    decks = Array.prototype.slice.call(document.querySelectorAll('#story .dk-track[data-deck]')).map(function (t) { return new Deck(t); });
    decks.forEach(function (d) { byName[d.name] = d; });
    if (!decks.length) return;
    window.addEventListener('scroll', function () { gateScroll(); restScroll(); ask(); }, { passive: true });
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) { window.addEventListener(ev, function () { if (rest.raf) restCancel(); }, { passive: true }); });
    window.addEventListener('wheel', gateInput, { passive: true });
    window.addEventListener('resize', function () { resetSizes(); ask(); }, { passive: true });
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { resetSizes(); ask(); });
      decks.forEach(function (d) { if (d.stage) ro.observe(d.stage); if (d.open && d.panels[0]) ro.observe(d.panels[0]); });
    }
    if (window.MutationObserver) decks.forEach(function (d) {
      if (d.space) new MutationObserver(function () { d.syncLive(); }).observe(d.space, { attributes: true, attributeFilter: ['data-live'] });
    });
    window.addEventListener('hashchange', fromHash);
    window.addEventListener('load', fromHash);
    document.addEventListener('click', onClick);
    if (wants.addEventListener) wants.addEventListener('change', setMotion); else if (wants.addListener) wants.addListener(setMotion);
    setMotion();
    fromHash();
    if (document.readyState === 'complete') setTimeout(onLoaded); else window.addEventListener('load', function () { setTimeout(onLoaded); });
  }

  window.K8Story = {
    state: state, stepY: stepY, go: go, addLive: addLive,
    returned: returned,
    suspend: function () { suspended = true; allFar(); },
    resume: function () { suspended = false; decks.forEach(function (d) { d.s = -1; }); ask(); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
