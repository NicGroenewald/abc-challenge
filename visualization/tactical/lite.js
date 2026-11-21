(function () {
  'use strict';
  var STEPS = ['input', 'feat', 'proj', 'mirror', 'blk0', 'blk1', 'blk2', 'reach', 'head', 'traj', 'out', 'gaze'];
  var LEVELS = ['beginner', 'standard', 'expert'];
  var BOOT = window.K8_BOOT || {};
  var at = 0;
  var level = 'standard';
  var root, picEl, textEl, stepEl, backEl, nextEl, lvlEl;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function keyAt(i) { return i === 0 ? 'overview' : STEPS[i - 1]; }
  function saved(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function save(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {  } }
  function list(a, tag) { var h = '', i; if (!a || !a.length) return ''; for (i = 0; i < a.length; i++) h += '<' + tag + '>' + a[i] + '</' + tag + '>'; return h; }
  function chips(a) { var h = '', i; if (!a || !a.length) return ''; for (i = 0; i < a.length; i++) h += '<span class="lt-chip">' + a[i] + '</span>'; return '<div class="lt-chips">' + h + '</div>'; }

  function textFor(key) {
    var P = (window.PLAIN || {})[key] || {}, B = (window.BEGINNER || {})[key], E = (window.EXPERT || {})[key], h;
    if (level === 'beginner' && B) {
      h = '<h2>' + B.title + '</h2><p class="lt-one">' + B.idea + '</p><p>' + B.analogy + '</p>';
      if (B.look) h += '<div class="lt-lab">Look</div><p>' + B.look + '</p>';
      return h + chips(P.numbers);
    }
    if (level === 'expert' && E) {
      h = '<h2>' + E.title + '</h2>' + (E.prose ? '<p>' + E.prose + '</p>' : '') + (E.summary ? '<p class="lt-one">' + E.summary + '</p>' : '');
      if (E.math && E.math.length) h += '<pre>' + E.math.join('\n') + '</pre>';
      if (E.shapes && E.shapes.length) h += '<div class="lt-lab">shapes</div><pre>' + E.shapes.join('\n') + '</pre>';
      if (E.params) h += '<div class="lt-lab">parameters</div><p>' + E.params + '</p>';
      if (E.caveat) h += '<p class="lt-why">' + E.caveat + '</p>';
      if (E.onnx && E.onnx.length) h += '<div class="lt-lab">ONNX nodes</div>' + chips(E.onnx);
      if (E.refs && E.refs.length) h += '<p class="lt-src">' + E.refs.join(' · ') + '</p>';
      return h;
    }
    h = '<h2>' + (P.title || key) + '</h2>' + (P.oneLine ? '<p class="lt-one">' + P.oneLine + '</p>' : '') + (P.simple ? '<p>' + P.simple + '</p>' : '') + chips(P.numbers);
    if (P.why) h += '<p class="lt-why">' + P.why + '</p>';
    return h;
  }
  function title(key) { var P = (window.PLAIN || {})[key]; return P && P.title ? P.title : key; }

  function picSrc(key) {
    var base = 'pics/' + (key === 'overview' ? 'whole' : 'step_' + key), w = (picEl.clientWidth || 800) * (window.devicePixelRatio || 1);
    return base + (w > 960 ? '' : '_sm') + '.webp';
  }
  function show(i) {
    var key, k, h = '';
    at = Math.max(0, Math.min(STEPS.length, i)); key = keyAt(at);
    picEl.innerHTML = '<img alt="' + esc('Picture of the model at this step: ' + title(key)) + '" src="' + picSrc(key) + '">';
    picEl.firstChild.onerror = function () { picEl.innerHTML = '<p class="lt-nopic">The picture for this step could not be shown. This browser may not read WebP images; the text on the right is complete without it.</p>'; };
    textEl.innerHTML = textFor(key); textEl.scrollTop = 0;
    stepEl.innerHTML = at === 0 ? 'Whole model' : 'Step ' + at + ' of ' + STEPS.length;
    backEl.disabled = at === 0; nextEl.innerHTML = at === STEPS.length ? 'Start over' : at === 0 ? 'Start' : 'Next';
    for (k = 0; k < LEVELS.length; k++) h += '<button type="button" data-l="' + LEVELS[k] + '" aria-pressed="' + (LEVELS[k] === level) + '">' + LEVELS[k].charAt(0).toUpperCase() + LEVELS[k].slice(1) + '</button>';
    lvlEl.innerHTML = h;
  }
  function next() { show(at === STEPS.length ? 0 : at + 1); }
  function back() { show(at - 1); }

  var CSS = [
    'body.lite > *:not(#lite):not(#brand):not(#dataView):not(#banner):not(script):not(style) { display:none !important; }',
    'body.lite #brand > span { display:none; }',
    '#lite { position:fixed; left:0; top:0; right:0; bottom:0; z-index:1; background:#000; color:#eaeaea; font:15px/1.5 "Geist",system-ui,-apple-system,"Segoe UI",Arial,sans-serif; -webkit-font-smoothing:antialiased; overflow:auto; }',
    '#lite .lt-wrap { max-width:1500px; margin:0 auto; padding:56px 16px 16px; }',
    '#lite .lt-note { color:#808080; font-size:13px; margin:0 0 10px; }',
    '#lite a { color:#6fa8ff; }',
    '#lite .lt-main { overflow:hidden; }',
    '#lite .lt-pic { float:left; width:62%; background:#000; border:1px solid #2c2c2c; border-radius:8px; overflow:hidden; }',
    '#lite .lt-pic img { display:block; width:100%; height:auto; }',
    '#lite .lt-nopic { color:#808080; padding:40px 20px; margin:0; }',
    '#lite .lt-side { float:right; width:36%; }',
    '#lite .lt-text { background:#0a0a0a; border:1px solid #2c2c2c; border-radius:8px; padding:14px 16px; max-height:70vh; overflow:auto; }',
    '#lite h2 { font-size:18px; margin:0 0 8px; font-weight:500; letter-spacing:-.01em; }',
    '#lite p { margin:0 0 10px; color:#a6a6a6; }',
    '#lite .lt-one { color:#6fa8ff; }',
    '#lite .lt-why, #lite .lt-src { color:#808080; font-size:13.5px; }',
    '#lite .lt-lab { color:#808080; font:400 11px/1.2 "Geist Mono",ui-monospace,Menlo,Consolas,monospace; text-transform:uppercase; letter-spacing:.1em; margin:10px 0 2px; }',
    '#lite pre { font:12.5px/1.5 "Geist Mono",ui-monospace,Menlo,Consolas,monospace; white-space:pre-wrap; background:#050505; border:1px solid #1c1c1c; border-radius:4px; padding:8px 10px; margin:0 0 10px; color:#d4d4d4; }',
    '#lite .lt-chips { margin:2px 0 8px; }',
    '#lite .lt-chip { display:inline-block; font:12.5px/1.4 "Geist Mono",ui-monospace,Menlo,Consolas,monospace; background:transparent; border:1px solid #2c2c2c; border-radius:4px; color:#a6a6a6; padding:3px 8px; margin:0 6px 6px 0; }',
    '#lite button { font:inherit; font-size:14px; color:#eaeaea; background:#0a0a0a; border:1px solid #2c2c2c; border-radius:6px; min-height:40px; padding:0 14px; cursor:pointer; }',
    '#lite button:hover { background:#141414; border-color:#6b6b6b; }',
    '#lite button:focus { outline:2px solid #6fa8ff; outline-offset:2px; }',
    '#lite button[disabled] { opacity:.4; cursor:default; }',
    '#lite .lt-next { background:#193a29; border-color:#24523a; color:#dcebe1; font-weight:500; min-width:110px; }',
    '#lite .lt-next:hover { background:#215038; border-color:#24523a; color:#fff; }',
    '#lite .lt-lvl { margin:0 0 10px; }',
    '#lite .lt-lvl button { min-height:32px; font-size:13px; border-radius:0; margin-right:-1px; }',
    '#lite .lt-lvl button[aria-pressed="true"] { background:#1c1c1c; border-color:#6b6b6b; }',
    '#lite .lt-nav { margin:12px 0 0; }',
    '#lite .lt-nav button { margin-right:8px; }',
    '#lite .lt-step { display:inline-block; color:#808080; font-size:13.5px; margin-left:4px; }',
    '#lite .lt-keys { color:#808080; font-size:12.5px; margin:10px 0 0; }',
    '@media (max-width: 900px) { #lite .lt-pic, #lite .lt-side { float:none; width:auto; } #lite .lt-side { margin-top:12px; } #lite .lt-text { max-height:none; } }'
  ].join('\n');

  function start() {
    var st, note, link, b = document.body, ld = document.getElementById('k8load'), l = saved('k8level'), i;
    if (document.getElementById('lite')) return;
    if (ld) ld.style.display = 'none';
    for (i = 0; i < LEVELS.length; i++) if (LEVELS[i] === l) level = l;
    b.className = (b.className ? b.className + ' ' : '') + 'lite'; b.setAttribute('data-tier', 'min');
    st = document.createElement('style'); st.type = 'text/css';
    if (st.styleSheet) st.styleSheet.cssText = CSS; else st.appendChild(document.createTextNode(CSS));
    document.getElementsByTagName('head')[0].appendChild(st);

    note = '<b>Picture version.</b> ';
    if (BOOT.why) note += esc(BOOT.why) + ' You still get every step, its picture and its explanation; only the live, movable 3D view is missing.';
    else { link = location.href.replace(/([?&])lite=1&?/, '$1').replace(/[?&]$/, '');
      note += 'One prepared picture per step, with the same explanations. <a href="' + esc(link) + '">Open the live 3D view</a>'; }

    root = document.createElement('div'); root.id = 'lite';
    root.innerHTML = '<div class="lt-wrap"><p class="lt-note">' + note + '</p><div class="lt-main">'
      + '<div class="lt-pic" id="ltPic"></div>'
      + '<div class="lt-side"><div class="lt-lvl" id="ltLvl" role="group" aria-label="Explanation level"></div><div class="lt-text" id="ltText" tabindex="0"></div>'
      + '<div class="lt-nav"><button type="button" id="ltBack">Back</button><button type="button" id="ltNext" class="lt-next">Next</button><span class="lt-step" id="ltStep"></span></div>'
      + '<p class="lt-keys">Keys: → or N = next, ← or B = back, Home = whole model</p></div></div></div>';
    b.appendChild(root);
    picEl = document.getElementById('ltPic'); textEl = document.getElementById('ltText'); stepEl = document.getElementById('ltStep');
    backEl = document.getElementById('ltBack'); nextEl = document.getElementById('ltNext'); lvlEl = document.getElementById('ltLvl');
    backEl.onclick = back; nextEl.onclick = next;
    lvlEl.onclick = function (e) { var t = (e || window.event).target || (e || window.event).srcElement, v = t && t.getAttribute && t.getAttribute('data-l'); if (v) { level = v; save('k8level', v); show(at); } };
    document.addEventListener('keydown', function (e) {
      var k = e.keyCode, tag = e.target && e.target.tagName;
      if (e.altKey || e.ctrlKey || e.metaKey || b.getAttribute('data-side') === 'data') return;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (k === 39 || k === 78) { next(); e.preventDefault(); }
      else if (k === 37 || k === 66) { back(); e.preventDefault(); }
      else if (k === 36) { show(0); e.preventDefault(); }
      else if (k === 13 && tag !== 'BUTTON' && tag !== 'A') { next(); e.preventDefault(); }
    }, false);
    window.addEventListener('resize', function () { var img = picEl.firstChild, src = picSrc(keyAt(at)); if (img && img.tagName === 'IMG' && img.getAttribute('src') !== src && !/_sm/.test(src)) img.src = src; }, false);
    show(0);
    window.K8Lite = { show: show, at: function () { return at; }, steps: STEPS };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, false); else start();
})();
