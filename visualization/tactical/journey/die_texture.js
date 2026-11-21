
export const DIE = {
  cpu:  [-4.55, -4.55, -1.05, -1.25],
  gpu:  [-0.65, -4.55, 4.55, 0.35],
  sram: [-4.55, -0.95, -1.05, 1.55],
  npu:  [0.35, 0.85, 4.55, 4.55],
  misc: [-4.55, 1.85, 0.05, 4.55],
};
export const NPU_N = 8, NPU_K8 = [5, 2];
export function npuTile(c, r) {
  const [x0, z0, x1, z1] = DIE.npu, g = .06, w = (x1 - x0 - g * (NPU_N + 1)) / NPU_N, h = (z1 - z0 - g * (NPU_N + 1)) / NPU_N;
  const ax = x0 + g + c * (w + g), az = z0 + g + r * (h + g); return [ax, az, ax + w, az + h];
}

export function dieTexture(THREE, palette = 'pastel', S = 4096) {
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const P = v => (v + 5) / 10 * S, U = S / 10;
  const lc = document.createElement('canvas'); lc.width = lc.height = S; const g = lc.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const stroke = (b, a, w = 1.4) => { g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = w; g.strokeRect(P(b[0]), P(b[1]), P(b[2]) - P(b[0]), P(b[3]) - P(b[1])); };
  const fill = (b, a) => { g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(P(b[0]), P(b[1]), P(b[2]) - P(b[0]), P(b[3]) - P(b[1])); };
  function sram(b, vertical = rnd() < .5) {
    const [x0, z0, x1, z1] = b.map(P); g.fillStyle = 'rgba(255,255,255,.32)';
    if (vertical) { for (let x = x0 + 2; x < x1 - 1; x += 3.2) g.fillRect(x, z0 + 1, 1.1, z1 - z0 - 2); g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect((x0 + x1) / 2 - 2, z0, 4, z1 - z0); }
    else { for (let z = z0 + 2; z < z1 - 1; z += 3.2) g.fillRect(x0 + 1, z, x1 - x0 - 2, 1.1); g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(x0, (z0 + z1) / 2 - 2, x1 - x0, 4); }
  }
  function logic(b, a = .38) {
    const [x0, z0, x1, z1] = b.map(P);
    for (let z = z0 + 2; z < z1 - 2; z += 4) for (let x = x0 + 2; x < x1 - 2;) {
      const w = 2 + rnd() * 9; g.fillStyle = `rgba(255,255,255,${a * (.3 + rnd() * .7)})`; g.fillRect(x, z, Math.min(w, x1 - 2 - x), 2.2); x += w + 1.5;
    }
  }
  function bus(b) {
    const [x0, z0, x1, z1] = b.map(P), horiz = x1 - x0 > z1 - z0; g.fillStyle = 'rgba(255,255,255,.45)';
    if (horiz) for (let z = z0 + 1; z < z1; z += 5) g.fillRect(x0, z, x1 - x0, 1.2); else for (let x = x0 + 1; x < x1; x += 5) g.fillRect(x, z0, 1.2, z1 - z0);
  }
  function split(b, depth, out) {
    const [x0, z0, x1, z1] = b, w = x1 - x0, h = z1 - z0, gap = .035;
    if (depth === 0 || (w < .16 && h < .16)) { out.push(b); return; }
    const t = .3 + rnd() * .4;
    if (w > h) { const m = x0 + w * t; split([x0, z0, m - gap / 2, z1], depth - 1, out); split([m + gap / 2, z0, x1, z1], depth - 1, out); }
    else { const m = z0 + h * t; split([x0, z0, x1, m - gap / 2], depth - 1, out); split([x0, m + gap / 2, x1, z1], depth - 1, out); }
  }
  function leaf(b) {
    const k = rnd();
    if (k < .34) sram(b); else if (k < .72) logic(b); else if (k < .84) fill(b, .16); else bus(b);
    stroke(b, .62);
  }
  function mirrored(b, depth) {
    const [x0, z0, x1, z1] = b, mid = (x0 + x1) / 2, out = []; split([x0, z0, mid - .02, z1], depth, out);
    const s0 = seed; out.forEach(leaf); seed = s0;
    out.forEach(([a, c, d, e]) => leaf([2 * mid - d, c, 2 * mid - a, e]));
    stroke(b, .85, 2.2);
  }
  const grid = (b, cols, rows, fn) => { const [x0, z0, x1, z1] = b, w = (x1 - x0) / cols, h = (z1 - z0) / rows, gp = .05;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) fn([x0 + c * w + gp / 2, z0 + r * h + gp / 2, x0 + (c + 1) * w - gp / 2, z0 + (r + 1) * h - gp / 2], c, r); };

  stroke([-4.96, -4.96, 4.96, 4.96], .9, 3); stroke([-4.88, -4.88, 4.88, 4.88], .5, 1.5);
  for (const b of [[-4.55, -4.84, 4.55, -4.62], [4.62, -4.55, 4.84, 4.55]]) { grid(b, b[2] - b[0] > 1 ? 16 : 1, b[2] - b[0] > 1 ? 1 : 16, x => { sram(x, b[2] - b[0] > 1); stroke(x, .6); }); }
  g.fillStyle = 'rgba(255,255,255,.7)';
  for (let i = 0; i < 64; i++) { const t = -4.5 + i * (9 / 63), s = .07;
    for (const [x, z] of [[t, 4.75], [-4.75, t]]) g.fillRect(P(x - s), P(z - s), 2 * s * U, 2 * s * U); }
  bus([-0.98, -4.55, -0.72, 4.55]); bus([-4.55, 1.58, 0.3, 1.82]); bus([0.08, 0.42, 4.55, 0.8]);
  const cpu = DIE.cpu, cpuMid = cpu[1] + (cpu[3] - cpu[1]) * .48;
  grid([cpu[0], cpu[1], cpu[2], cpuMid], 2, 1, b => mirrored(b, 7));
  grid([cpu[0], cpuMid + .05, cpu[2], cpu[3] - .45], 4, 1, b => mirrored(b, 6));
  grid([cpu[0], cpu[3] - .4, cpu[2], cpu[3]], 6, 1, b => { sram(b, true); stroke(b, .6); });
  stroke(cpu, .9, 2.6);
  const gpu = DIE.gpu, gm = (gpu[0] + gpu[2]) / 2;
  grid([gpu[0], gpu[1], gm - .2, gpu[3]], 1, 3, b => mirrored(b, 7));
  grid([gm + .2, gpu[1], gpu[2], gpu[3]], 1, 3, b => mirrored(b, 7));
  grid([gm - .18, gpu[1], gm + .18, gpu[3]], 1, 8, b => { sram(b, false); stroke(b, .6); });
  stroke(gpu, .9, 2.6);
  grid(DIE.sram, 2, 4, b => { sram(b, false); stroke(b, .7, 1.6); });
  stroke(DIE.sram, .9, 2.6);
  const misc = DIE.misc;
  grid(misc, 3, 2, (b, c) => (c === 1 ? mirrored(b, 6) : (() => { const out = []; split(b, 7, out); out.forEach(leaf); stroke(b, .85, 2.2); })()));
  for (let r = 0; r < NPU_N; r++) for (let c = 0; c < NPU_N; c++) {
    const [x0, z0, x1, z1] = npuTile(c, r), hz = z0 + (z1 - z0) * .7;
    g.fillStyle = 'rgba(255,255,255,.42)';
    for (let x = P(x0) + 3; x < P(x1) - 3; x += 5) for (let z = P(z0) + 3; z < P(hz) - 3; z += 5) g.fillRect(x, z, 2.4, 2.4);
    sram([x0, hz + .02, x1, z1], true); stroke([x0, z0, x1, z1], .7, 1.4);
  }
  stroke(DIE.npu, .9, 2.6);

  const c = document.createElement('canvas'); c.width = c.height = S; const q = c.getContext('2d');
  const blobs = palette === 'tactical'
    ? { base: '#141619', spots: [[.2, .25, '#2c2f33'], [.75, .3, '#24272a'], [.3, .8, '#2a2c2e'], [.72, .74, '#3a4318']] }
    : { base: '#7f86c9', spots: [[.12, .18, '#8fb4ff'], [.55, .12, '#b7a2f2'], [.15, .85, '#f29ac8'], [.55, .6, '#d79ee6'], [.9, .55, '#9fc6f0'], [.85, .9, '#f2c98a']] };
  q.fillStyle = blobs.base; q.fillRect(0, 0, S, S);
  for (const [x, z, col] of blobs.spots) {
    const gr = q.createRadialGradient(x * S, z * S, 0, x * S, z * S, S * .55); gr.addColorStop(0, col); gr.addColorStop(1, col + '00');
    q.fillStyle = gr; q.fillRect(0, 0, S, S);
  }
  q.globalAlpha = palette === 'tactical' ? .55 : .38; q.fillStyle = '#000'; q.fillRect(0, 0, S, S);
  q.globalAlpha = 1; q.globalCompositeOperation = 'screen';
  if (palette === 'tactical') {
    const t = document.createElement('canvas'); t.width = t.height = S; const tg = t.getContext('2d');
    tg.drawImage(lc, 0, 0); tg.globalCompositeOperation = 'multiply'; tg.fillStyle = '#f1f0ea'; tg.fillRect(0, 0, S, S);
    q.drawImage(t, 0, 0);
  } else q.drawImage(lc, 0, 0);
  q.globalCompositeOperation = 'source-over';
  const k = npuTile(...NPU_K8); q.strokeStyle = '#dff140'; q.lineWidth = 7;
  q.strokeRect(P(k[0]), P(k[1]), P(k[2]) - P(k[0]), P(k[3]) - P(k[1]));
  q.fillStyle = 'rgba(223,241,64,.12)'; q.fillRect(P(k[0]), P(k[1]), P(k[2]) - P(k[0]), P(k[3]) - P(k[1]));

  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}
