// The scenes of tests/three: a cube, an instanced mesh with a shadow map, and a glTF (GLB) model.
import { base64ToBytes } from './harness.mjs';

export const cube = async (THREE, canvas) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setSize(128, 128, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x203040);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  camera.position.set(1.5, 1.2, 2.5); camera.lookAt(0, 0, 0);
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshNormalMaterial()));
  return { render: () => renderer.render(scene, camera) };
};

export const instancedShadow = async (THREE, canvas) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setSize(128, 128, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x203040);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 20);
  camera.position.set(0, 3, 5); camera.lookAt(0, 0, 0);
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(2, 4, 2); light.castShadow = true; light.shadow.mapSize.set(256, 256);
  scene.add(light, new THREE.AmbientLight(0x404040));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x888888 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xff8844 }), 9);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 9; i++) { m.setPosition((i % 3 - 1) * 1.2, 0.25, (Math.floor(i / 3) - 1) * 1.2); inst.setMatrixAt(i, m); }
  inst.castShadow = true; scene.add(inst);
  return { render: () => renderer.render(scene, camera) };
};

// A GLB with one coloured triangle fan (made by tools/three-compare --make-glb): loaded by GLTFLoader.parse, no network
export const gltf = async (THREE, canvas, ctx) => {
  const { GLTFLoader } = await ctx.import('GLTFLoader');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setSize(128, 128, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x203040);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  camera.position.set(1.5, 1.2, 2.5); camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2), new THREE.DirectionalLight(0xffffff, 2));
  const bytes = base64ToBytes(ctx.glb);
  const model = await new Promise((res, rej) => new GLTFLoader().parse(bytes.buffer, '', res, rej));
  scene.add(model.scene);
  return { render: () => renderer.render(scene, camera) };
};
