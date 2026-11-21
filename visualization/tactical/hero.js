
export const PREDICTION_ACCENT = '#dff140';
export const SKIN_TONE = '#c8a590';
const LOOK = {
  skin:    { color: SKIN_TONE, roughness: 0.58, sheen: 0.3, sheenColor: '#ff9d80', sheenRoughness: 0.6 },
  cloth:   { color: '#474c57', roughness: 0.92, sheen: 0.5, sheenColor: '#8f97a6', sheenRoughness: 0.8 },
  body:    { color: '#ecebe7', roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.25 },
  plate:   { color: '#08090b', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 },
  pad:     { color: '#2b2c2f', roughness: 0.85 },
  strap:   { color: '#33363b', roughness: 0.8 }, top: { color: '#33363b', roughness: 0.8 }, backpad: { color: '#33363b', roughness: 0.8 },
};
const TRUE_POINTER = '#dde4ee';
const GHOST_OPACITY = 0.03;
const GHOST_EDGE = 0.95;
const GHOST_RIM = [0.5, 0.82];
const POINTER_HEADS = 1.5;
const ARC_STEPS = 48;

function clipToThree(THREE, list) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const [w, x, y, z] = list[i], q = new THREE.Quaternion(-x, -y, z, w).normalize();
    if (i && q.dot(out[i - 1]) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    out.push(q);
  }
  return out;
}

