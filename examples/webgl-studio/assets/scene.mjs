// The three.js scene of the webgl-studio example: a glTF truck, a cube, a torus and a sphere with a custom shader on a floor that receives shadows; orbit controls, a transform gizmo on the picked
// object, picking by raycast and 'markers' (the screen position of every object, for the UI labels that follow them). The page drives it through the exports below.
import * as THREE from './three.module.js';
import { OrbitControls } from './OrbitControls.js';
import { TransformControls } from './TransformControls.js';
import { GLTFLoader } from './loaders/GLTFLoader.js';
import { glb } from './truck.mjs';

// ---- the DOM bits the controls touch: a canvas with listeners, a bounding box, an owner document
const listeners = new Map();
const docListeners = new Map();
function on(map) { return (type, fn) => { if (!map.has(type)) map.set(type, []); map.get(type).push(fn); }; }
function off(map) { return (type, fn) => { const l = map.get(type); if (l) map.set(type, l.filter((f) => f !== fn)); }; }
const W = 480, H = 360, K = globalThis.__scale || 1, SS = 2;   // SS: supersampling, the canvas is SS times the screen resolution and zincPresent averages it down (anti-aliasing)
const CK = K * SS;   // the canvas is W x H points, K pixels per point (2 on a Retina screen): the drawing buffer has the physical size, so nothing is scaled up
const canvas = document.createElement('canvas');
canvas.width = W * CK; canvas.height = H * CK;
canvas.style = {};
canvas.addEventListener = on(listeners); canvas.removeEventListener = off(listeners);
canvas.ownerDocument = { addEventListener: on(docListeners), removeEventListener: off(docListeners) };
canvas.getRootNode = () => canvas.ownerDocument;
canvas.setPointerCapture = () => {}; canvas.releasePointerCapture = () => {}; canvas.hasPointerCapture = () => true;
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: W * CK, bottom: H * CK, width: W * CK, height: H * CK, x: 0, y: 0 });
canvas.clientWidth = W * CK; canvas.clientHeight = H * CK;
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.navigator = { userAgent: 'zinc' };

function dispatch(type, x, y, button, buttons) {
  x *= CK; y *= CK;   // points to drawing-buffer pixels
  const ev = { type, clientX: x, clientY: y, pageX: x, pageY: y, offsetX: x, offsetY: y, button, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true,
    ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, target: canvas, currentTarget: canvas, preventDefault() {}, stopPropagation() {}, deltaY: 0, deltaMode: 0 };
  for (const f of listeners.get(type) || []) f(ev);
  for (const f of docListeners.get(type) || []) f(ev);
}
export function pointer(type, x, y, button, buttons) { dispatch(type, x, y, button, buttons); }
export function wheel(dy) { for (const f of listeners.get('wheel') || []) f({ type: 'wheel', deltaY: dy, deltaMode: 0, clientX: W * CK / 2, clientY: H * CK / 2, ctrlKey: false, preventDefault() {}, stopPropagation() {} }); }

// ---- the scene
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setSize(W * CK, H * CK, false);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
scene.fog = new THREE.Fog(0x0b1220, 14, 32);
const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 80);
const CAM = [5.2, 3.6, 6.4];
camera.position.set(...CAM);
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 30 });
sun.shadow.bias = -0.0005;
scene.add(sun, new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.9));
const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(18, 18, 0x475569, 0x1e293b); grid.position.y = 0.002; scene.add(grid);

// objects the UI can pick: name, node, where its marker sits (a point above it, in its local space)
const items = [];
function add(name, node, lift) { node.userData.name = name; node.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.item = node; } }); scene.add(node); items.push({ name, node, lift }); return node; }

const cube = add('Cube', new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.35, metalness: 0.2 })), 0.9);
cube.position.set(-1.9, 0.5, 3.0);
const ring = add('Ring', new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.2, 24, 48), new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 })), 1.1);
ring.position.set(2.6, 1.0, -1.4); ring.rotation.x = Math.PI / 2;

// a sphere with its own shader: animated stripes, a fresnel rim and a pulse; the "plain" material is the one the Shader switch turns it back to
const shaderMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uRim: { value: new THREE.Color(0x38bdf8) }, uBase: { value: new THREE.Color(0x0f172a) } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uTime; uniform vec3 uRim; uniform vec3 uBase; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main() {
      float fres = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.5);
      float bands = 0.5 + 0.5 * sin(vP.y * 14.0 - uTime * 3.0);
      float pulse = 0.65 + 0.35 * sin(uTime * 2.0);
      vec3 c = mix(uBase, uRim, bands * 0.55 * pulse) + uRim * fres * 1.4;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
