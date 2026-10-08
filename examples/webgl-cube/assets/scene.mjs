// The three.js scene of the webgl-cube example: a lit cube and a torus on a plane with a shadow, rendered by real three.js on zinc's WebGL 2 into a canvas that the UI shows as a Surface.
import * as THREE from './three.module.js';
const canvas = document.createElement('canvas');
canvas.width = 360; canvas.height = 240;
canvas.style = {}; canvas.addEventListener = () => {}; canvas.removeEventListener = () => {};
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.navigator = { userAgent: 'zinc' };
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setSize(360, 240, false);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);
const camera = new THREE.PerspectiveCamera(45, 360 / 240, 0.1, 50);
camera.position.set(3.2, 2.6, 4.2); camera.lookAt(0, 0.4, 0);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 5, 2); sun.castShadow = true; sun.shadow.mapSize.set(512, 512);
scene.add(sun, new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.8));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: 0x334155 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.35, metalness: 0.2 }));
cube.position.y = 0.8; cube.castShadow = true; scene.add(cube);
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.18, 24, 48), new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 }));
ring.position.y = 0.8; ring.castShadow = true; scene.add(ring);
const gl = renderer.getContext();
export function frame(image, t) {
  cube.rotation.set(t * 0.7, t * 1.1, 0);
  ring.rotation.set(Math.PI / 2 + Math.sin(t) * 0.4, t * 0.5, 0);
  renderer.render(scene, camera);
  return gl.zincPresent(image);
}
