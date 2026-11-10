import * as T from 'three';
import { TIER } from 'zinc:platform';
import { downgradeMaterials, mergeStaticMeshes } from 'zinc:three-pi';
const assert = (value, message) => { if (!value) throw new Error(message); };
const close = (a, b) => Math.abs(a - b) < 1e-5;
const texture = new T.Texture();
const source = new T.MeshPhysicalMaterial({ color: 0x123456, map: texture, emissive: 0x234567,
  emissiveMap: texture, emissiveIntensity: .7, lightMap: texture, lightMapIntensity: .4,
  aoMap: texture, aoMapIntensity: .8, alphaMap: texture, opacity: .6, alphaTest: .2,
  vertexColors: true, fog: false, side: T.DoubleSide, normalMap: texture, bumpMap: texture,
  flatShading: true, alphaHash: true, alphaToCoverage: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 2 });
const scene = new T.Scene(), a = new T.Mesh(new T.PlaneGeometry(), source), b = a.clone();
const custom = new T.MeshStandardMaterial(); custom.onBeforeCompile = () => {};
const c = new T.Mesh(new T.PlaneGeometry(), custom);
const multi = new T.Mesh(new T.PlaneGeometry(), [source, source]);
scene.add(a, b, c, multi);
const originalArray = multi.material;
assert(downgradeMaterials(scene) === scene, 'scene identity');
if (TIER !== 2) {
  assert(a.material === source && multi.material === originalArray && source.flatShading && source.alphaHash, 'desktop material no-op');
} else {
  const material = a.material;
  assert(material.isMeshLambertMaterial && material === b.material && material === multi.material[0] && material === multi.material[1], 'Lambert and call-local identity');
  assert(c.material === custom, 'custom shader retained');
  assert(material.color.equals(source.color) && material.emissive.equals(source.emissive), 'colors');
  for (const key of ['map','emissiveMap','emissiveIntensity','lightMap','lightMapIntensity','aoMap','aoMapIntensity','alphaMap','opacity','alphaTest','vertexColors','fog','side','depthWrite','polygonOffset','polygonOffsetFactor']) assert(material[key] === source[key], 'material field ' + key);
  assert(!material.normalMap && !material.bumpMap && !material.flatShading && !material.alphaHash && !material.alphaToCoverage, 'unsupported derivative features dropped');
  assert(source.normalMap === texture && source.flatShading && source.alphaHash, 'source material untouched');
  const next = new T.Scene(); next.add(new T.Mesh(a.geometry, source)); downgradeMaterials(next);
  assert(next.children[0].material !== material, 'no global material cache');
}
const triangle = () => {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute([0,0,0, 1,0,0, 0,1,0], 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute([0,0,1, 0,0,1, 0,0,1], 3));
  geometry.setAttribute('tangent', new T.Float32BufferAttribute([1,0,0,1, 1,0,0,1, 1,0,0,1], 4));
  geometry.setAttribute('color', new T.BufferAttribute(new Uint8Array([255,1,2, 3,255,4, 5,6,255]), 3, true));
  const ids = new T.BufferAttribute(new Uint16Array([3, 4, 5]), 1);
  ids.gpuType = T.IntType; ids.name = 'joint-ids'; ids.setUsage(T.DynamicDrawUsage); geometry.setAttribute('jointId', ids);
  geometry.setIndex(new T.Uint16BufferAttribute([0,1,2], 1));
  return geometry;
};
const material = new T.MeshLambertMaterial();
const parent = new T.Group(); parent.position.set(10,20,30); parent.rotation.y = .7; parent.scale.set(2,3,4);
const first = new T.Mesh(triangle(), material), second = new T.Mesh(triangle(), material);
first.position.set(1,2,3); first.rotation.y = .4; first.scale.set(2,3,4);
second.position.set(-2,1,0); second.rotation.z = .3;
first.userData.static = second.userData.static = true;
parent.add(first, second); parent.updateMatrixWorld(true);
const expectedPositions = [], expectedNormals = [], expectedTangents = [];
for (const mesh of [first, second]) {
  expectedPositions.push(new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, 1).applyMatrix4(mesh.matrixWorld));
  expectedNormals.push(new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.normal, 1).applyNormalMatrix(new T.Matrix3().getNormalMatrix(mesh.matrix)));
  expectedTangents.push(new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.tangent, 1).transformDirection(mesh.matrix));
}
let disposed = 0; first.geometry.addEventListener('dispose', () => disposed++); material.addEventListener('dispose', () => disposed++);
const originalGeometry = first.geometry, originalPosition = first.geometry.attributes.position.array.slice();
assert(mergeStaticMeshes(parent) === parent, 'parent identity');
if (TIER !== 2) {
  assert(parent.children.length === 2 && parent.children[0] === first && first.geometry === originalGeometry, 'desktop merge no-op');
} else {
  assert(parent.children.length === 1 && parent.children[0] !== first, 'static siblings merged');
  const mesh = parent.children[0], geometry = mesh.geometry;
  assert(mesh.material === material && geometry.index.count === 6 && geometry.index.array instanceof Uint16Array, 'identity and 16-bit merged indices');
  parent.updateMatrixWorld(true);
  for (let i = 0; i < 2; i++) {
    const vertex = i * 3 + 1;
    const point = new T.Vector3().fromBufferAttribute(geometry.attributes.position, vertex).applyMatrix4(mesh.matrixWorld);
    assert(point.distanceTo(expectedPositions[i]) < 1e-4, 'parent-coordinate positions');
    const normal = new T.Vector3().fromBufferAttribute(geometry.attributes.normal, vertex);
    const tangent = new T.Vector3().fromBufferAttribute(geometry.attributes.tangent, vertex);
    assert(normal.distanceTo(expectedNormals[i]) < 1e-5 && tangent.distanceTo(expectedTangents[i]) < 1e-5 && geometry.attributes.tangent.getW(vertex) === 1, 'normal/tangent transforms');
    assert(geometry.attributes.color.array[vertex * 3] === 3 && geometry.attributes.color.normalized, 'raw normalized attribute');
  }
  assert(geometry.attributes.jointId.gpuType === T.IntType && geometry.attributes.jointId.usage === T.DynamicDrawUsage && geometry.attributes.jointId.name === 'joint-ids', 'integer GPU attribute state');
  assert(disposed === 0 && originalGeometry.attributes.position.array.every((value, i) => value === originalPosition[i]), 'shared resources untouched');
}
// Unsupported/incompatible cases stay as the original objects (no hidden conversions).
const retained = new T.Group();
const addPair = (mutate, otherMaterial = material) => {
  const one = new T.Mesh(triangle(), material), two = new T.Mesh(triangle(), otherMaterial);
  one.userData.static = two.userData.static = true; mutate(one); retained.add(one, two);
  // Make the other mesh a different rendering batch for each pair.
  one.renderOrder = two.renderOrder = retained.children.length;
};
addPair(mesh => { mesh.userData.static = false; });
addPair(mesh => {}, material.clone());
addPair(mesh => { mesh.geometry.setAttribute('uv', new T.Float32BufferAttribute([0,0,1,0,0,1], 2)); });
addPair(mesh => { mesh.scale.x = -1; });
addPair(mesh => { mesh.scale.x = 0; });
addPair(mesh => { mesh.geometry.addGroup(0,3,0); });
addPair(mesh => { mesh.geometry.setDrawRange(0,3); });
addPair(mesh => { mesh.geometry.morphAttributes.position = [mesh.geometry.attributes.position.clone()]; mesh.updateMorphTargets(); });
addPair(mesh => { mesh.geometry.attributes.position = new T.BufferAttribute(new Int16Array(9), 3, true); });
addPair(mesh => { mesh.onBeforeRender = () => {}; });
addPair(mesh => { mesh.layers.set(2); });
addPair(mesh => { mesh.material = new T.MeshLambertMaterial({ transparent: true }); });
addPair(mesh => { mesh.material = new T.MeshLambertMaterial({ depthTest: false }); });
addPair(mesh => { mesh.material = new T.MeshLambertMaterial({ stencilWrite: true }); });
addPair(mesh => { mesh.geometry.index.array[1] = 100; });
addPair(mesh => { mesh.geometry.attributes.normal.gpuType = T.IntType; });
addPair(mesh => { mesh.geometry.attributes.normal.setUsage(T.DynamicDrawUsage); });
const skinned = new T.SkinnedMesh(triangle(), material); skinned.userData.static = true;
const instanced = new T.InstancedMesh(triangle(), material, 2); instanced.userData.static = true;
retained.add(skinned, instanced);
const before = retained.children.slice(); mergeStaticMeshes(retained);
assert(retained.children.length === before.length && retained.children.every((mesh, i) => mesh === before[i]), 'unsupported/incompatible cases retained');
if (TIER === 2) {
  const large = new T.Group();
  for (let i = 0; i < 2; i++) {
    const geometry = new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array(32769 * 3), 3));
    const mesh = new T.Mesh(geometry, material); mesh.userData.static = true; large.add(mesh);
  }
  mergeStaticMeshes(large);
  assert(large.children.length === 2 && large.children.every(mesh => mesh.geometry.attributes.position.count <= 65535 && mesh.geometry.index.array instanceof Uint16Array), 'large merge re-splits to 16-bit geometry');
  assert(large.children.reduce((sum, mesh) => sum + mesh.geometry.index.count, 0) === 65538, 'large merge retains all triangles');
}
console.log('three-pi material-merge PASS', T.REVISION, TIER);
