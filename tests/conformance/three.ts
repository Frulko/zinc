// three (plugins/three): math, geometries, scene graph, raycasting, orbit controls, glTF parsing (an inline .gltf with
// data: URIs and a JPEG, the Box Textured .glb with an embedded PNG: CC-BY 4.0 Cesium, see docs/licenses.md) and a
// few rendered frames. Pixels are checked by screenshots (docs/plugins/three.md); this prints structure and numbers.
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { quit } from 'zinc:gfx';

function f(v: number): string { return (Math.abs(v) < 0.0005 ? 0 : v).toFixed(3); }
function v3(v: THREE.Vector3): string { return `${f(v.x)} ${f(v.y)} ${f(v.z)}`; }
function bbox(o: THREE.Object3D): string { const b = new THREE.Box3().setFromObject(o); return `[${v3(b.min)}] [${v3(b.max)}]`; }

// ---------------------------------------------------------------- math
const m = new THREE.Matrix4().compose(new THREE.Vector3(1, 2, 3), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -0.7, 1.1)), new THREE.Vector3(2, 0.5, 1.5));
const ident = m.clone().multiply(m.clone().invert());
let err = 0;
for (let i = 0; i < 16; i++) err = Math.max(err, Math.abs(ident.elements[i] - (i % 5 === 0 ? 1 : 0)));
console.log('inverse error < 1e-9:', err < 1e-9, 'determinant', f(m.determinant()));
const dp = new THREE.Vector3(), dq = new THREE.Quaternion(), ds = new THREE.Vector3();
m.decompose(dp, dq, ds);
console.log('decompose', v3(dp), v3(ds));
const orders: string[] = ['XYZ', 'YXZ', 'ZXY', 'ZYX', 'YZX', 'XZY'];
for (const order of orders) {
  const back = new THREE.Euler(0, 0, 0, order).setFromQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -0.7, 1.1, order)));
  console.log('euler round trip', order, f(back.x), f(back.y), f(back.z));
}
const qa = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
console.log('rotate x by 90 deg around y:', v3(new THREE.Vector3(1, 0, 0).applyQuaternion(qa)), 'slerp half angle', f(new THREE.Quaternion().slerp(qa, 0.5).angleTo(new THREE.Quaternion())));
console.log('colors', new THREE.Color(0xff8000).getHexString(), THREE.Color.fromStyle('rgb(0, 128, 255)').getHexString(), new THREE.Color().setHSL(0.5, 1, 0.5).getHexString(), new THREE.Color(1, 0.5, 0).getHex());

// ---------------------------------------------------------------- geometries
const geos: THREE.BufferGeometry[] = [new THREE.BoxGeometry(1, 2, 3, 2, 1, 1), new THREE.SphereGeometry(1, 8, 6), new THREE.PlaneGeometry(2, 1, 2, 2),
  new THREE.TorusGeometry(1, 0.25, 6, 12), new THREE.CylinderGeometry(0.5, 1, 2, 8), new THREE.ConeGeometry(1, 2, 6)];
for (const g of geos) {
  g.computeBoundingBox();
  const b = g.boundingBox;
  if (b !== null) console.log(g.type, g.attributes.position.count, 'vertices', g.triangles, 'triangles', `[${v3(b.min)}] [${v3(b.max)}]`);
}

// ---------------------------------------------------------------- scene graph
const scene = new THREE.Scene();
const group = new THREE.Group();
group.name = 'group';
group.position.set(2, 0, 0);
group.rotation.y = Math.PI / 2;
scene.add(group);
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x00ff00 }));
cube.name = 'cube';
cube.position.set(0, 0, 1);
group.add(cube);
scene.updateMatrixWorld();
console.log('cube world position', v3(cube.getWorldPosition(new THREE.Vector3())), 'box', bbox(cube), 'found', scene.getObjectByName('cube') !== null);
cube.lookAt(3, 0, 5);
console.log('cube looks along', v3(cube.getWorldDirection(new THREE.Vector3())), 'rotation.y', f(cube.rotation.y));
group.remove(cube);
console.log('children after remove', group.children.length, cube.parent === null);

// ---------------------------------------------------------------- picking
const pickScene = new THREE.Scene();
const names: string[] = ['left', 'right', 'back'];
for (let i = 0; i < 3; i++) {
  let geo: THREE.BufferGeometry = new THREE.SphereGeometry(1.5, 16, 12);
  if (i < 2) geo = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  mesh.name = names[i];
  mesh.position.set(i === 0 ? -2 : i === 1 ? 2 : 0, 0, i === 2 ? -3 : 0);
  pickScene.add(mesh);
}
const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 100);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
const raycaster = new THREE.Raycaster();
const targets: THREE.Vector3[] = [new THREE.Vector3(-2, 0, 0), new THREE.Vector3(2, 0.3, 0), new THREE.Vector3(0.1, 0.05, -3), new THREE.Vector3(0, 3, 0)];
for (const t of targets) {
  const ndc = t.clone().project(camera);
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  const hits = raycaster.intersectObjects(pickScene.children);
  console.log('pick', v3(t), '->', hits.length > 0 ? `${hits[0].object.name} at ${f(hits[0].distance)}` : 'nothing');
}
const controls = new OrbitControls(camera, null);
controls.rotateLeft(Math.PI / 2);
controls.update();
console.log('orbit left 90 deg: camera at', v3(camera.position), 'distance', f(controls.getDistance()));
controls.dollyIn(0.5);
controls.update();
console.log('dolly in: distance', f(controls.getDistance()));

