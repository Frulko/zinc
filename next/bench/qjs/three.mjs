// QuickJS workload "three" of docs/reports/quickjs-aot-jit-and-ffi.md: three.js r186 (three.core.js, no GL), 500 meshes in 50 groups; per frame the
// CPU half of WebGLRenderer.render: rotations, updateMatrixWorld, frustum culling, a render list sorted by depth, the per-object matrices.
// zinc profile bench/qjs/three.mjs --engine quickjs (a ZN_QJS_PROFILE build)
import * as THREE from 'three';
const frames = globalThis.ZN_FRAMES ?? 200;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
camera.position.set(0, 0, 60);
const geometry = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshBasicMaterial();
geometry.computeBoundingSphere();
for (let g = 0; g < 50; g++) {
  const group = new THREE.Group();
  group.position.set((g % 10) * 6 - 27, Math.floor(g / 10) * 6 - 12, 0);
  for (let m = 0; m < 10; m++) { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(m % 3, Math.floor(m / 3), m * 0.1); group.add(mesh); }
  scene.add(group);
}
const frustum = new THREE.Frustum(), projScreen = new THREE.Matrix4(), sphere = new THREE.Sphere(), v = new THREE.Vector3();
const list = [], uniform = new Float32Array(16);
let drawn = 0;
const t0 = performance.now();
function frame() {
  for (const group of scene.children) { group.rotation.y += 0.01; for (const mesh of group.children) mesh.rotation.x += 0.02; }
  scene.updateMatrixWorld();
  camera.updateMatrixWorld();
  projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projScreen);
  list.length = 0;
  scene.traverseVisible((o) => {
    if (!o.isMesh) return;
    sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
    if (!frustum.intersectsSphere(sphere)) return;
    v.setFromMatrixPosition(o.matrixWorld).applyMatrix4(projScreen);
    list.push({ object: o, z: v.z });
  });
  list.sort((a, b) => a.z - b.z);
  for (const { object } of list) {
    object.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
    object.normalMatrix.getNormalMatrix(object.modelViewMatrix);
    const e = object.modelViewMatrix.elements;
    let same = true;
    for (let k = 0; k < 16; k++) if (uniform[k] !== e[k]) { same = false; break; }
    if (!same) uniform.set(e);
    drawn++;
  }
}
for (let f = 0; f < frames; f++) frame();
console.log('three: ' + frames + ' frames, ' + ((performance.now() - t0) / frames).toFixed(3) + ' ms/frame, ' + drawn + ' draws');
