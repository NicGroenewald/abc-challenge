// Model: "Meta Quest 3" by Elin (sketchfab.com/ElinHohler), CC BY 4.0, https://sketchfab.com/3d-models/meta-quest-3-65a813833dc04eeeb7d33bdca58c184c
import { GLTFLoader } from './vendor_gltf/loaders/GLTFLoader.js';
import { DRACOLoader } from './vendor_gltf/loaders/DRACOLoader.js';

export const HEADSET_URL = new URL('./assets/headset_q3.glb?r=q4', import.meta.url).href;

let DRACO = null;
export function makeGLTFLoader() {
  if (!DRACO) { DRACO = new DRACOLoader(); DRACO.setDecoderPath(new URL('./vendor_gltf/draco/', import.meta.url).href); }
  return new GLTFLoader().setDRACOLoader(DRACO);
}

export async function loadHeadsetModel(THREE, url = HEADSET_URL) {
  const gltf = await makeGLTFLoader().loadAsync(url);
  const wrap = new THREE.Group(); wrap.name = 'hero-headset-model'; wrap.scale.z = -1;
  wrap.add(gltf.scene);
  return wrap;
}