// ---------------------------------------------------------------- glTF
function describe(o: THREE.Object3D, depth: i32): void {
  let line = '  '.repeat(depth) + `${o.type} '${o.name}' at ${v3(o.position)}`;
  if (o instanceof THREE.Mesh) {
    const mat = o.material, map = mat.map;
    line += ` ${o.geometry.attributes.position.count} vertices ${o.geometry.triangles} triangles, ${mat.type} '${mat.name}' #${mat.color.getHexString()}` +
      (map !== null ? ` map ${map.width}x${map.height}` : '') + (mat.side === THREE.DoubleSide ? ' double sided' : '');
  }
  console.log(line);
  for (const c of o.children) describe(c, depth + 1);
}
function bytes(s: string): u8[] { const out: u8[] = []; for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); return out; }
function base64(s: string): u8[] {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out: u8[] = [];
  let acc = 0, bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = abc.indexOf(s.at(i));
    if (v < 0) continue;
    acc = (acc * 64 + v) % 16777216; bits += 6;
    if (bits >= 8) { bits -= 8; out.push(Math.floor(acc / Math.pow(2, bits)) % 256); }
  }
  return out;
}
const GLTF_TEXT = "{\"asset\":{\"version\":\"2.0\",\"generator\":\"zinc conformance\"},\"scene\":0,\"scenes\":[{\"name\":\"main\",\"nodes\":[0]}],\"nodes\":[{\"name\":\"Root\",\"translation\":[1,0,0],\"rotation\":[0,0.7071067811865476,0,0.7071067811865476],\"scale\":[2,2,2],\"children\":[1,2]},{\"name\":\"Quad\",\"mesh\":0},{\"name\":\"Parts\",\"mesh\":1,\"matrix\":[1,0,0,0,0,1,0,0,0,0,1,0,0,2,0,1]}],\"meshes\":[{\"name\":\"quad\",\"primitives\":[{\"attributes\":{\"POSITION\":0,\"NORMAL\":1,\"TEXCOORD_0\":2},\"indices\":3,\"material\":0}]},{\"name\":\"parts\",\"primitives\":[{\"attributes\":{\"POSITION\":0},\"indices\":4,\"mode\":5,\"material\":1},{\"attributes\":{\"POSITION\":0,\"TEXCOORD_0\":2},\"indices\":3}]}],\"materials\":[{\"name\":\"red\",\"pbrMetallicRoughness\":{\"baseColorFactor\":[1,0,0,1]},\"doubleSided\":true},{\"name\":\"photo\",\"pbrMetallicRoughness\":{\"baseColorTexture\":{\"index\":0}},\"extensions\":{\"KHR_materials_unlit\":{}}}],\"textures\":[{\"source\":0}],\"images\":[{\"uri\":\"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAADKADAAQAAAABAAAACAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgACAAMAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMABAQEBAQEBgQEBgkGBgYJDAkJCQkMDwwMDAwMDxIPDw8PDw8SEhISEhISEhUVFRUVFRkZGRkZHBwcHBwcHBwcHP/bAEMBBAUFBwcHDAcHDB0UEBQdHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHf/dAAQAAf/aAAwDAQACEQMRAD8A9n8Qajq9rrHkS219JAxJSa3VjEP7q7U5YY4Y5Bz0HHPaaDLqU1gHvoniO4hPPP7wpxhmA+6Sc4BJIGMnNW9T6Qf71aZ61zRxNarUlSlLRbaL/I4qdGKqSkm/vP/Z\"}],\"accessors\":[{\"bufferView\":0,\"componentType\":5126,\"count\":4,\"type\":\"VEC3\",\"min\":[-1,-1,0],\"max\":[1,1,0]},{\"bufferView\":1,\"componentType\":5126,\"count\":4,\"type\":\"VEC3\"},{\"bufferView\":2,\"componentType\":5126,\"count\":4,\"type\":\"VEC2\"},{\"bufferView\":3,\"componentType\":5123,\"count\":6,\"type\":\"SCALAR\"},{\"bufferView\":4,\"componentType\":5121,\"count\":4,\"type\":\"SCALAR\"}],\"bufferViews\":[{\"buffer\":0,\"byteOffset\":0,\"byteLength\":48},{\"buffer\":0,\"byteOffset\":48,\"byteLength\":48},{\"buffer\":0,\"byteOffset\":96,\"byteLength\":32},{\"buffer\":0,\"byteOffset\":128,\"byteLength\":12},{\"buffer\":0,\"byteOffset\":140,\"byteLength\":4}],\"buffers\":[{\"byteLength\":144,\"uri\":\"data:application/octet-stream;base64,AACAvwAAgL8AAAAAAACAPwAAgL8AAAAAAACAPwAAgD8AAAAAAACAvwAAgD8AAAAAAAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAgD8AAIA/AACAPwAAgD8AAAAAAAAAAAAAAAAAAAEAAgAAAAIAAwAAAQMC\"}],\"extensionsUsed\":[\"KHR_materials_unlit\"]}";
const GLB_BASE64 = 'Z2xURgIAAABEFwAAOAUAAEpTT057ImFzc2V0Ijp7ImdlbmVyYXRvciI6IkNPTExBREEyR0xURiIsInZlcnNpb24iOiIyLjAifSwic2NlbmUiOjAsInNjZW5lcyI6W3sibm9kZXMiOlswXX1dLCJub2RlcyI6W3siY2hpbGRyZW4iOlsxXSwibWF0cml4IjpbMSwwLDAsMCwwLDAsLTEsMCwwLDEsMCwwLDAsMCwwLDFdfSx7Im1lc2giOjB9XSwibWVzaGVzIjpbeyJwcmltaXRpdmVzIjpbeyJhdHRyaWJ1dGVzIjp7Ik5PUk1BTCI6MSwiUE9TSVRJT04iOjIsIlRFWENPT1JEXzAiOjN9LCJpbmRpY2VzIjowLCJtb2RlIjo0LCJtYXRlcmlhbCI6MH1dLCJuYW1lIjoiTWVzaCJ9XSwiYWNjZXNzb3JzIjpbeyJidWZmZXJWaWV3IjowLCJieXRlT2Zmc2V0IjowLCJjb21wb25lbnRUeXBlIjo1MTIzLCJjb3VudCI6MzYsIm1heCI6WzIzXSwibWluIjpbMF0sInR5cGUiOiJTQ0FMQVIifSx7ImJ1ZmZlclZpZXciOjEsImJ5dGVPZmZzZXQiOjAsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwibWF4IjpbMSwxLDFdLCJtaW4iOlstMSwtMSwtMV0sInR5cGUiOiJWRUMzIn0seyJidWZmZXJWaWV3IjoxLCJieXRlT2Zmc2V0IjoyODgsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoyNCwibWF4IjpbMC41LDAuNSwwLjVdLCJtaW4iOlstMC41LC0wLjUsLTAuNV0sInR5cGUiOiJWRUMzIn0seyJidWZmZXJWaWV3IjoyLCJieXRlT2Zmc2V0IjowLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6MjQsIm1heCI6WzYsMV0sIm1pbiI6WzAsMF0sInR5cGUiOiJWRUMyIn1dLCJtYXRlcmlhbHMiOlt7InBick1ldGFsbGljUm91Z2huZXNzIjp7ImJhc2VDb2xvclRleHR1cmUiOnsiaW5kZXgiOjB9LCJtZXRhbGxpY0ZhY3RvciI6MH0sIm5hbWUiOiJUZXh0dXJlIn1dLCJ0ZXh0dXJlcyI6W3sic2FtcGxl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';
const loader = new GLTFLoader();
const onError = (e: Error): void => { console.log('error:', e.message); };
loader.parse(bytes(GLTF_TEXT), '', (g: GLTF) => {
  console.log('gltf generator', g.asset.generator, 'scenes', g.scenes.length, 'meshes', g.meshes, 'triangles', g.triangles);
  describe(g.scene, 0);
  console.log('gltf box', bbox(g.scene));
}, onError);
loader.parse(base64(GLB_BASE64), '', (g: GLTF) => {
  console.log('glb meshes', g.meshes, 'triangles', g.triangles);
  describe(g.scene, 0);
  console.log('glb box', bbox(g.scene));
}, onError);
loader.parse(bytes('{"asset":{"version":"1.0"}}'), '', (g: GLTF) => console.log('unexpected'), onError);
loader.parse(bytes('not json'), '', (g: GLTF) => console.log('unexpected'), onError);
async function missing(): Promise<void> {
  try { await loader.loadAsync('missing.glb'); console.log('unexpected'); } catch (e) { console.log('loadAsync rejected:', e.message); }
}
missing();

// ---------------------------------------------------------------- rendering
const renderer = new THREE.WebGLRenderer();
renderer.setSize(64, 48);
pickScene.add(new THREE.AmbientLight(0xffffff, 1));
pickScene.add(new THREE.DirectionalLight(0xffffff, 2));
let frames = 0;
renderer.setAnimationLoop((time: number) => {
  pickScene.children[0].rotation.y = time / 1000;
  renderer.render(pickScene, camera);
  frames++;
  if (frames === 3) {
    console.log('rendered', renderer.info.render.frame, 'frames,', renderer.info.render.calls, 'draw calls');
    renderer.dispose();
    quit();
  }
});
