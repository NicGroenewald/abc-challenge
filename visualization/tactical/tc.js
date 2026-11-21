(function () {
  'use strict';
  var sec = document.getElementById('s-model'); if (!sec) return;
  var fr = sec.querySelector('.tc-frame'), btn = document.getElementById('tcLaunch'), html = document.documentElement;
  var LABEL = btn.textContent, ready = false, wanted = false, near = true, pushed = false, skipPop = false;
  var live = !!(window.K8_BOOT && window.K8_BOOT.live3d);
  if (!live) { sec.classList.add('tc-nolive'); btn.addEventListener('click', function () { location.href = 'journey/journey.html'; }); return; }

  function tell(m) { fr.contentWindow.postMessage({ k8journey: m }, location.origin); }
  function phonePortrait() { return matchMedia('(max-width: 768px) and (orientation: portrait)').matches; }
  function load() { if (!fr.getAttribute('src')) fr.setAttribute('src', fr.getAttribute('data-src')); }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { for (var i = 0; i < es.length; i++) if (es[i].isIntersecting) { load(); io.disconnect(); return; } },
      { rootMargin: '150% 0px' });
    io.observe(sec);
    new IntersectionObserver(function (es) {
      near = es[es.length - 1].isIntersecting;
      if (ready && !html.classList.contains('tc-open')) tell(near ? 'play' : 'pause');
    }, { rootMargin: '50% 0px' }).observe(sec);
  } else load();

  function standalone() { location.href = 'journey/journey.html'; }
  function launch() {
    try {
      var sb = html.style.scrollBehavior; html.style.scrollBehavior = 'auto';
      window.scrollTo(0, Math.round(window.scrollY + sec.getBoundingClientRect().top));
      html.style.scrollBehavior = sb;
    } catch (e) {  }
    html.classList.add('tc-open');
    if (window.K8Story && window.K8Story.suspend) window.K8Story.suspend();
    fr.removeAttribute('aria-hidden'); fr.tabIndex = 0; fr.focus();
    if (!pushed) { history.pushState({ tcOpen: true }, ''); pushed = true; }
    tell('play'); tell('launch');
  }
  var sent = -1, queued = false;
  function sendFace() {
    queued = false; if (!ready || html.classList.contains('tc-open')) return;
    var r = sec.getBoundingClientRect(), bar = 64, H = window.innerHeight;
    var p = Math.max(0, Math.min(1, (H - r.top) / (H - bar)));
    if (Math.abs(p - sent) < .004) return; sent = p;
    fr.contentWindow.postMessage({ k8journey: 'face', p: p }, location.origin);
  }
  addEventListener('scroll', function () { if (!queued) { queued = true; requestAnimationFrame(sendFace); } }, { passive: true });
  addEventListener('resize', function () { sent = -1; sendFace(); });

  var others = document.querySelectorAll('[data-tc-launch]');
  for (var i = 0; i < others.length; i++) others[i].addEventListener('click', function (e) { e.preventDefault(); btn.click(); });
  btn.addEventListener('click', function () {
    load();
    if (ready) return launch();
    wanted = true; btn.textContent = 'Loading…'; btn.setAttribute('aria-busy', 'true');
    setTimeout(function () { if (wanted && !ready) standalone(); }, phonePortrait() ? 20000 : 8000);
  });
  addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data) return;
    var m = e.data.k8journey;
    if (m === 'ready') {
      ready = true; sec.classList.add('tc-live'); sent = -1; sendFace();
      if (!near && !wanted) tell('pause');
      if (wanted) { wanted = false; btn.textContent = LABEL; btn.removeAttribute('aria-busy'); launch(); }
    } else if (m === 'closed') {
      html.classList.remove('tc-open');
      fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
      if (window.K8Story && window.K8Story.resume) window.K8Story.resume();
      btn.focus({ preventScroll: true });
      if (pushed) { pushed = false; skipPop = true; history.back(); }
      if (!near) tell('pause');
    }
  });
  addEventListener('popstate', function () {
    if (skipPop) { skipPop = false; return; }
    if (!pushed) return;
    pushed = false;
    if (html.classList.contains('tc-open')) tell('close');
  });
})();
