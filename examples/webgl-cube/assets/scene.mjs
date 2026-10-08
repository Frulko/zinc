// The three.js scene of the webgl-cube example: a lit cube and a torus on a plane with a shadow, orbit controls (drag the background, wheel to zoom) and a transform gizmo on the cube,
// real three.js controls from three/examples/jsm running on zinc's WebGL 2. The UI forwards the pointer events of the Surface node to `pointer` and `wheel`; the page reads back what changed.
import * as THREE from './three.module.js';
import { OrbitControls } from './OrbitControls.js';
import { TransformControls } from './TransformControls.js';

// ---- the DOM bits the controls touch: a canvas with listeners, a bounding box, an owner document
const listeners = new Map();
const docListeners = new Map();
function on(map) { return (type, fn) => { if (!map.has(type)) map.set(type, []); map.get(type).push(fn); }; }
function off(map) { return (type, fn) => { const l = map.get(type); if (l) map.set(type, l.filter((f) => f !== fn)); }; }
const W = 360, H = 240, K = globalThis.__scale || 1;   // the canvas is W x H points, K pixels per point (2 on a Retina screen): the drawing buffer has the physical size, so nothing is scaled up
const canvas = document.createElement('canvas');
canvas.width = W * K; canvas.height = H * K;
canvas.style = {};
canvas.addEventListener = on(listeners); canvas.removeEventListener = off(listeners);
canvas.ownerDocument = { addEventListener: on(docListeners), removeEventListener: off(docListeners) };
canvas.getRootNode = () => canvas.ownerDocument;
canvas.setPointerCapture = () => {}; canvas.releasePointerCapture = () => {}; canvas.hasPointerCapture = () => true;
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: W * K, bottom: H * K, width: W * K, height: H * K, x: 0, y: 0 });
canvas.clientWidth = W * K; canvas.clientHeight = H * K;
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.navigator = { userAgent: 'zinc' };

function dispatch(type, x, y, button, buttons) {
  x *= K; y *= K;   // points to drawing-buffer pixels
  const ev = { type, clientX: x, clientY: y, pageX: x, pageY: y, offsetX: x, offsetY: y, button, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true,
    ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, target: canvas, currentTarget: canvas, preventDefault() {}, stopPropagation() {}, deltaY: 0, deltaMode: 0 };
  for (const f of listeners.get(type) || []) f(ev);
  for (const f of docListeners.get(type) || []) f(ev);
}
export function pointer(type, x, y, button, buttons) { dispatch(type, x, y, button, buttons); }
export function wheel(dy) { for (const f of listeners.get('wheel') || []) f({ type: 'wheel', deltaY: dy, deltaMode: 0, clientX: W * K / 2, clientY: H * K / 2, ctrlKey: false, preventDefault() {}, stopPropagation() {} }); }

// ---- the scene
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setSize(W * K, H * K, false);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);
const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 50);
camera.position.set(3.2, 2.6, 4.2); camera.lookAt(0, 0.4, 0);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 5, 2); sun.castShadow = true; sun.shadow.mapSize.set(512, 512);
scene.add(sun, new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.8));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: 0x334155 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.35, metalness: 0.2 }));
cube.position.y = 0.8; cube.castShadow = true; scene.add(cube);
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.18, 24, 48), new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 }));
ring.position.set(-1.6, 0.9, -0.6); ring.rotation.x = Math.PI / 2; ring.castShadow = true; scene.add(ring);

const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 0.6, 0); orbit.enableDamping = false; orbit.update();
const gizmo = new TransformControls(camera, canvas);
gizmo.attach(cube);
gizmo.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; });
scene.add(gizmo.getHelper());

export function setMode(mode) { gizmo.setMode(mode); }
export function resetCamera() { camera.position.set(3.2, 2.6, 4.2); orbit.target.set(0, 0.6, 0); orbit.update(); }
export function resetCube() { cube.position.set(0, 0.8, 0); cube.rotation.set(0, 0, 0); cube.scale.set(1, 1, 1); }
export function cubeInfo() { const p = cube.position; return `cube ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`; }
// for tests and tools: where the cube is on the canvas, and which gizmo axis the pointer is over
export function cubeScreen() { const v = cube.position.clone().project(camera); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; }   // in points
export function hoverAxis() { return gizmo.axis || ''; }
export function cameraPos() { const p = camera.position; return `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`; }
const gl = renderer.getContext();
export function frame(image, t) {
  ring.rotation.z = t * 0.6;
  orbit.update();
  renderer.render(scene, camera);
  return gl.zincPresent(image);
}
