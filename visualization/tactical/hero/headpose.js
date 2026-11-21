(function () {
  'use strict';
  var SHARE = { yaw: [0.20, 0.20], pitch: [0.40, 0.30], roll: [0.45, 0.35] };

  function mul(a, b) { return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]; }
  function conj(a) { return [-a[0], -a[1], -a[2], a[3]]; }
  function norm(a) { var n = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3]) || 1; return [a[0] / n, a[1] / n, a[2] / n, a[3] / n]; }
  function rot(q, v) { var x = q[0], y = q[1], z = q[2], w = q[3], tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)]; }
  function part(q, f) { var w = Math.max(-1, Math.min(1, q[3])), half = Math.acos(w), s = Math.sin(half); if (s < 1e-6) return [0, 0, 0, 1];
    var h2 = half * f, k = Math.sin(h2) / s; return [q[0] * k, q[1] * k, q[2] * k, Math.cos(h2)]; }

  function wrap(a) { a = a % (2 * Math.PI); return a > Math.PI ? a - 2 * Math.PI : a <= -Math.PI ? a + 2 * Math.PI : a; }
  function heading(q) { return wrap(2 * Math.atan2(q[1], q[3])); }
  var NECK_TURN = 1.2;
  function solve(q, piv, ref) {
    q = norm(q);
    var d = wrap(heading(q) - (ref || 0)), dn = NECK_TURN * tanh(d / NECK_TURN), B = (ref || 0) + d - dn;
    var qB = [0, Math.sin(B / 2), 0, Math.cos(B / 2)];
    q = mul(conj(qB), q); if (q[3] < 0) q = [-q[0], -q[1], -q[2], -q[3]];
    var twist = norm([0, q[1], 0, q[3]]), swing = mul(q, conj(twist));
    var ax = swing[0] * swing[0], az = swing[2] * swing[2], t = ax + az, nod = t > 1e-12 ? ax / t : 1;
    var fL = SHARE.pitch[0] * nod + SHARE.roll[0] * (1 - nod), fU = SHARE.pitch[1] * nod + SHARE.roll[1] * (1 - nod);
    var qL = mul(qB, mul(part(swing, fL), part(twist, SHARE.yaw[0])));
    var qU = mul(qL, mul(part(swing, fU), part(twist, SHARE.yaw[1])));
    var qH = mul(qB, q);
    var pL = piv[0], pU = add(pL, rot(qL, sub(piv[1], pL))), pH = add(pU, rot(qU, sub(piv[2], pU)));
    return { rot: [qL, qU, qH], piv: [pL, pU, pH], body: qB };
  }
  function tanh(x) { var e = Math.exp(2 * x); return (e - 1) / (e + 1); }
  function meanHeading(list) { var sx = 0, cx = 0, i; for (i = 0; i < list.length; i++) { sx += Math.sin(list[i]); cx += Math.cos(list[i]); } return Math.atan2(sx, cx); }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }

  function make() {
    var H = window.K8_HERO_HEAD; if (!H || !H.bones) return null;
    var skinPart = null, i; for (i = 0; i < H.parts.length; i++) if (H.parts[i].group === 'skin') skinPart = H.parts[i];
    if (!skinPart) return null;
    var u = H.unit, restPiv = H.bones.map(function (b) { return [b.pivot[0] * u, b.pivot[1] * u, b.pivot[2] * u]; });
    var n = skinPart.p.length / 3, rest = new Float32Array(n * 3), W = new Float32Array(n * 3);
    for (i = 0; i < n * 3; i++) { rest[i] = skinPart.p[i] * u; W[i] = skinPart.w[i] / 255; }
    return {
      count: n, rest: rest, part: skinPart, pivots: restPiv,
      apply: function (q, P, restN, N, ref) {
        var s = solve(q, restPiv, ref), R = s.rot, qB = s.body, ax = restPiv[0], pv = s.piv, k, b, j, v = [0, 0, 0], o, w, acc = [0, 0, 0], accN = [0, 0, 0], r, m;
        for (k = 0, j = 0; k < n; k++, j += 3) {
          v[0] = rest[j]; v[1] = rest[j + 1]; v[2] = rest[j + 2];
          var w0 = W[j], w1 = W[j + 1], w2 = W[j + 2], wc = 1 - w0 - w1 - w2; if (wc < 0) wc = 0;
          r = rot(qB, [v[0] - ax[0], v[1], v[2] - ax[2]]); acc[0] = wc * (r[0] + ax[0]); acc[1] = wc * r[1]; acc[2] = wc * (r[2] + ax[2]);
          if (N) { r = rot(qB, [restN[j], restN[j + 1], restN[j + 2]]); accN[0] = wc * r[0]; accN[1] = wc * r[1]; accN[2] = wc * r[2]; }
          for (b = 0; b < 3; b++) { w = b === 0 ? w0 : b === 1 ? w1 : w2; if (w <= 0) continue;
            o = restPiv[b]; r = rot(R[b], [v[0] - o[0], v[1] - o[1], v[2] - o[2]]); m = pv[b];
            acc[0] += w * (r[0] + m[0]); acc[1] += w * (r[1] + m[1]); acc[2] += w * (r[2] + m[2]);
            if (N) { r = rot(R[b], [restN[j], restN[j + 1], restN[j + 2]]); accN[0] += w * r[0]; accN[1] += w * r[1]; accN[2] += w * r[2]; } }
          P[j] = acc[0]; P[j + 1] = acc[1]; P[j + 2] = acc[2];
          if (N) { m = Math.sqrt(accN[0] * accN[0] + accN[1] * accN[1] + accN[2] * accN[2]) || 1; N[j] = accN[0] / m; N[j + 1] = accN[1] / m; N[j + 2] = accN[2] / m; }
        }
        var hq = R[2], ht = sub(pv[2], rot(hq, restPiv[2]));
        return { q: hq, t: ht };
      },
    };
  }
  window.K8HeroPose = { make: make, solve: solve, SHARE: SHARE, rot: rot, heading: heading, meanHeading: meanHeading };
})();
