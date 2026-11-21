(function (root) {
  const K = {};
  const DIL = [1, 8, 47], SIGNS = [1, -1, -1, 1, -1, 1, 1], H = 20, TAU = 10, NP = 400;
  const ELAPSED = Array.from({ length: H }, (_, i) => -TAU * Math.expm1(-(i + 1) / TAU) / 100);
  const FEAT = ['ωx', 'ωy', 'ωz', 'speed', 'gx', 'gy', 'gz'];
  Object.assign(K, { DIL, SIGNS, H, TAU, NP, ELAPSED, FEAT });

  const C0 = [18, 26, 39], PS = [255, 159, 46], PP = [255, 228, 190], NS = [47, 140, 255], NQ = [210, 230, 255];
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  K.ramp = t => { t = Math.max(-1, Math.min(1, t || 0)); const u = Math.sqrt(Math.abs(t)), s = t < 0 ? NS : PS, p = t < 0 ? NQ : PP;
    return (u < .8 ? mix(C0, s, u / .8) : mix(s, p, (u - .8) / .2)).map(v => v / 255); };
  K.ramp3 = (t, out) => { t = Math.max(-1, Math.min(1, t || 0)); const u = Math.sqrt(Math.abs(t)), s = t < 0 ? NS : PS, p = t < 0 ? NQ : PP;
    const a = u < .8 ? C0 : s, b = u < .8 ? s : p, w = u < .8 ? u / .8 : (u - .8) / .2;
    out[0] = (a[0] + (b[0] - a[0]) * w) / 255; out[1] = (a[1] + (b[1] - a[1]) * w) / 255; out[2] = (a[2] + (b[2] - a[2]) * w) / 255; return out; };
  K.hex = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
  K.divHex = (v, s) => v === null || v === undefined ? '#0c1018' : K.hex(K.ramp(v / (s || 1)));

  K.blockIn = (D, b, i) => { if (i < 0) return null; const f = D.frames[i]; return f ? (b === 0 ? f.proj : f.blk[b - 1]) : null; };
  K.depthwise = (D, b, i) => { const o = [new Array(32).fill(0), new Array(32).fill(0)], w = D.W.dw[b], d = DIL[b];
    for (let j = 0; j < 8; j++) { const x = K.blockIn(D, b, i - (7 - j) * d); if (!x) continue; for (let s = 0; s < 2; s++) for (let c = 0; c < 32; c++) o[s][c] += w[c][j] * x[s][c]; }
    return o; };
  K.pointwise = (D, b, h) => { const { A, B, bias } = D.W.pw[b], o = [new Array(32), new Array(32)];
    for (let r = 0; r < 32; r++) { let a = bias[r], m = bias[r]; for (let c = 0; c < 32; c++) { a += A[r][c] * h[0][c] + B[r][c] * h[1][c]; m += A[r][c] * h[1][c] + B[r][c] * h[0][c]; } o[0][r] = a; o[1][r] = m; }
    return o; };
  K.conjMul = (p, q) => { const [a, b, c, d] = [p[0], -p[1], -p[2], -p[3]], [w, x, y, z] = q;
    return [a * w - b * x - c * y - d * z, a * x + b * w + c * z - d * y, a * y - b * z + c * w + d * x, a * z + b * y - c * x + d * w]; };
  K.geo = (a, b) => { const na = Math.hypot(...a), nb = Math.hypot(...b), [p, q, r, t] = a.map(x => x / na), [w, x, y, z] = b.map(v => v / nb);
    const dw = p * w + q * x + r * y + t * z, dx = p * x - q * w - r * z + t * y, dy = p * y + q * z - r * w - t * x, dz = p * z - q * y + r * x - t * w;
    return 360 / Math.PI * Math.atan2(Math.hypot(dx, dy, dz), Math.abs(dw)); };
  K.fwd = q => { const [w, x, y, z] = q; return [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]; };
  K.featDetail = (D, i) => { const g = D.frames[i - 1], f = D.frames[i]; if (!g || !f) return null;
    const q0 = g.q, q1 = f.q, d = K.conjMul(q0, q1), om = [1, 2, 3].map(k => 200 * d[0] * d[k]), sp = Math.abs(om[0]) + Math.abs(om[1]) + Math.abs(om[2]);
    const [w, x, y, z] = q1, gv = [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)], mine = [...om, sp, ...gv];
    return { q0, q1, d, om, sp, g: gv, trace: f.feat, diff: f.feat ? Math.max(...mine.map((v, k) => Math.abs(v - f.feat[k]))) : null }; };
  K.projDetail = (D, i, s, o) => { const f = D.frames[i]; if (!f || !f.feat) return null;
    const terms = f.feat.map((v, k) => { const x = v * (s ? SIGNS[k] : 1), w = D.W.proj[o][k]; return { w, x, p: w * x }; });
    const bias = D.W.projB[o], pre = bias + terms.reduce((a, t) => a + t.p, 0);
    return { terms, bias, pre, post: Math.max(0, pre), check: f.proj ? f.proj[s][o] : null }; };
  K.channel = (D, b, c, s, i) => { const w = D.W.dw[b][c], d = DIL[b]; let sum = 0;
    const terms = w.map((wj, j) => { const x = K.blockIn(D, b, i - (7 - j) * d), v = x ? x[s][c] : null, p = v === null ? 0 : wj * v; sum += p; return { lag: (7 - j) * d, w: wj, x: v, p, run: sum }; });
    return { terms, sum, check: K.depthwise(D, b, i)[s][c] }; };
  K.headDetail = (D, i, p, a, bx) => { const f = D.frames[i]; if (!f || !f.blk[2]) return null; const r = 3 * p + a, Wr = D.W.head[r], sg = a > 0 ? -1 : 1;
    const h0 = Wr.map((w, c) => w * f.blk[2][0][c]), h1 = Wr.map((w, c) => sg * w * f.blk[2][1][c]), s0 = h0.reduce((x, y) => x + y, 0), s1 = h1.reduce((x, y) => x + y, 0);
    const bias = a === 0 && bx ? bx[p] : 0;
    return { r, sg, h0, h1, s0, s1, bias, sum: s0 + s1 + bias, check: f.coef ? f.coef[p][a] : null }; };
  K.COVER = (() => { const n = new Array(393).fill(0); for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) for (let c = 0; c < 8; c++) n[a + DIL[1] * b + DIL[2] * c]++;
    return { n, paths: 512, distinct: n.filter(v => v > 0).length, twice: n.filter(v => v === 2).length, gaps: n.filter(v => v === 0).length, max: Math.max(...n) }; })();

  const fmt = (v, n = 3) => v === null || v === undefined || !isFinite(v) ? '–' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(n);
  const f1 = (v, n = 1) => fmt(v, n);
  const pathOf = pts => { let s = '', pen = false;
    for (const p of pts) { if (!p || !isFinite(p[0]) || !isFinite(p[1])) { pen = false; continue; } s += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`; pen = true; } return s; };
  const T = (x, y, t, fill = '#808080', size = 10, anchor = 'start') => `<text x="${x}" y="${y}" fill="${fill}" font-size="${Math.max(10, size)}" text-anchor="${anchor}">${t}</text>`;
  const timeAxis = (X, y) => [[399, '−4 s', 'start'], [300, '−3 s', 'middle'], [200, '−2 s', 'middle'], [100, '−1 s', 'middle'], [0, 'now', 'end']].map(([lag, t, a]) => T(X(lag), y, t, lag ? '#808080' : '#eaeaea', 10, a)).join('');
  const clip = (v, m) => Math.max(-m, Math.min(m, v));
  const tabs = (name, list, cur) => `<div class="tabs" role="tablist">${list.map(([k, t]) => `<button class="tab${k === cur ? ' on' : ''}" role="tab" aria-selected="${k === cur}" data-act="${name}:${k}">${t}</button>`).join('')}</div>`;
  const hoverRect = (kind, n, x, y, w, h, rev = 0, off = 0) => `<rect data-hx="${kind}" data-n="${n}" data-rev="${rev}" data-off="${off}" x="${x}" y="${y}" width="${w}" height="${h}" fill="transparent" style="cursor:crosshair"/>`;
  const gridRect = (name, rows, cols, x, y, w, h) => `<rect data-grid="${name}" data-rows="${rows}" data-cols="${cols}" x="${x}" y="${y}" width="${w}" height="${h}" fill="transparent" style="cursor:pointer"/>`;
  const heat = (M, x0, y0, cw, ch, sc) => { let s = ''; M.forEach((row, r) => row.forEach((v, c) => { s += `<rect x="${(x0 + c * cw).toFixed(2)}" y="${(y0 + r * ch).toFixed(2)}" width="${(cw - .4).toFixed(2)}" height="${(ch - .4).toFixed(2)}" fill="${K.divHex(v, sc)}"/>`; })); return s; };
  const CACHE = new Map();
  const cached = (D, key, fn) => { const c = CACHE.get(key); if (c && c.D === D) return c.v; const v = fn(); CACHE.set(key, { D, v }); return v; };
  const maxAbs = a => Math.max(1e-9, ...a.map(Math.abs));
  const QC = ['#e6ebf2', '#ff7a8a', '#5fd38d', '#7fb2ff'];
  const legendRamp = (sc, unit = '') => `<span class="ramp"><i style="background:${K.divHex(-sc, sc)}"></i><i style="background:${K.divHex(-sc * .2, sc)}"></i><i style="background:${K.divHex(0, sc)}"></i><i style="background:${K.divHex(sc * .2, sc)}"></i><i style="background:${K.divHex(sc, sc)}"></i></span> −${fmt(sc, 2)} … +${fmt(sc, 2)}${unit}`;
  K.fmt = fmt;

  const R = {};
  R.input = c => {
    const { D, idx, U } = c, w = 278, L = 18, Rv = 98, rh = 26, pw = w - L - Rv, fr = lag => D.frames[idx - lag];
    if (!fr(0)) return '';
    const sel = U.hov !== null && U.hov !== undefined && U.hov > 0 && fr(U.hov) ? U.hov : 0, q = fr(sel).q, X = lag => L + (NP - 1 - lag) / (NP - 1) * pw;
    let g = '';
    ['w', 'x', 'y', 'z'].forEach((nm, r) => {
      let lo = Infinity, hi = -Infinity; for (let lag = 0; lag < NP; lag++) { const h = fr(lag); if (h) { lo = Math.min(lo, h.q[r]); hi = Math.max(hi, h.q[r]); } }
      const pad = Math.max(.005, (hi - lo) * .1), a = lo - pad, z = hi + pad, y0 = r * rh, Y = v => y0 + 2 + (z - v) / (z - a) * (rh - 5);
      g += `<rect x="${L}" y="${y0}" width="${pw}" height="${rh - 1}" rx="3" fill="${r % 2 ? '#0f0f0f' : '#151515'}"/>` + T(3, y0 + 14, nm, QC[r], 10.5);
      g += `<path d="${pathOf(Array.from({ length: NP }, (_, k) => { const lag = NP - 1 - k, h = fr(lag); return h ? [X(lag), Y(h.q[r])] : null; }))}" fill="none" stroke="${QC[r]}" stroke-width="1.3"/>`;
      if (sel) g += `<circle cx="${X(sel)}" cy="${Y(q[r])}" r="2.6" fill="${QC[r]}"/>`;
      g += T(w, y0 + 10, `${fmt(lo, 3)} … ${fmt(hi, 3)}`, '#808080', 10, 'end') + T(w, y0 + 22, fmt(q[r], 4), sel ? '#ffd166' : '#eaeaea', 11, 'end'); });
    const h = 4 * rh;
    g += `<line x1="${X(0)}" x2="${X(0)}" y1="0" y2="${h}" stroke="#e6ebf2" stroke-dasharray="2 2"/>` + timeAxis(X, h + 11);
    if (sel) g += `<line x1="${X(sel)}" x2="${X(sel)}" y1="0" y2="${h}" stroke="#ffd166" stroke-width="1.5"/>`;
    g += hoverRect('input', NP, L, 0, pw, h, 1);
    const sg = q[0] < 0 ? -1 : 1, n = Math.hypot(q[1], q[2], q[3]), th = 2 * Math.atan2(n, sg * q[0]) * 180 / Math.PI, ax = n > 1e-9 ? [1, 2, 3].map(i => sg * q[i] / n) : [0, 0, 0];
    return `<h3>Input: the pose, last 4 s</h3><svg width="${w}" height="${h + 13}" role="img" aria-label="w x y z of the pose over the last 400 samples">${g}</svg>
      <div class="m">${sel ? `<span style="color:#ffd166">t−${sel}</span> (${sel * 10} ms ago): the 3D headset shows this pose · ` : 'now · '}θ = <b>${th.toFixed(1)}°</b> about n = (<b>${ax.map(v => fmt(v, 2)).join(', ')}</b>)${sg < 0 ? ', read from −q (same pose)' : ''}</div>
      <div class="m" title="unit quaternion: w = cos(θ/2), (x, y, z) = sin(θ/2)·n">hover to go back in time · each row is zoomed to its own range (right: min … max, then the value)</div>`;
  };

  R.feat = c => {
    const { D, idx, U, S } = c, w = 278, L = 38, Rv = 46, rh = 18, pw = w - L - Rv, fr = lag => D.frames[idx - lag], f = fr(0);
    if (!f || !f.feat) return '';
    const sc = r => r < 3 ? S.feat : r === 3 ? S.speed : 1;
    let g = '';
    FEAT.forEach((nm, r) => { const y0 = r * rh, picked = U.fpick === r, s = sc(r), Y = v => r === 3 ? y0 + rh - 3 - Math.min(1, v / s) * (rh - 5) : y0 + rh / 2 - clip(v / s, 1) * (rh / 2 - 2);
      g += `<g data-act="frow:${r}" style="cursor:pointer"><rect x="0" y="${y0}" width="${w}" height="${rh - 1}" rx="3" fill="${picked ? '#1c1c1c' : r % 2 ? '#0f0f0f' : '#151515'}"${picked ? ' stroke="#ffd166"' : ''}/>`;
      g += T(3, y0 + 12, (SIGNS[r] < 0 ? `${nm}<tspan fill="#ffcf6e">*</tspan>` : nm), picked ? '#fff' : '#a6a6a6', 10);
      if (r !== 3) g += `<line x1="${L}" x2="${L + pw}" y1="${y0 + rh / 2}" y2="${y0 + rh / 2}" stroke="#2c2c2c"/>`;
      g += `<path d="${pathOf(Array.from({ length: NP }, (_, k) => { const lag = NP - 1 - k, q = fr(lag); return q && q.feat ? [L + k / (NP - 1) * pw, Y(q.feat[r])] : null; }))}" fill="none" stroke="${picked ? '#ffd166' : r < 3 ? '#6fa8ff' : r === 3 ? '#e58bb0' : '#5fd38d'}" stroke-width="${picked ? 1.6 : 1.1}"/>`;
      g += T(w - 3, y0 + 12, fmt(f.feat[r], 2), '#eaeaea', 10, 'end') + '</g>'; });
    g += `<line x1="${L + pw}" x2="${L + pw}" y1="0" y2="${7 * rh}" stroke="#e6ebf2" stroke-dasharray="2 2"/>`;
    const H7 = 7 * rh + 13; g += timeAxis(lag => L + (NP - 1 - lag) / (NP - 1) * pw, H7 - 2);
    let pick = '';
    if (U.fpick !== null && U.fpick !== undefined) { const r = U.fpick, v = f.feat[r], fl = SIGNS[r] < 0;
      pick = `<div class="m pk">row <b>${FEAT[r]}</b> · h⁰ = <b>${fmt(v)}</b> · h¹ = ${fl ? '−' : ''}${FEAT[r]} = <b>${fmt(v * SIGNS[r])}</b> ${fl ? '<span style="color:#ffcf6e">(mirror flips it)</span>' : '(same in both)'}</div>`; }
    let ex = `<button class="lnk" data-act="fexp">${U.fexp ? '▾' : '▸'} how is this computed? (newest pair)</button>`;
    const d = U.fexp ? K.featDetail(D, idx) : null;
    if (d) { const v4 = a => `(${a.map(v => fmt(v, 4)).join(', ')})`;
      ex += `<table class="calc"><tr><td>q[t−1]</td><td>${v4(d.q0)}</td></tr><tr><td>q[t]</td><td>${v4(d.q1)}</td></tr>
        <tr><td>d = q̄[t−1]·q[t]</td><td>${v4(d.d)}</td></tr>
        <tr><td>ω = 200·d_w·(d_x,d_y,d_z)</td><td>${v4(d.om)} ≈ rad/s</td></tr>
        <tr><td>speed = |ωx|+|ωy|+|ωz|</td><td>${fmt(d.sp, 4)} ≈ rad/s (L1)</td></tr>
        <tr><td>g from q[t] only</td><td>${v4(d.g)}</td></tr>
        <tr><td>trace (ONNX)</td><td>${d.trace ? `(${d.trace.map(v => fmt(v, 3)).join(', ')})` : '–'}</td></tr></table>
        <div class="m">g = (2(xy+wz), w²−x²+y²−z², 2(yz−wx)): world up (+y) seen from the head · 200·d_w·d_v = 100·sin θ·n at 100 Hz · |Δ| vs ONNX ${d.diff === null ? '–' : d.diff.toExponential(1)} (this proposal's traces store poses at 7 decimals, so this is float32 rounding)</div>`; }
    return `<h3>Features, last 4 s</h3><svg width="${w}" height="${H7}" role="img" aria-label="the seven features over the last 400 samples">${g}</svg>
      <div class="m" title="ω rows share one scale, speed has its own (both clipped at the 98th pct); g fixed ±1">click a row for its value · <span style="color:#ffcf6e">*</span> flipped in h¹ · ω and speed ≈ rad/s, g has no unit</div>${pick}${ex}`;
  };

  R.proj = c => {
    const { D, idx, U } = c, w = 278, L = 36, cw = (w - L) / 32, ch = 11, f = D.frames[idx];
    const M = FEAT.map((_, k) => D.W.proj.map(row => row[k])), sc = maxAbs([...D.W.proj.flat(), ...D.W.projB]);
    let g = cached(D, 'projheat', () => heat(M, L, 0, cw, ch, sc) + heat([D.W.projB], L, 7 * ch + 3, cw, ch, sc) +
      FEAT.map((n, k) => T(L - 3, k * ch + 9, n, '#a6a6a6', 10, 'end')).join('') + T(L - 3, 7 * ch + 12, 'bias', '#a6a6a6', 10, 'end'));
    const pk = U.ppick;
    if (pk) g += `<rect x="${L + pk.o * cw - .8}" y="-.5" width="${cw + .8}" height="${8 * ch + 4}" fill="none" stroke="#ffd166" stroke-width="1.6"/>`;
    g += T(L, 8 * ch + 14, 'ch 1', '#808080', 8.5) + T(w, 8 * ch + 14, 'ch 32', '#808080', 8.5, 'end') + gridRect('pch', 1, 32, L, 0, w - L, 8 * ch + 3);
    let body = `<div class="m">click a channel column · ${legendRamp(sc)}</div>`;
    if (pk) { const d = K.projDetail(D, idx, pk.s, pk.o);
      if (d) { const m = maxAbs([...d.terms.map(t => t.p), d.bias, d.pre]), bar = v => `<svg width="56" height="8"><line x1="28" x2="28" y1="0" y2="8" stroke="#2c2c2c"/><rect x="${v < 0 ? 28 - Math.abs(v) / m * 27 : 28}" y="1" width="${Math.abs(v) / m * 27}" height="6" fill="${v < 0 ? '#2f8cff' : '#ff9f2e'}"/></svg>`;
        body = `${tabs('pstream', [['0', 'stream h⁰'], ['1', 'stream h¹']], String(pk.s))}<table class="calc"><tr><td>channel ${pk.o + 1}</td><td>w</td><td>× x</td><td>= w·x</td><td></td></tr>
          ${d.terms.map((t, k) => `<tr><td>${pk.s && SIGNS[k] < 0 ? '−' : ''}${FEAT[k]}</td><td>${fmt(t.w)}</td><td>${fmt(t.x)}</td><td>${fmt(t.p)}</td><td>${bar(t.p)}</td></tr>`).join('')}
          <tr><td>bias</td><td></td><td></td><td>${fmt(d.bias)}</td><td>${bar(d.bias)}</td></tr>
          <tr class="sum"><td>pre-ReLU Σ</td><td></td><td></td><td>${fmt(d.pre)}</td><td>${bar(d.pre)}</td></tr>
          <tr class="sum"><td>ReLU</td><td></td><td></td><td><b>${fmt(d.post)}</b></td><td>${d.pre < 0 ? 'clipped to 0' : 'passes'}</td></tr></table>
          <div class="m">trace value h${pk.s ? '¹' : '⁰'}[${pk.o + 1}] = <b>${fmt(d.check)}</b> · same W for both streams; h¹ uses the mirrored features</div>`; } }
    return `<h3>Projection: one 7→32 weight matrix</h3><svg width="${w}" height="${8 * ch + 18}" role="img" aria-label="projection weights, 7 features by 32 channels, plus bias">${g}</svg>${body}`;
  };

  R.mirror = c => {
    const { D, idx, U } = c, f = D.frames[idx]; if (!f || !f.feat) return '';
    const top = U.swapped ? f.feat.map((v, k) => v * SIGNS[k]) : f.feat, bot = U.swapped ? f.feat : f.feat.map((v, k) => v * SIGNS[k]);
    const rows = FEAT.map((n, k) => `<tr${SIGNS[k] < 0 ? ' class="flip"' : ''}><td>${n}</td><td>${fmt(top[k])}</td><td>${SIGNS[k] < 0 ? '× −1' : '× +1'}</td><td>${fmt(bot[k])}</td></tr>`).join('');
    return `<h3>The two streams, this call</h3><table class="calc"><tr><td>feature</td><td>${U.swapped ? 'top (now)' : 'h⁰ (top)'}</td><td>S</td><td>${U.swapped ? 'bottom (now)' : 'h¹ (bottom)'}</td></tr>${rows}</table>
      <div class="m">h¹ = S·h⁰, S flips <span style="color:#ffcf6e">ωy, ωz, gx</span> · ωx, speed, gy and gz are unchanged</div>
      <div class="m">${U.swapped ? 'mirrored motion: its features are S·(old features), so the top sheet now holds the old h¹ and the bottom the old h⁰' : 'press “Mirror the motion ⇄” in the card: the two columns trade places'}</div>`;
  };

  R.block = c => {
    const { D, idx, U, S, b, now, reduce } = c, w = 278, d = DIL[b], P = U.pick && U.pick.b === b ? U.pick : null, tab = U.btab || 'dw';
    const head = `<h3>Block ${b + 1} · 8 taps, ${d} apart</h3>` + tabs('btab', [['ch', 'Σ channel'], ['dw', 'depthwise'], ['pw', 'pointwise A|B'], ['mem', 'memory']], tab);
    const who = P ? `channel ${P.c + 1} · h${P.s ? '¹' : '⁰'}` : 'no channel picked';
    if (tab === 'ch') {
      if (!P) return head + `<div class="m">click a cell in the depthwise tab (or the 8-tap node in 3D) to follow one channel</div>`;
      const r = K.channel(D, b, P.c, P.s, idx), nShow = reduce ? 8 : Math.max(1, Math.min(8, Math.floor((now - P.t0) / 200) + 1)), wm = maxAbs(r.terms.map(t => t.w));
      const rows = r.terms.map((t, j) => `<tr class="${j < nShow ? '' : 'off'}${P.tap === j ? ' hl' : ''}"><td>t−${t.lag}</td><td><svg width="44" height="8"><rect x="${t.w < 0 ? 22 - Math.abs(t.w) / wm * 22 : 22}" y="0" width="${Math.abs(t.w) / wm * 22}" height="8" fill="${t.w < 0 ? '#2f8cff' : '#ff9f2e'}"/></svg></td><td>${fmt(t.w)}</td><td>${fmt(t.x)}</td><td>${fmt(t.p)}</td><td>${fmt(t.run)}</td></tr>`).join('');
      const dead = r.terms.every(t => t.x === 0) ? `<div class="m pk">this channel is zero right now (ReLU), so every product is 0: try another channel (e.g. a bright cell in the depthwise tab)</div>` : '';
      return head + `<div class="m">${who}</div>${dead}<table class="calc"><tr><td>tap</td><td>weight</td><td></td><td>input</td><td>w·x</td><td>Σ</td></tr>${rows}</table>
        <div class="m" style="margin-top:4px">Σ = <b>${nShow === 8 ? fmt(r.sum) : '…'}</b> = this channel's depthwise output (the glowing node cell). The block output for channel c then mixes <b>all 64</b> depthwise values (32 via A from its own stream, 32 via B from the twin), adds the skip, then ReLU.</div>
        <div class="m">the same 8 weights filter this channel in both streams · 32 × 8 = 256 depthwise + 2,048 + 32 pointwise = 2,336 per block</div>`;
    }
    if (tab === 'dw') {
      const L = 36, cw = (w - L) / 32, ch = 11, Wd = D.W.dw[b], sc = maxAbs(Wd.flat()), M = Array.from({ length: 8 }, (_, j) => Wd.map(row => row[j]));
      let g = cached(D, 'dw' + b, () => heat(M, L, 0, cw, ch, sc) + M.map((_, j) => T(L - 3, j * ch + 9, `t−${(7 - j) * d}`, '#a6a6a6', 10, 'end')).join(''));
      if (P) { g += `<rect x="${L + P.c * cw - .8}" y="-.5" width="${cw + .8}" height="${8 * ch + 1}" fill="none" stroke="#ffd166" stroke-width="1.6"/>`;
        if (P.tap !== undefined && P.tap !== null) g += `<rect x="${L + P.c * cw - 1.5}" y="${P.tap * ch - 1}" width="${cw + 2.2}" height="${ch + 1.6}" fill="none" stroke="#fff" stroke-width="1.6"/>`; }
      g += T(L, 8 * ch + 10, 'ch 1', '#808080', 8.5) + T(w, 8 * ch + 10, 'ch 32', '#808080', 8.5, 'end') + gridRect('dw', 8, 32, L, 0, w - L, 8 * ch);
      let info = '';
      if (P && P.tap !== undefined && P.tap !== null) { const t = K.channel(D, b, P.c, P.s, idx).terms[P.tap];
        info = `<div class="m pk">${who}, tap t−${t.lag}: w = <b>${fmt(t.w)}</b> × input <b>${fmt(t.x)}</b> = <b>${fmt(t.p)}</b></div>`; }
      return head + `<svg width="${w}" height="${8 * ch + 13}" role="img" aria-label="depthwise weights, 8 taps by 32 channels">${g}</svg>
        <div class="m">rows = taps (oldest at top), columns = channels · click a cell · ${legendRamp(sc)}</div>${info}`;
    }
    if (tab === 'pw') {
      const { A, B } = D.W.pw[b], sc = maxAbs([...A.flat(), ...B.flat()]), cs = 4, gap = 14, x1 = 6, x2 = x1 + 32 * cs + gap;
      let g = cached(D, 'pw' + b, () => heat(A, x1, 12, cs, cs, sc) + heat(B, x2, 12, cs, cs, sc) + T(x1, 9, 'A: to its own stream', '#a6a6a6', 9) + T(x2, 9, 'B: to the twin stream', '#a6a6a6', 9));
      if (P) for (const x0 of [x1, x2]) g += `<rect x="${x0 + P.c * cs - .6}" y="11.4" width="${cs + .6}" height="${32 * cs + 1}" fill="none" stroke="#ffd166" stroke-width="1.1"/><rect x="${x0 - .6}" y="${12 + P.c * cs - .6}" width="${32 * cs + 1}" height="${cs + .6}" fill="none" stroke="#ffd166" stroke-width=".8" stroke-dasharray="2 1"/>`;
      g += gridRect('pwA', 32, 32, x1, 12, 32 * cs, 32 * cs) + gridRect('pwB', 32, 32, x2, 12, 32 * cs, 32 * cs);
      let info = '';
      if (P) { const top = (Mx) => Mx.map((row, o) => [o, row[P.c]]).sort((p, q) => Math.abs(q[1]) - Math.abs(p[1])).slice(0, 3).map(([o, v]) => `${o + 1} (${fmt(v, 2)})`).join(', ');
        info = `<div class="m pk">channel ${P.c + 1}'s depthwise value feeds every output: largest |A| into outputs ${top(A)}; largest |B| ${top(B)}</div>`; }
      return head + `<svg width="${w}" height="${32 * cs + 16}" role="img" aria-label="pointwise matrices A and B, 32 outputs by 32 inputs">${g}</svg>
        <div class="m">row = output channel, column = input (depthwise) channel · solid column = the picked channel, dashed row = what output ${P ? P.c + 1 : 'c'} reads · ${legendRamp(sc)}</div>
        <div class="m">mix: out⁰ = A·h⁰ + B·h¹ + bias, out¹ = A·h¹ + B·h⁰ + bias · click a cell to pick its input column</div>${info}`;
    }
    const pc = P || { s: 0, c: 0 }, n = 7 * d + 1, L = 4, pw = w - 8, cw = pw / n, scale = b === 0 ? S.proj : S.blk[b - 1];
    const vals = Array.from({ length: n }, (_, k) => { const lag = n - 1 - k, x = K.blockIn(D, b, idx - lag); return x ? x[pc.s][pc.c] : null; });
    let g = vals.map((v, k) => `<rect x="${(L + k * cw).toFixed(2)}" y="4" width="${(cw + (n > 60 ? .05 : -.6)).toFixed(2)}" height="22" fill="${K.divHex(v, scale)}"/>`).join('');
    for (let j = 0; j < 8; j++) { const k = n - 1 - (7 - j) * d; g += `<line x1="${(L + (k + .5) * cw).toFixed(2)}" x2="${(L + (k + .5) * cw).toFixed(2)}" y1="27" y2="33" stroke="#cfc4ff" stroke-width="1.4"/>`; }
    g += `<rect x="${(L + (n - 1) * cw - .6).toFixed(2)}" y="2.5" width="${(cw + 1.2).toFixed(2)}" height="25" fill="none" stroke="#fff" stroke-width="1.3"/>`;
    g += `<rect x="${L - .5}" y="3" width="${((n - 1) * cw + 1).toFixed(2)}" height="24" fill="none" stroke="#b7a8ff" stroke-width="1"/>`;
    g += T(L, 44, `t−${n - 1}`, '#808080', 9) + T(w - 4, 44, 'now', '#eaeaea', 9, 'end');
    const nn = vals.filter(v => v === null).length, live = vals.filter(v => v !== null);
    return head + `<div class="m">${who}${P ? '' : ' (showing channel 1 · h⁰; pick one in 3D or in the depthwise tab)'}</div><svg width="${w}" height="48" role="img" aria-label="memory timeline for one channel">${g}</svg>
      <div class="m"><span style="color:#b7a8ff">violet box</span>: the ${7 * d} cached inputs t−${7 * d} … t−1 (state_in_${b}) · <span style="color:#fff">white</span>: now, computed this call · <span style="color:#ffc2e6">ticks</span>: the 8 taps read</div>
      <div class="m">range ${fmt(Math.min(...live))} … ${fmt(Math.max(...live))} · colour scale ±${fmt(scale, 2)} (98th pct)${nn ? ` · ${nn} near-black = before the first recorded call` : ''}</div>`;
  };

  R.head = c => {
    const { D, idx, U, bx } = c, w = 278, f = D.frames[idx], tab = U.htab || 'w';
    const head = `<h3>Readout: 2 × 32 → 9 coefficients</h3>` + tabs('htab', [['w', 'W_head'], ['basis', 'basis curve']], tab);
    if (!f || !f.coef) return '';
    if (tab === 'basis') return head + R.basis(c);
    const L = 36, cw = (w - L) / 32, ch = 11, sc = maxAbs(D.W.head.flat()), PW = ['κ', 'κ²', 'κ³'];
    let g = cached(D, 'head', () => heat(D.W.head, L, 0, cw, ch, sc) + D.W.head.map((_, r) => T(L - 3, r * ch + 9, `${'xyz'[r % 3]}·${PW[Math.floor(r / 3)]}`, '#a6a6a6', 10, 'end')).join(''));
    const hp = U.hpick;
    if (hp) g += `<rect x="${L - 1}" y="${(3 * hp.p + hp.a) * ch - 1}" width="${w - L + 1.5}" height="${ch + 1.6}" fill="none" stroke="#ffd166" stroke-width="1.6"/>`;
    g += T(L, 9 * ch + 10, 'ch 1', '#808080', 8.5) + T(w, 9 * ch + 10, 'ch 32', '#808080', 8.5, 'end') + gridRect('hw', 9, 1, 0, 0, w, 9 * ch);
    let body = `<div class="m">rows = the 9 coefficients (axis · power), columns = Block 3 channels · click a row · ${legendRamp(sc)}</div>`;
    if (hp) { const d = K.headDetail(D, idx, hp.p, hp.a, bx);
      if (d) { const m = maxAbs([...d.h0, ...d.h1]), strip = (vals, y) => { let s = `<line x1="${L}" x2="${w}" y1="${y + 14}" y2="${y + 14}" stroke="#2c2c2c"/>`;
          vals.forEach((v, k) => { const hh = Math.abs(v) / m * 13; s += `<rect x="${(L + k * cw + .4).toFixed(2)}" y="${(v < 0 ? y + 14 : y + 14 - hh).toFixed(2)}" width="${(cw - .8).toFixed(2)}" height="${hh.toFixed(2)}" fill="${v < 0 ? '#2f8cff' : '#ff9f2e'}"/>`; }); return s; };
        const sv = strip(d.h0, 0) + T(L - 3, 17, 'h⁰', '#a6a6a6', 9.5, 'end') + strip(d.h1, 32) + T(L - 3, 49, d.sg < 0 ? '−h¹' : 'h¹', d.sg < 0 ? '#ffcf6e' : '#a6a6a6', 9.5, 'end');
        body = `<svg width="${w}" height="62" role="img" aria-label="64 contributions to the picked coefficient">${sv}</svg>
          <table class="calc"><tr><td>Σ W·h⁰ (32 terms)</td><td>${fmt(d.s0, 4)}</td></tr><tr><td>${d.sg < 0 ? '+ S: −Σ W·h¹ (y, z flip)' : '+ Σ W·h¹ (x: no flip)'}</td><td>${fmt(d.s1, 4)}</td></tr>
          <tr><td>+ b_x ${hp.a === 0 ? `(x only, ${PW[hp.p]})` : '(0 on y, z)'}</td><td>${fmt(d.bias, 4)}</td></tr><tr class="sum"><td>= c ${'xyz'[hp.a]}·${PW[hp.p]}</td><td><b>${fmt(d.sum, 4)}</b></td></tr>
          <tr><td>trace value</td><td>${fmt(d.check, 4)}</td></tr></table>
          <div class="m">bar = W[row][ch] × channel value this call (ReLU zeros give no bar) · scale ±${fmt(m, 3)}</div>`; } }
    return head + `<svg width="${w}" height="${9 * ch + 13}" role="img" aria-label="readout weights, 9 coefficients by 32 channels">${g}</svg>${body}`;
  };
  R.basis = c => {
    const { f } = { f: c.D.frames[c.idx] }, KS = Array.from({ length: H }, (_, k) => k + 1);
    const w = 278, h = 52, X = k => 18 + (k / H) * (w - 24), Yb = v => h - 4 - v * (h - 10), cols = ['#8fe3ff', '#c9a6ff', '#ff9ad5'];
    let top = `<line x1="18" y1="${Yb(0)}" x2="${w - 6}" y2="${Yb(0)}" stroke="#2c2c2c"/>`;
    [1, 2, 3].forEach((pw, i) => { top += `<path d="${pathOf([[X(0), Yb(0)], ...KS.map(k => [X(k), Yb((k / H) ** pw)])])}" fill="none" stroke="${cols[i]}" stroke-width="1.5"/>` + T(X(H) - 2, Yb(1) + 10 + i * 11, ['κ', 'κ²', 'κ³'][i], cols[i], 10, 'end'); });
    top += T(0, Yb(1) + 4, '1', '#808080', 9) + T(0, Yb(0) + 3, '0', '#808080', 9);
    const sums = [0, 1, 2].map(a => KS.map(k => { const kp = k / H; return f.coef[0][a] * kp + f.coef[1][a] * kp ** 2 + f.coef[2][a] * kp ** 3; }));
    const cm = maxAbs(f.coef.flat()), sm = maxAbs(sums.flat());
    let rows = '';
    [0, 1, 2].forEach(a => { const y = 2 + a * 22; rows += T(0, y + 12, 'xyz'[a], '#a6a6a6', 11);
      [0, 1, 2].forEach(p => { const x0 = 14 + p * 46, v = f.coef[p][a] / cm; rows += `<line x1="${x0}" y1="${y + 8}" x2="${x0 + 40}" y2="${y + 8}" stroke="#2c2c2c" stroke-width="2"/><circle cx="${x0 + 20 + v * 19}" cy="${y + 8}" r="3.6" fill="${cols[p]}"/>`; });
      const sx = k => 160 + k / H * 80, sy = v => y + 8 - v / sm * 8;
      rows += `<line x1="160" y1="${y + 8}" x2="240" y2="${y + 8}" stroke="#2c2c2c"/><path d="${pathOf([[sx(0), sy(0)], ...KS.map((k, i) => [sx(k), sy(sums[a][i])])])}" fill="none" stroke="#f0b24a" stroke-width="1.5"/>` + T(278, y + 12, fmt(sums[a][H - 1]), '#eaeaea', 10, 'end'); });
    return `<svg width="${w}" height="${h}" role="img" aria-label="basis curves">${top}</svg>
      <div class="m">residual = c1·κ + c2·κ² + c3·κ³, κ = k/20, k = 1…20 · no constant, so it is 0 at now</div>
      <svg width="${w}" height="68" role="img" aria-label="live coefficients and residual per axis">${rows}</svg>
      <div class="m">dials: c1 c2 c3 this call (±${fmt(cm)}) · curve: their sum (±${fmt(sm)}), value at 200 ms on the right · x row includes the x-bias b_x</div>`;
  };

  R.traj = c => {
    const { D, idx, U } = c, f = D.frames[idx]; if (!f || !f.r) return '';
    const KS = Array.from({ length: H }, (_, k) => k + 1), k0 = U.hov >= 1 && U.hov <= H ? U.hov : H, hv = k0 !== H || U.hov === H;
    const pr = [0, 1, 2].map(a => KS.map((_, i) => ELAPSED[i] * f.feat[a])), rr = [0, 1, 2].map(a => KS.map((_, i) => f.r[i][a])), res = pr.map((row, a) => row.map((v, i) => rr[a][i] - v));
    const m = maxAbs([...pr, ...rr, ...res].flat()), cw = 88, ch = 58;
    let g = '';
    [0, 1, 2].forEach(a => { const ox = a * (cw + 7), X = k => ox + 4 + (k - .5) / H * (cw - 8), Y = v => 12 + ch / 2 - v / m * (ch / 2 - 3), P = row => pathOf(KS.map((k, i) => [X(k), Y(row[i])]));
      g += `<rect x="${ox}" y="10" width="${cw}" height="${ch + 2}" fill="#0f0f0f" rx="3"/><line x1="${ox + 4}" y1="${Y(0)}" x2="${ox + cw - 4}" y2="${Y(0)}" stroke="#2c2c2c"/>` + T(ox + 2, 8, 'xyz'[a], '#a6a6a6', 10);
      g += `<line x1="${X(k0)}" x2="${X(k0)}" y1="11" y2="${ch + 11}" stroke="#ffd166" stroke-width="${hv ? 1.4 : .8}"${hv ? '' : ' stroke-dasharray="2 2"'}/>`;
      g += `<path d="${P(pr[a])}" fill="none" stroke="#e58bb0" stroke-width="1.4" stroke-dasharray="3 2"/><path d="${P(res[a])}" fill="none" stroke="#f0b24a" stroke-width="1.4"/><path d="${P(rr[a])}" fill="none" stroke="#6fa8ff" stroke-width="1.8"/>`;
      g += T(ox + 2, ch + 24, '10', '#808080', 10) + T(ox + cw - 2, ch + 24, '200 ms', '#eaeaea', 10, 'end');
      g += hoverRect('traj', H, ox + 4, 10, cw - 8, ch + 2, 0, 1); });
    const i = k0 - 1, row = a => `<tr><td>${'xyz'[a]}</td><td>${fmt(pr[a][i])}</td><td>+</td><td>${fmt(res[a][i])}</td><td>=</td><td>${fmt(rr[a][i])}</td></tr>`;
    return `<h3>r = prior + learned residual</h3><svg width="278" height="${ch + 28}" role="img" aria-label="prior, residual and r per axis over 200 ms">${g}</svg>
      <div class="m"><span style="color:#e58bb0">- - prior</span> · <span style="color:#f0b24a">— residual</span> · <span style="color:#6fa8ff">— r</span> · 10 → 200 ms · ±${fmt(m)} (≈ rad) · hover a step</div>
      <table class="calc" style="margin-top:3px"><tr><td>step ${k0} (${k0 * 10} ms)</td><td>prior</td><td></td><td>residual</td><td></td><td>r</td></tr>${row(0)}${row(1)}${row(2)}</table>
      <div class="m" style="margin-top:3px">prior = ω × ${(ELAPSED[i] * 1000).toFixed(1)} ms at this step (the current rate, slowing with τ = 100 ms; 0 params)</div>`;
  };

  R.out = c => {
    const { D, idx, U } = c, f = D.frames[idx]; if (!f || !f.pred || !f.truth) return '';
    const KS = Array.from({ length: H }, (_, k) => k + 1), k0 = U.hov >= 1 && U.hov <= H ? U.hov : H, hv = k0 !== H || U.hov === H;
    const pa = f.pred.map(q => K.geo(f.q, q)), ta = f.truth.map(q => K.geo(f.q, q)), er = f.pred.map((q, t) => K.geo(q, f.truth[t]));
    const w = 278, L = 30, h1 = 78, h2 = 30, top = 4, mA = Math.max(1, ...pa, ...ta), mE = Math.max(.5, ...er), X = k => L + (k - .5) / H * (w - L - 4);
    const Y = v => top + h1 - v / mA * (h1 - 4), Ye = v => top + h1 + 10 + h2 - v / mE * (h2 - 2);
    let g = `<rect x="${L}" y="${top}" width="${w - L - 4}" height="${h1}" fill="#0f0f0f" rx="3"/><rect x="${L}" y="${top + h1 + 10}" width="${w - L - 4}" height="${h2}" fill="#0f0f0f" rx="3"/>`;
    g += `<line x1="${X(k0)}" x2="${X(k0)}" y1="${top}" y2="${top + h1 + 10 + h2}" stroke="#ffd166" stroke-width="${hv ? 1.4 : .8}"${hv ? '' : ' stroke-dasharray="2 2"'}/>`;
    g += `<path d="${pathOf(KS.map((k, i) => [X(k), Y(ta[i])]))}" fill="none" stroke="#4fd18b" stroke-width="1.8"/><path d="${pathOf(KS.map((k, i) => [X(k), Y(pa[i])]))}" fill="none" stroke="#6fa8ff" stroke-width="1.8" stroke-dasharray="4 2"/>`;
    er.forEach((v, i) => { const y = Ye(v); g += `<rect x="${(X(i + 1) - 4.5).toFixed(1)}" y="${y.toFixed(1)}" width="9" height="${(top + h1 + 10 + h2 - y).toFixed(1)}" fill="${i + 1 === k0 ? '#ff9b8f' : '#ff6b5e'}"/>`; });
    g += T(L - 3, top + 8, `${mA.toFixed(1)}°`, '#808080', 9, 'end') + T(L - 3, top + h1, '0°', '#808080', 9, 'end') + T(L - 3, top + h1 + 18, `${mE.toFixed(1)}°`, '#808080', 9, 'end') + T(L - 3, top + h1 + 10 + h2, 'err', '#ff6b5e', 9, 'end');
    g += T(X(1), top + h1 + h2 + 22, '10 ms', '#808080', 9, 'middle') + T(X(20), top + h1 + h2 + 22, '200 ms', '#eaeaea', 9, 'middle');
    g += hoverRect('out', H, L, top, w - L - 4, h1 + 10 + h2, 0, 1);
    const i = k0 - 1;
    return `<h3>Forecast: how far it turns, step by step</h3><svg width="${w}" height="${top + h1 + h2 + 26}" role="img" aria-label="angle from now per forecast step, predicted and true, and the error">${g}</svg>
      <div class="m"><span style="color:#6fa8ff">- - predicted</span> · <span style="color:#4fd18b">— true</span>: rotation angle from now (°, includes roll) · <span style="color:#ff6b5e">■</span> error per step · hover a step</div>
      <div class="m">step <b>${k0}</b> (${k0 * 10} ms): predicted <b>${pa[i].toFixed(2)}°</b> · true <b>${ta[i].toFixed(2)}°</b> · error <b>${(k0 === H && f.err != null ? f.err : er[i]).toFixed(2)}°</b>${k0 === H ? ' · <span style="color:#fff">the scored step</span>' : ''}</div>`;
  };

  R.gaze = c => {
    const { D, idx } = c, f = D.frames[idx]; if (!f || !f.pred) return '';
    const yp = q => { const v = K.fwd(q), n = Math.hypot(...v); return [Math.atan2(v[0], v[2]), Math.asin(Math.max(-1, Math.min(1, v[1] / n)))]; };
    const [y0, p0] = yp(f.q), rel = q => { const [y, p] = yp(q); let dy = y - y0; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); return [dy * 180 / Math.PI, (p - p0) * 180 / Math.PI]; };
    const past = []; for (let j = 40; j >= 0; j--) { const g = D.frames[idx - j]; if (g) past.push(rel(g.q)); }
    const pr = f.pred.map(rel), tr = f.truth.map(rel), all = [...past, ...pr, ...tr];
    const m = Math.max(1, ...all.map(p => Math.max(Math.abs(p[0]), Math.abs(p[1])))) * 1.08, w = 278, h = 170, cx = w / 2 + 8, cy = h / 2 - 2, sc = Math.min((w - 40) / 2, (h - 24) / 2) / m;
    const X = v => cx + v * sc, Y = v => cy - v * sc, PT = p => [X(p[0]), Y(p[1])];
    let g = `<rect x="${cx - m * sc}" y="${cy - m * sc}" width="${2 * m * sc}" height="${2 * m * sc}" fill="#0f0f0f" rx="3"/>`;
    g += `<line x1="${X(-m)}" x2="${X(m)}" y1="${cy}" y2="${cy}" stroke="#2c2c2c"/><line x1="${cx}" x2="${cx}" y1="${Y(m)}" y2="${Y(-m)}" stroke="#2c2c2c"/>`;
    g += `<path d="${pathOf(past.map(PT))}" fill="none" stroke="#5b6780" stroke-width="1.4"/>` + past.map(p => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="1.4" fill="#5b6780"/>`).join('');
    for (const [pts, col] of [[tr, '#4fd18b'], [pr, '#6fa8ff']]) { g += `<path d="${pathOf([[cx, cy], ...pts.map(PT)])}" fill="none" stroke="${col}" stroke-width="1.6"/>` + pts.map((p, i) => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="${i === H - 1 ? 3.6 : 1.6}" fill="${col}"/>`).join(''); }
    g += `<circle cx="${cx}" cy="${cy}" r="3" fill="#e6ebf2"/>`;
    g += T(X(m) - 2, cy - 4, 'yaw →', '#808080', 9, 'end') + T(cx + 4, Y(m) + 9, '↑ pitch', '#808080', 9) + T(X(-m) + 2, Y(-m) - 3, `±${m.toFixed(1)}°`, '#808080', 9);
    const vp = K.fwd(f.pred[H - 1]), vt = K.fwd(f.truth[H - 1]), cos = vp.reduce((a, v, i) => a + v * vt[i], 0) / Math.hypot(...vp) / Math.hypot(...vt), gap = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    return `<h3>Head direction, flat view (2D)</h3><svg width="${w}" height="${h}" role="img" aria-label="yaw and pitch of the forward vector relative to now">${g}</svg>
      <div class="m"><span style="color:#e6ebf2">●</span> now (origin) · <span style="color:#5b6780">●</span> past 400 ms · <span style="color:#6fa8ff">●</span> predicted, <span style="color:#4fd18b">●</span> true next 200 ms (big dot = step 20)</div>
      <div class="m" title="yaw = heading of the forward vector, atan2(x, z), + toward the recording's +x; pitch = asin y, + up">axes: change in yaw and pitch since now, in degrees, equal scale · roll is not shown</div>
      <div class="m">step 20: predicted (${f1(pr[H - 1][0])}°, ${f1(pr[H - 1][1])}°) · true (${f1(tr[H - 1][0])}°, ${f1(tr[H - 1][1])}°) · pointing gap <b>${gap.toFixed(1)}°</b></div>`;
  };

  R.reach = () => {
    const w = 278, px = w / 393; let bars = '';
    K.COVER.n.forEach((v, lag) => { if (v) bars += `<rect x="${(w - (lag + 1) * px).toFixed(2)}" y="${v > 1 ? 0 : 6}" width="${(px + .05).toFixed(2)}" height="${v > 1 ? 18 : 12}" fill="${v > 1 ? '#ffd166' : '#9b8cff'}"/>`; });
    const C = K.COVER;
    return `<h3>How far back one output reaches</h3><div class="m"><b>1 + 7×1 + 7×8 + 7×47 = 393</b> feature steps (3.93 s) = 394 raw poses</div>
      <svg width="${w}" height="34" role="img" aria-label="coverage of lags 0 to 392">${bars}${T(0, 31, 't−392')}${T(w, 31, 'now', '#808080', 9.5, 'end')}</svg>
      <div class="m"><span style="color:#9b8cff">■</span> reached by 1 path · <span style="color:#ffd166">■</span> by 2 paths</div>
      <div class="m">lag = a + 8b + 47c, a, b, c ∈ 0…7: <b>${C.paths}</b> paths, <b>${C.distinct}</b> distinct lags, <b>${C.twice}</b> reached twice, <b>${C.gaps}</b> gaps</div>`;
  };

  K.R = R;
  root.K8I = K;
})(typeof window !== 'undefined' ? window : globalThis);
