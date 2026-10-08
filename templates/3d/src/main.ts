// The renderer, a camera you orbit with the pointer, and the animation loop.
import * as THREE from 'three';
import { window } from 'three';   // zinc: no DOM; `window` gives the screen size and pixel ratio
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { World } from './scene';
import { ORBITS, spin } from './motion';

const world = new World();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(5.5, 4, 7);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
// zinc: no document.body.appendChild(renderer.domElement): the renderer draws on the screen

const area = new THREE.CanvasElement();   // where the pointer drives the camera: the whole screen
area.width = window.innerWidth; area.height = window.innerHeight;
const controls = new OrbitControls(camera, area);
controls.target.set(0, 1, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.minDistance = 3;
controls.maxDistance = 20;

renderer.setAnimationLoop((time: number) => {
  const t = time / 1000;
  world.knot.rotation.y = spin(t, 8);
  world.knot.rotation.x = Math.sin(t * 0.5) * 0.3;
  for (let i = 0; i < ORBITS.length; i++) world.satellites[i].position.set(ORBITS[i].x(t), ORBITS[i].y(t), ORBITS[i].z(t));
  controls.update();
  renderer.render(world.scene, camera);
});
