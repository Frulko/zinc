// 1000 meshes in three's API (plugins/three) on zinc:3d (ZN-563): the CPU time of a frame (animation + renderer.render, the read of the frame included) and the
// frame rate. bench/qjs/three_many.mjs is the same scene in real three.js on QuickJS.
//   ZINC_RUN=native ZINC_HEADLESS=1 ZINC_SIZE=800x500 ZINC_FRAMES=300 zinc run bench/three_many.ts      (ZINC_3D=software: the software renderer)
import * as THREE from 'three';
import { window } from 'three';

const N = 1000, WARM = 60, LAST = 300;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101820);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 0, 60);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(3, 5, 4);
scene.add(sun);

const geometry = new THREE.BoxGeometry(1, 1, 1);
const colors: number[] = [0xe63946, 0xf4a261, 0x2a9d8f, 0x457b9d, 0xe9c46a, 0x8ecae6, 0xb5838d, 0x90be6d, 0xf28482, 0x6d6875];
const materials: THREE.MeshLambertMaterial[] = [];
for (let i = 0; i < colors.length; i++) materials.push(new THREE.MeshLambertMaterial({ color: colors[i] }));
const meshes: THREE.Mesh[] = [];
for (let i = 0; i < N; i++) {
  const m = new THREE.Mesh(geometry, materials[i % 10]);
  m.position.set((i % 40) * 1.5 - 29.25, Math.floor(i / 40) * 1.5 - 18, 0);
  scene.add(m);
  meshes.push(m);
}

let frames = 0, cpu = 0, start = 0;
renderer.setAnimationLoop((time: number) => {
  const t0 = performance.now();
  for (let i = 0; i < N; i++) { meshes[i].rotation.x += 0.01 + i * 0.00001; meshes[i].rotation.y += 0.02; }
  renderer.render(scene, camera);
  frames++;
  if (frames > WARM) cpu += performance.now() - t0;
  if (frames === WARM) start = performance.now();
  if (frames === LAST) {
    const n = LAST - WARM;
    console.log(`three_many: ${N} meshes, ${(cpu / n).toFixed(2)} ms CPU/frame (animation + render), ${(n * 1000 / (performance.now() - start)).toFixed(1)} fps, ${renderer.info.render.calls} draws, ${renderer.info.render.triangles} triangles`);
  }
});