const plainMat = new THREE.MeshStandardMaterial({ color: 0x14b8a6, roughness: 0.3, metalness: 0.4 });
const sphere = add('Sphere', new THREE.Mesh(new THREE.SphereGeometry(0.85, 48, 32), shaderMat), 1.2);
sphere.position.set(0.2, 0.85, -2.6);

// the glTF truck (Cesium Milk Truck): GLTFLoader.parse over the bytes of the embedded GLB
function bytes64(b64) {
  const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out = new Uint8Array(Math.floor(b64.length * 3 / 4)); let o = 0, buf = 0, bits = 0;
  for (let i = 0; i < b64.length; i++) { const v = T.indexOf(b64[i]); if (v < 0) continue; buf = (buf << 6) | v; bits += 6; if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 255; } }
  return out;
}
let truck = null, loadNote = 'loading the truck…';
new GLTFLoader().parse(bytes64(glb).buffer, '', (g) => {
  truck = g.scene;
  const box = new THREE.Box3().setFromObject(truck), size = box.getSize(new THREE.Vector3()), k = 3.2 / Math.max(size.x, size.y, size.z);
  const holder = new THREE.Group(); truck.scale.setScalar(k); truck.position.y = -box.min.y * k; truck.rotation.y = Math.PI / 2; holder.add(truck);
  add('Truck', holder, 2.6); holder.position.set(0, 0, 1.4);
  loadNote = 'truck ready';
}, (e) => { loadNote = 'truck failed: ' + (e && e.message || e); });

const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 0.8, 0); orbit.enableDamping = false; orbit.autoRotateSpeed = 1.2; orbit.update();
const gizmo = new TransformControls(camera, canvas);
gizmo.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; dragging = e.value; });
scene.add(gizmo.getHelper());
let dragging = false, selected = null, outline = null;

export function select(name) {
  const it = items.find((i) => i.name === name);
  if (outline) { scene.remove(outline); outline = null; }
  selected = it ? it.node : null;
  if (!selected) { gizmo.detach(); return ''; }
  gizmo.attach(selected);
  outline = new THREE.BoxHelper(selected, 0xfacc15); scene.add(outline);
  return it.name;
}
// pick at a point of the canvas (points): the name of the item under it, '' for the floor and the sky
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
export function pick(x, y) {
  ndc.set(x / W * 2 - 1, -(y / H) * 2 + 1); ray.setFromCamera(ndc, camera);
  for (const h of ray.intersectObjects(items.map((i) => i.node), true)) { let o = h.object; while (o && !o.userData.name) o = o.parent; if (o) return o.userData.name; }
  return '';
}
export function isDragging() { return dragging; }
export function setMode(mode) { gizmo.setMode(mode); }
export function resetCamera() { camera.position.set(...CAM); orbit.target.set(0, 0.8, 0); orbit.update(); }
// look: sun azimuth (degrees), sun intensity, exposure, shadows, wireframe, custom shader on the sphere, camera auto-rotation
export function look(azimuth, intensity, exposure, shadows, wire, shader, spin) {
  const a = azimuth * Math.PI / 180;
  sun.position.set(Math.cos(a) * 6, 7, Math.sin(a) * 6); sun.intensity = intensity;
  renderer.toneMappingExposure = exposure;
  if (renderer.shadowMap.enabled !== shadows) { renderer.shadowMap.enabled = shadows; scene.traverse((o) => { if (o.material) { for (const m of [].concat(o.material)) m.needsUpdate = true; } }); }
  for (const i of items) i.node.traverse((o) => { if (o.isMesh && o.material && 'wireframe' in o.material) o.material.wireframe = wire; });
  shaderMat.wireframe = wire;
  const want = shader ? shaderMat : plainMat;
  if (sphere.material !== want) sphere.material = want;
  orbit.autoRotate = spin;
}
export function info() {
  const n = selected ? selected.userData.name : 'nothing'; const p = selected ? selected.position : null;
  return `${n}${p ? ` ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}` : ''}  ${loadNote}`;
}
// the markers: one JSON string, [[name, x, y, visible], ...], x and y in points over the canvas; hidden when the object is behind the camera
const tmp = new THREE.Vector3();
export function markers() {
  return JSON.stringify(items.map((i) => {
    tmp.setFromMatrixPosition(i.node.matrixWorld); tmp.y += i.lift; tmp.project(camera);
    return [i.name, Math.round((tmp.x + 1) / 2 * W), Math.round((1 - tmp.y) / 2 * H), tmp.z < 1 ? 1 : 0];
  }));
}
const gl = renderer.getContext();
export function frame(image, t) {
  ring.rotation.z = t * 0.6; cube.rotation.y = t * 0.3;
  shaderMat.uniforms.uTime.value = t;
  orbit.update();
  if (outline) outline.update();
  renderer.render(scene, camera);
  return gl.zincPresent(image);
}
