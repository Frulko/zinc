// three/gltf-viewer: loads glTF 2.0 models with the three.js GLTFLoader API, orbit controls (drag, wheel/pinch, right
// drag or two fingers to pan), click/tap picking that highlights the picked mesh, and a zinc:ui overlay.
// The floor texture is painted with zinc:canvas. Models: the embedded assets, or a path given on the command line:
//   zinc run examples/three/gltf-viewer -- path/to/model.glb
// THREE_DEMO_SCRIPT=1 drives the camera and a pick by script (screenshots, see docs/plugins/three.md).
import { render, createSignal, For } from 'zinc:ui/solid';
import { pointerDown, pointerX, pointerY } from 'zinc:gfx';
import { args, env, clock } from 'zinc:sys';
import * as THREE from 'three';
import { window } from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Canvas } from 'zinc:canvas';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2230);
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.set(4, 3, 6);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
const orbitBox = new THREE.CanvasElement();  // the canvas minus the overlay bars
const controls = new OrbitControls(camera, orbitBox);
controls.enableDamping = true;
controls.dampingFactor = 0.12;

scene.add(new THREE.HemisphereLight(0xdde8ff, 0x3a3020, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(5, 8, 4);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x9fb4ff, 0.8);
fill.position.set(-6, 2, -5);
scene.add(fill);

// floor: a checker painted with zinc:canvas, used as a texture
const checker = new Canvas(128, 128);
const ctx = checker.getContext('2d');
ctx.begin();
for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
  ctx.fillStyle = (x + y) % 2 === 0 ? '#3b4658' : '#2c3544';
  ctx.fillRect(x * 16, y * 16, 16, 16);
}
ctx.strokeStyle = 'rgba(255,255,255,0.18)';
ctx.lineWidth = 2;
ctx.strokeRect(1, 1, 126, 126);
ctx.end();
const floorGeo = new THREE.PlaneGeometry(20, 20);
const uv = floorGeo.attributes.uv;
for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 10, uv.array[i * 2 + 1] * 10);  // repeat the checker
const floor = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(checker.image) }));
floor.name = 'floor';
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// ---------------------------------------------------------------- models
const models: string[] = ['CesiumMilkTruck.glb', 'box/BoxTextured.gltf'];
const cli = args();
if (cli.length > 0) models.unshift(cli[0]);
const [info, setInfo] = createSignal<string>('');
const [picked, setPicked] = createSignal<string>('click a part to pick it');
const [stats, setStats] = createSignal<string>('');
let model: THREE.Object3D | null = null;
let modelName = '';

function fit(obj: THREE.Object3D): void {
  // scale to ~3 units, stand on the floor, frame it
  const box = new THREE.Box3().setFromObject(obj), size = new THREE.Vector3(), centre = new THREE.Vector3();
  box.getSize(size);
  const s = 3 / Math.max(size.x, Math.max(size.y, size.z));
  obj.scale.multiplyScalar(s);
  box.setFromObject(obj);
  box.getCenter(centre);
  obj.position.x -= centre.x; obj.position.z -= centre.z; obj.position.y -= box.min.y;
  controls.target.set(0, (box.max.y - box.min.y) / 2, 0);
  camera.position.set(4.2, 2.6, 5.2);
  controls.update();
}

function load(i: i32): void {
  unpick();
  const old = model;
  if (old !== null) scene.remove(old);
  model = null;
  const t0 = clock();
  new GLTFLoader().load(models[i], (gltf: GLTF) => {
    const root = gltf.scene;
    scene.add(root);
    fit(root);
    model = root;
    modelName = models[i];
    let meshes = 0;
    root.traverse((o: THREE.Object3D) => { if (o instanceof THREE.Mesh) meshes++; });
    setInfo(`${modelName}: ${meshes} meshes, ${gltf.triangles} triangles, loaded in ${(clock() - t0).toFixed(0)} ms` + (gltf.ignoredAnimations > 0 ? ` (${gltf.ignoredAnimations} animation(s) ignored)` : ''));
    console.log(`loaded ${modelName}: ${meshes} meshes, ${gltf.triangles} triangles`);
  }, null, (e: Error) => { setInfo(e.message); console.error(e.message); });
}

