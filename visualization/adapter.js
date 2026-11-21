window.adaptTrace = function (T) {
  const S = T.steps;
  const st = v => [0, 1].map(s => v[0].map(ch => ch[s][0]));
  const conjMul = (p, q) => {
    const [a, b, c, d] = [p[0], -p[1], -p[2], -p[3]], [w, x, y, z] = q;
    return [a*w - b*x - c*y - d*z, a*x + b*w + c*z - d*y, a*y - b*z + c*w + d*x, a*z + b*y - c*x + d*w];
  };
  const features = (prev, now) => {
    const d = conjMul(prev, now), om = [1, 2, 3].map(k => 200 * d[0] * d[k]);
    const [w, x, y, z] = now;
    return [...om, Math.abs(om[0]) + Math.abs(om[1]) + Math.abs(om[2]),
      2 * (x*y + w*z), w*w - x*x + y*y - z*z, 2 * (y*z - w*x)];
  };
  const ctx = T.initial_context;
  const pre = [];
  for (let i = 0; i < ctx.length - 1; i++)
    pre.push({ q: ctx[i], feat: i ? features(ctx[i - 1], ctx[i]) : null, proj: null, blk: [null, null, null] });
  const frames = pre.concat(S.map(s => ({
    q: s.input_quaternion, feat: s.features[0][0], proj: st(s.projection_relu),
    blk: [st(s.block_0), st(s.block_1), st(s.block_2)], warm: !!s.warmup,
    coef: s.head_coefficients ? s.head_coefficients[0] : null, r: s.trajectory_r ? s.trajectory_r[0] : null,
    pred: s.prediction ? s.prediction[0] : null, truth: s.ground_truth || null, err: s.error_step20_deg, holdErr: s.hold_error_step20_deg,
  })));
  const firstShown = frames.findIndex(f => f.proj && !f.warm && f.pred);
  const f0 = frames[firstShown], fj = features(frames[firstShown - 1].q, f0.q);
  const featErr = Math.max(...fj.map((v, i) => Math.abs(v - f0.feat[i])));
  const W = T.weights, val = k => W[k].values;
  const pw = b => { const v = val('pointwise.' + b);
    return { A: v.map(r => r.map(c => c[0])), B: v.map(r => r.map(c => c[1])), bias: val(`model.blocks.${b}.pointwise.bias`) }; };
  const M = T.metadata || {};
  return {
    frames, firstShown,
    W: { proj: val('projection'), projB: val('model.projection.bias'), dw: [0, 1, 2].map(b => val('depthwise.' + b)),
      pw: [0, 1, 2].map(pw), head: val('model.head.weight') },
    meta: { user: `test user ${String(M.user || '?').slice(0, 8)}…, ${M.recorded_calls || '?'} calls after ${M.warmup_calls || '?'} warm-up, ` +
      `mean speed ${M.selection_mean_speed_deg_s ? M.selection_mean_speed_deg_s.toFixed(0) : '?'}°/s; JS-vs-ONNX features differ by ${featErr.toExponential(1)} (only the trace's 4-decimal rounding, amplified ×200 in ω)` },
  };
};
