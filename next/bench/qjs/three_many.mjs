// The scene of bench/three_many.ts in real three.js r186 on QuickJS over zinc's WebGL 2 (ZN-563): the CPU time of a frame (animation + renderer.render, then the
// read of the whole frame that the zinc:3d GPU backend also does). zinc run bench/qjs/three_many.mjs --engine quickjs
import * as THREE from '../../third_party/three/three.module.js';

const W = 800, H = 500, N = 1000, WARM = 60, LAST = 300;
const canvas = document.createElement('canvas');
canvas.width = W; canvas.height = H;
canvas.style = {}; canvas.addEventListener = () => {}; canvas.removeEventListener = () => {};
globalThis.window = globalThis; globalThis.self = globalThis; globalThis.navigator = { userAgent: 'zinc' };
if (typeof requestAnimationFrame === 'undefined') { globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {}; }

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101820);
const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
camera.position.set(0, 0, 60);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setSize(W, H, false);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(3, 5, 4);
scene.add(sun);

const geometry = new THREE.BoxGeometry(1, 1, 1);
const colors = [0xe63946, 0xf4a261, 0x2a9d8f, 0x457b9d, 0xe9c46a, 0x8ecae6, 0xb5838d, 0x90be6d, 0xf28482, 0x6d6875];
const materials = colors.map((c) => new THREE.MeshLambertMaterial({ color: c }));
const meshes = [];
for (let i = 0; i < N; i++) {
  const m = new THREE.Mesh(geometry, materials[i % 10]);
  m.position.set((i % 40) * 1.5 - 29.25, Math.floor(i / 40) * 1.5 - 18, 0);
  scene.add(m);
  meshes.push(m);
}

const gl = renderer.getContext(), px = new Uint8Array(W * H * 4);
let render = 0, read = 0;
for (let f = 1; f <= LAST; f++) {
  const t0 = performance.now();
  for (let i = 0; i < N; i++) { meshes[i].rotation.x += 0.01 + i * 0.00001; meshes[i].rotation.y += 0.02; }
  renderer.render(scene, camera);
  const t1 = performance.now();
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  if (f > WARM) { render += t1 - t0; read += performance.now() - t1; }
}
const n = LAST - WARM;
console.log(`three.js on QuickJS: ${N} meshes, ${((render + read) / n).toFixed(2)} ms CPU/frame (${(render / n).toFixed(2)} animation + render, ${(read / n).toFixed(2)} read), ${renderer.info.render.calls} draws, ${renderer.info.render.triangles} triangles`);