// ---------------------------------------------------------------- picking
const raycaster = new THREE.Raycaster();
let pickedMesh: THREE.Mesh | null = null;
let pickedMaterial: THREE.Material | null = null;
function unpick(): void {
  const m = pickedMesh, mat = pickedMaterial;
  if (m !== null && mat !== null) m.material = mat;
  pickedMesh = null; pickedMaterial = null;
}
/** Picks at normalized device coordinates; highlights the nearest mesh of the model. */
function pick(nx: number, ny: number): void {
  const root = model;
  if (root === null) return;
  raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
  const hits = raycaster.intersectObject(root, true);
  unpick();
  if (hits.length === 0) { setPicked('nothing picked'); return; }
  const hit = hits[0], mesh = hit.object;
  pickedMesh = mesh;
  pickedMaterial = mesh.material;
  const glow = mesh.material.clone();
  glow.color.setRGB(1, 0.55, 0.15);
  mesh.material = glow;
  const p = hit.point;
  setPicked(`picked ${mesh.name.length > 0 ? mesh.name : '(unnamed)'} at ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)} (${hit.distance.toFixed(2)} m)`);
  console.log(`picked ${mesh.name} distance ${hit.distance.toFixed(3)}`);
}

// ---------------------------------------------------------------- frame
let downX = 0, downY = 0, wasDown = false;
let frames: i32 = 0, msSum = 0, fps = 0, acc = 0, fpsFrames: i32 = 0, span = 0;
const script = env('THREE_DEMO_SCRIPT').length > 0;

function View(x: i32, y: i32, w: i32, h: i32): void {
  renderer.setViewport(x, y, w, h);
  orbitBox.x = x; orbitBox.y = y + 44; orbitBox.width = w; orbitBox.height = h - 44 - 52;
  if (camera.aspect !== w / h) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
  // click (press and release without moving) = pick
  const down = pointerDown(), px = pointerX(), py = pointerY();
  if (down && !wasDown) { downX = px; downY = py; }
  if (!down && wasDown && Math.hypot(px - downX, py - downY) < 5 && px >= orbitBox.x && py >= orbitBox.y && py < orbitBox.y + orbitBox.height)
    pick((px - x) / w * 2 - 1, -((py - y) / h) * 2 + 1);
  wasDown = down;
  if (script) {  // scripted orbit and pick (screenshots)
    if (frames < 90) controls.rotateLeft(0.012);
    if (frames === 60) controls.dollyIn(0.8);
    if (frames === 100) pick(0.05, -0.05);
  }
  controls.update();
  const t0 = clock();
  renderer.render(scene, camera);
  msSum += clock() - t0;
  frames++;
  if (frames % 300 === 0) { console.log(`gltf-viewer ${w}x${h} x${renderer.getPixelRatio()}: ${(msSum / 300).toFixed(2)} ms/render, ${(span * 1000 / 300).toFixed(2)} ms/frame in all`); msSum = 0; span = 0; }
}

function App(): i32 {
  return <view class="flex-col h-full">
    <canvas class="grow" onDraw={View}>
      <view class="flex-col h-full justify-between">
        <view class="flex-row p-2 gap-3 items-center bg-slate-900/70">
          <text class="text-amber-400 font-bold">three + glTF</text>
          <text class="text-slate-300 text-sm grow">{info()}</text>
          <text class="text-emerald-400 text-sm">{stats()}</text>
        </view>
        <view class="flex-row p-2 gap-2 items-center bg-slate-900/70">
          <For each={models}>{(m: string, i: i32) =>
            <button class="px-3 py-1 rounded bg-slate-700 active:bg-amber-600" onClick={() => load(i)}><text class="text-sm text-white">{m}</text></button>}
          </For>
          <text class="text-slate-300 text-sm grow">{picked()}</text>
        </view>
      </view>
    </canvas>
  </view>;
}

load(0);
render(App, 0x1b2230, (dt: number) => {
  acc += dt; fpsFrames++; span += dt;
  if (acc >= 0.5) {
    fps = fpsFrames / acc; acc = 0; fpsFrames = 0;
    setStats(`${Math.round(fps)} fps  ${renderer.info.render.triangles} tris  ${renderer.info.render.calls} draws`);
  }
});