export function createHero({ THREE, clip, head, pose, accent = PREDICTION_ACCENT }) {
  if (!THREE || !clip || !head || !pose) throw new Error('createHero needs THREE, clip, head and pose');
  const rigPose = pose.make();
  if (!rigPose) throw new Error('createHero: the head has no skin or no bones');
  const rate = clip.rate_hz || 100, Q = clipToThree(THREE, clip.q), PRED = clipToThree(THREE, clip.pred), N = Q.length;
  const horizon = clip.horizon || 20;
  const period = (N - 1) / rate;
  const bodyRef = pose.meanHeading(Q.map(q => pose.heading([q.x, q.y, q.z, q.w])));

  const u = head.unit, group = new THREE.Group(), headset = new THREE.Group(), materials = [], geometries = [];
  group.name = 'hero'; headset.name = 'hero-headset';
  const mat = (color, basic, look) => { const m = basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshPhysicalMaterial({ color, roughness: 0.72, metalness: 0, ...(LOOK[look] || {}) }); materials.push(m); return m; };
  let skin = null, restN = null;
  for (const p of head.parts) {
    const g = new THREE.BufferGeometry(), a = new Float32Array(p.p.length);
    for (let i = 0; i < a.length; i++) a[i] = p.p[i] * u;
    g.setAttribute('position', new THREE.BufferAttribute(a, 3)); geometries.push(g);
    if (p.group === 'skin') {
      g.setIndex(p.i.concat(p.i2)); g.addGroup(0, p.i.length, 0); g.addGroup(p.i.length, p.i2.length, 1);
      g.computeVertexNormals();
      restN = g.attributes.normal.array.slice();
      g.attributes.position.setUsage(THREE.DynamicDrawUsage); g.attributes.normal.setUsage(THREE.DynamicDrawUsage);
      skin = new THREE.Mesh(g, [mat(p.color, false, 'skin'), mat(p.color2, false, 'cloth')]);
      skin.name = 'hero-skin';
      skin.frustumCulled = false;
    } else {
      g.setIndex(p.i); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat(p.color, p.name === 'led', p.name)); m.name = 'hero-headset-' + p.name; headset.add(m);
    }
  }
  if (!skin) throw new Error('createHero: no skin part in the head');
  group.add(skin, headset);

  const mmPerUnit = 1000 / head.per_metre, anchors = [];
  {
    const hv = []; headset.children.forEach(m => { const a = m.geometry.attributes.position.array; for (let i = 0; i < a.length; i += 3) hv.push(a[i], a[i + 1], a[i + 2]); });
    const sp = skin.geometry.attributes.position.array, lim = (20 / mmPerUnit) ** 2;
    for (let i = 0, k = 0; i < sp.length; i += 3, k++) {
      for (let j = 0; j < hv.length; j += 3) { const dx = sp[i] - hv[j], dy = sp[i + 1] - hv[j + 1], dz = sp[i + 2] - hv[j + 2]; if (dx * dx + dy * dy + dz * dz < lim) { anchors.push(k); break; } }
    }
  }

  const ghost = new THREE.Group(); ghost.name = 'hero-ghost';
  const ghostColor = new THREE.Color(accent);
  const OFFSET = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4 };
  const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true, ...OFFSET }); materials.push(depthMat);
  const ghostMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: ghostColor }, uOpacity: { value: GHOST_OPACITY }, uEdge: { value: GHOST_EDGE }, uRim: { value: new THREE.Vector2(...GHOST_RIM) } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uEdge; uniform vec2 uRim; varying vec3 vN; varying vec3 vV;
      void main() { float e = smoothstep(uRim.x, uRim.y, 1.0 - abs(dot(normalize(vN), normalize(vV))));
        gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.25 * e), min(1.0, uOpacity + uEdge * e));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth, side: THREE.FrontSide, ...OFFSET,
  });
  materials.push(ghostMat);
  for (const m of headset.children) {
    const d = new THREE.Mesh(m.geometry, depthMat); d.renderOrder = 1; d.name = m.name.replace('hero-headset', 'hero-ghost-depth');
    const c = new THREE.Mesh(m.geometry, ghostMat); c.renderOrder = 2; c.name = m.name.replace('hero-headset', 'hero-ghost');
    ghost.add(d, c);
  }

  let zLo = Infinity, zHi = -Infinity;
  { const sk = head.parts.find(p => p.group === 'skin');
    for (let k = 0; k < sk.w.length / 3; k++) if (sk.w[3 * k + 2] > 200) { const z = sk.p[3 * k + 2] * u; if (z < zLo) zLo = z; if (z > zHi) zHi = z; } }
  const headLength = zHi - zLo;
  const hsBox = new THREE.Box3(); headset.children.forEach(m => { m.geometry.computeBoundingBox(); hsBox.union(m.geometry.boundingBox); });
  const shell = headset.children.find(m => /body$/.test(m.name)) || headset.children[0];
  const front = new THREE.Vector3(0, (shell.geometry.boundingBox.min.y + shell.geometry.boundingBox.max.y) / 2, hsBox.min.z);
  const tipLocal = front.clone().add(new THREE.Vector3(0, 0, -POINTER_HEADS * headLength));
  const headPivot = rigPose.pivots[2];
  const centreLocal = new THREE.Vector3(front.x, front.y, headPivot[2]), radius = centreLocal.z - tipLocal.z;
  const lineGeo = (a, b) => { const g = new THREE.BufferGeometry().setFromPoints([a, b]); geometries.push(g); return g; };
  const truePtr = new THREE.Line(lineGeo(front, tipLocal), new THREE.LineBasicMaterial({ color: TRUE_POINTER }));
  const ghostPtr = new THREE.Line(lineGeo(front, tipLocal), new THREE.LineBasicMaterial({ color: ghostColor, transparent: true, opacity: 0.95, depthWrite: false }));
  materials.push(truePtr.material, ghostPtr.material);
  truePtr.name = 'hero-pointer'; ghostPtr.name = 'hero-ghost-pointer'; truePtr.renderOrder = 3; ghostPtr.renderOrder = 3;
  headset.add(truePtr); ghost.add(ghostPtr);
  const arcPos = new Float32Array((ARC_STEPS + 2) * 3), arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3).setUsage(THREE.DynamicDrawUsage)); geometries.push(arcGeo);
  const arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: ghostColor, transparent: true, opacity: 0.8, depthWrite: false }));
  materials.push(arc.material); arc.name = 'hero-arc'; arc.renderOrder = 3; arc.frustumCulled = false;
  group.add(ghost, arc);

  const qa = new THREE.Quaternion(), qp = new THREE.Quaternion(), arr = [0, 0, 0, 1];
  const c1 = new THREE.Vector3(), d1 = new THREE.Vector3(), d2 = new THREE.Vector3(), tip1 = new THREE.Vector3(), tip2 = new THREE.Vector3();
  const qTurn = new THREE.Quaternion(), qPart = new THREE.Quaternion(), qId = new THREE.Quaternion(), dk = new THREE.Vector3();
  let paused = false, f = 0, lastF = NaN, arcDeg = 0;
  function poseAt(fs) {
    if (fs === lastF) return; lastF = fs;
    const i = Math.min(N - 2, Math.floor(fs)), t = fs - i;
    qa.slerpQuaternions(Q[i], Q[i + 1], t);
    arr[0] = qa.x; arr[1] = qa.y; arr[2] = qa.z; arr[3] = qa.w;
    const pos = skin.geometry.attributes.position, nor = skin.geometry.attributes.normal;
    const hb = rigPose.apply(arr, pos.array, restN, nor.array, bodyRef);
    pos.needsUpdate = true; nor.needsUpdate = true;
    headset.quaternion.set(hb.q[0], hb.q[1], hb.q[2], hb.q[3]); headset.position.set(hb.t[0], hb.t[1], hb.t[2]);

    qp.slerpQuaternions(PRED[i], PRED[i + 1], t);
    const s = pose.solve([qp.x, qp.y, qp.z, qp.w], rigPose.pivots, bodyRef), gq = s.rot[2], gp = s.piv[2], r = pose.rot(gq, headPivot);
    ghost.quaternion.set(gq[0], gq[1], gq[2], gq[3]); ghost.position.set(gp[0] - r[0], gp[1] - r[1], gp[2] - r[2]);

    c1.copy(centreLocal).applyQuaternion(headset.quaternion).add(headset.position);
    d1.set(0, 0, -1).applyQuaternion(headset.quaternion); d2.set(0, 0, -1).applyQuaternion(ghost.quaternion);
    tip1.copy(tipLocal).applyQuaternion(headset.quaternion).add(headset.position);
    tip2.copy(tipLocal).applyQuaternion(ghost.quaternion).add(ghost.position);
    qTurn.setFromUnitVectors(d1, d2);
    for (let k = 0; k <= ARC_STEPS; k++) {
      qPart.slerpQuaternions(qId, qTurn, k / ARC_STEPS);
      dk.copy(d1).applyQuaternion(qPart).multiplyScalar(radius).add(c1);
      arcPos[3 * k] = dk.x; arcPos[3 * k + 1] = dk.y; arcPos[3 * k + 2] = dk.z;
    }
    arcPos.set([tip2.x, tip2.y, tip2.z], 3 * (ARC_STEPS + 1));
    arcGeo.attributes.position.needsUpdate = true;
    arcDeg = d1.angleTo(d2) * 180 / Math.PI;
  }
  function poseClock(clockSeconds) {
    let t = clockSeconds;
    if (!(t >= 0 && t <= period)) { t %= period; if (t < 0) t += period; if (!(t >= 0)) t = 0; }
    f = Math.min(N - 1, Math.max(0, t * rate));
    poseAt(f);
  }
  poseAt(0);

  const wq = new THREE.Quaternion(), wv = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const q4 = q => [q.x, q.y, q.z, q.w];
  return {
    group, skin, headset, ghost, arc, anchors, period, mmPerUnit, bodyRef, samples: N, rate, horizon, headLength, accent,
    update(clockSeconds) { if (!paused) poseClock(clockSeconds); },
    poseAt: poseClock,
    setPaused(p) { paused = !!p; },
    sampleIndex() { return Math.floor(f); },
    fraction() { return f; },
    measure() {
      group.updateMatrixWorld(true);
      const M = group.matrixWorld, at = k => new THREE.Vector3(arcPos[3 * k], arcPos[3 * k + 1], arcPos[3 * k + 2]);
      const cw = c1.clone().applyMatrix4(M);
      a.copy(at(0)).applyMatrix4(M).sub(cw); b.copy(at(ARC_STEPS)).applyMatrix4(M).sub(cw);
      return {
        f, headset: q4(headset.getWorldQuaternion(wq)), ghost: q4(ghost.getWorldQuaternion(wq)),
        tips: [tip1.clone().applyMatrix4(M), tip2.clone().applyMatrix4(M)], centre: cw,
        arcDeg: a.angleTo(b) * 180 / Math.PI, arcDegPosed: arcDeg, gap: at(ARC_STEPS).distanceTo(tip2),
        radius, headLength, pointerLength: tipLocal.distanceTo(front),
      };
    },
    useModel(model) {
      for (const m of headset.children) if (m.isMesh) m.visible = false;
      headset.add(model);
      for (const c of [...ghost.children]) if (c.isMesh) ghost.remove(c);
      const g = model.clone(true), meshes = [];
      g.traverse(o => { if (o.isMesh) meshes.push(o); });
      for (const o of meshes) {
        o.material = ghostMat; o.renderOrder = 2;
        const d = new THREE.Mesh(o.geometry, depthMat); d.renderOrder = 1;
        d.position.copy(o.position); d.quaternion.copy(o.quaternion); d.scale.copy(o.scale); o.parent.add(d);
      }
      ghost.add(g);
      model.traverse(o => { if (o.isMesh) { geometries.push(o.geometry); materials.push(...(Array.isArray(o.material) ? o.material : [o.material])); } });
    },
    dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); group.removeFromParent(); group.clear(); },
  };
}
