// three/cubes: three.js "creating a scene" code on Zinc. The differences from the web version are marked `zinc:`.
import * as THREE from 'three';
import { window } from 'three';  // zinc: no DOM, `window` gives the screen size and pixel ratio

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101820);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2.2, 6);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
// zinc: no document.body.appendChild(renderer.domElement): the renderer draws on the screen

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(3, 5, 4);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x8899ff, 0x332211, 0.5));

const geometry = new THREE.BoxGeometry(1, 1, 1);
const colors: number[] = [0xe63946, 0xf4a261, 0x2a9d8f, 0x457b9d, 0xe9c46a];
const cubes: THREE.Mesh[] = [];
for (let i = 0; i < colors.length; i++) {
  const material = new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.4 });
  const cube = new THREE.Mesh(geometry, material);
  cube.position.x = (i - 2) * 1.6;
  scene.add(cube);
  cubes.push(cube);
}
const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.12, 12, 64), new THREE.MeshLambertMaterial({ color: 0xffffff }));
ring.rotation.x = Math.PI / 2;
ring.position.y = -1;
scene.add(ring);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: 0x223344 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.2;
scene.add(floor);

let frames = 0, renderMs = 0;
function animate(time: number): void {
  const t = time / 1000;
  for (let i = 0; i < cubes.length; i++) {
    cubes[i].rotation.x = t * (0.6 + i * 0.1);
    cubes[i].rotation.y = t * (0.9 - i * 0.05);
    cubes[i].position.y = Math.sin(t * 2 + i) * 0.3;
  }
  ring.rotation.z = t * 0.3;
  const t0 = performance.now();
  renderer.render(scene, camera);
  renderMs += performance.now() - t0;
  frames++;
  if (frames % 300 === 0) { console.log(`three/cubes: ${(renderMs / 300).toFixed(2)} ms/render, ${renderer.info.render.triangles} triangles`); renderMs = 0; }
}
renderer.setAnimationLoop(animate);
