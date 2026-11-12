import T from '__THREE_SPEC__';
import { readBytes } from 'zinc:assets';
import { Node, Shading, Blend } from 'zinc:3d';
import { loadGltf, loadGltfGeometry } from 'zinc:3d/gltf';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Mesh as ThreeMesh } from 'three';
function check(ok: boolean, why: string): void { if (!ok) throw new Error(why); }
function mesh(n: Node): Node { for (const c of n.children) { if (c.mesh !== null) return c; const found = mesh(c); if (found.mesh !== null) return found; } return n; }
const documentBytes = readBytes('model.gltf');
const oldHandle = T.parse(documentBytes); check(oldHandle > 0, 'open old handle'); T.free(oldHandle);
const newHandle = T.parse(documentBytes); check(newHandle > oldHandle, 'monotonic document handle');
check(T.nodeCount(oldHandle) === 0 && !T.materialSpecular(oldHandle,0,[]) && !T.primitiveSize(oldHandle,0,0,[]), 'stale getters refused');
T.free(oldHandle); check(T.nodeCount(newHandle) === 3, 'stale close cannot close reused document');
const primitiveSize: i32[] = [];check(T.primitiveSize(newHandle,0,0,primitiveSize) && primitiveSize.join(',') === '9,3','primitive metadata preflight');
T.free(newHandle);
const handles: i32[] = [];
for (let i = 0; i < 16; i++) { const h=T.parse(documentBytes);check(h>0,'document capacity');handles.push(h); }
check(T.parse(documentBytes) === -1, 'seventeenth document refused');
for (const h of handles) T.free(h);
const geometry = loadGltfGeometry('model.gltf');
const expected: number[] = [2,0,0,2,2,0,1,0,0,2,3,0,3,3,0,2,4,0];
check(geometry.positions.length === expected.length && geometry.indices.join(',') === '0,1,2,3,4,5', 'instances/indices');
for (let i = 0; i < expected.length; i++) check(Math.abs(geometry.positions[i] - expected[i]) < 1e-9, 'scene transform');
check(loadGltfGeometry('multi-scene.gltf').indices.length === 6, 'nodes may be roots in distinct scenes');
check(loadGltfGeometry('geometry-no-images.gltf').positions.length === 18, 'geometry must not decode images');
const scene = loadGltf('model.gltf'), first = mesh(scene), material = first.material;
check(material !== null, 'material');
if (material !== null) {
  check(material.specular === 0x402010 && material.shininess === 250, 'specular factors/roughness');
  check(material.doubleSided && material.vertexColors && material.color === 0x804020, 'existing colour/side');
  check(material.opacity === 1 && material.blend === Blend.Opaque, 'unchanged 3d alpha policy');
}
const plain = mesh(loadGltf('default.gltf')).material;
check(plain !== null && plain.specular === 0 && plain.shininess === 30, 'unchanged defaults');
check(mesh(loadGltf('unlit.gltf')).material?.shading === Shading.Unlit, 'unlit');
check(mesh(loadGltf('rough.gltf')).material?.shininess === 0, 'roughness1');
check(mesh(loadGltf('smooth.gltf')).material?.shininess === 1000, 'roughness0');
let three = new GLTF();
new GLTFLoader().load('model.gltf', (loaded: GLTF): void => { three = loaded; });
const child = three.scene.children[0].children[0];
check(child instanceof ThreeMesh, 'three mesh');
if (child instanceof ThreeMesh) {
  check(child.material.type === 'MeshPhongMaterial' && child.material.specular.getHex() === 0x402010 && child.material.shininess === 250, 'three specular');
  check(child.material.opacity === .4 && child.material.transparent && child.material.vertexColors, 'three alpha/colors');
}
for (const name of ['cycle','dag','roots','bad-node','deep','node-budget','infinite-transform','missing-buffer','infinite-specular','boolean-specular','bad-specular','bad-colour','bad-roughness','texture','colour-texture','optional-texture','forbidden-specular-glossiness','forbidden-unlit','nan-positions','budget','count-normal','count-texcoord_0','count-color_0','compressed-normal','compressed-texcoord_0','compressed-color_0','compressed-cumulative']) {
  let failed = false;
  try { loadGltfGeometry(name + '.gltf'); } catch (error) { failed = true; }
  check(failed, 'must reject ' + name);
  if (name !== 'budget' && name !== 'nan-positions' && !name.startsWith('count-') && !name.startsWith('compressed-')) {
    failed = false;
    try { new GLTFLoader().load(name + '.gltf', (loaded: GLTF): void => {}); } catch (error) { failed = true; }
    check(failed, 'Three must reject ' + name);
  }
}
// A throw during document setup must not exhaust the sixteen native document slots.
for (let i = 0; i < 20; i++) {
  try { loadGltfGeometry('missing-buffer.gltf'); } catch (error) {}
}
check(loadGltfGeometry('model.gltf').indices.length === 6, 'failed load cleanup');
console.log('glTF geometry, material factors, strict failures and document cleanup passed');
