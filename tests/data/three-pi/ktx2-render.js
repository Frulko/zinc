// Direct short feature proof, not a tier or a benchmark: real GLTFLoader's embedded KTX2 blob path.
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readBytes } from 'zinc:fs';
import { createKTX2Loader } from 'zinc:three-pi';
const assert = (value, message) => { if (!value) throw new Error(message); };
const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
const gl = canvas.getContext(T.REVISION === '162' ? 'webgl' : 'webgl2');
const renderer = new T.WebGLRenderer({ canvas, context: gl }); renderer.setSize(32, 32, false);
const manager = new T.LoadingManager();
let completed = 0, failures = 0;
manager.onLoad = () => completed++; manager.onError = () => failures++;
const ordinary = new T.Loader(manager), ktx2Loader = createKTX2Loader(renderer, ordinary);
assert(ktx2Loader !== ordinary, 'run renderer proof with --profile rpi1');
const camera = new T.OrthographicCamera(-1, 1, 1, -1, .1, 10); camera.position.z = 2;
for (const name of ['opaque', 'alpha']) {
  const textureBytes = new Uint8Array(readBytes('tests/data/three-pi/ktx2/' + name + '.ktx2'));
  const buffer = new Uint8Array(92 + textureBytes.length);
  new Float32Array(buffer.buffer, 0, 12).set([-.9,-.9,0, .9,-.9,0, .9,.9,0, -.9,.9,0]);
  new Float32Array(buffer.buffer, 48, 8).set([0,0,1,0,1,1,0,1]);
  new Uint16Array(buffer.buffer, 80, 6).set([0,1,2,0,2,3]); buffer.set(textureBytes, 92);
  const uri = 'data:application/octet-stream;base64,' + btoa(String.fromCharCode(...buffer));
  const source = {
    asset: { version: '2.0' }, extensionsUsed: ['KHR_texture_basisu', 'KHR_materials_unlit'], extensionsRequired: ['KHR_texture_basisu'],
    buffers: [{ byteLength: buffer.length, uri }],
    bufferViews: [{ buffer: 0, byteLength: 48 }, { buffer: 0, byteOffset: 48, byteLength: 32 },
      { buffer: 0, byteOffset: 80, byteLength: 12 }, { buffer: 0, byteOffset: 92, byteLength: textureBytes.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-.9,-.9,0], max: [.9,.9,0] },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC2' }, { bufferView: 2, componentType: 5123, count: 6, type: 'SCALAR' }],
    images: [{ bufferView: 3, mimeType: 'image/ktx2' }], textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }],
    materials: [{ extensions: { KHR_materials_unlit: {} }, pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, alphaMode: name === 'alpha' ? 'BLEND' : 'OPAQUE' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
  };
  const result = await new GLTFLoader(manager).setKTX2Loader(ktx2Loader).parseAsync(JSON.stringify(source), '');
  const mesh = result.scene.children[0], texture = mesh.material.map;
  assert(texture.mipmaps.length === 4 && texture.flipY === false, 'GLTFLoader retained mips/flags');
  if (name === 'alpha') assert(texture.isDataTexture && texture.image.data[3] === 128, 'embedded alpha preserved');
  renderer.setClearColor(0x000000, 1); renderer.render(result.scene, camera);
  const pixel = new Uint8Array(4); gl.readPixels(16, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  assert(Math.abs(pixel[0] - (name === 'alpha' ? 128 : 255)) < 5 && pixel[1] < 8 && pixel[2] < 8, 'sampled ' + name + ' red framebuffer: ' + pixel);
  assert(gl.getError() === gl.NO_ERROR, 'GL error after KTX2 render');
  console.log('three-pi ktx2-render PASS', T.REVISION, name, texture.isCompressedTexture ? 'ETC1' : 'RGBA32', pixel.join(','));
  mesh.geometry.dispose(); mesh.material.dispose(); texture.dispose();
}
// Non-extreme colors distinguish a preserved sRGB declaration from linear data.
for (const [name, expected] of [['mid-srgb', [128,96,64]], ['mid-linear', [188,165,137]], ['premul', [64,48,32]]]) {
  const bytes = new Uint8Array(readBytes('tests/data/three-pi/ktx2/' + name + '.ktx2'));
  const texture = await new Promise((resolve, reject) => ktx2Loader.parse(bytes.buffer, resolve, reject));
  const material = new T.MeshBasicMaterial({ map: texture });
  const scene = new T.Scene(), mesh = new T.Mesh(new T.PlaneGeometry(1.8, 1.8), material); scene.add(mesh);
  assert(texture.colorSpace === (name === 'mid-linear' ? T.LinearSRGBColorSpace : T.SRGBColorSpace), 'DFD transfer maps to colorSpace');
  assert(texture.premultiplyAlpha === (name === 'premul'), 'DFD premultiplied flag retained');
  renderer.render(scene, camera);
  const pixel = new Uint8Array(4); gl.readPixels(16, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  assert(expected.every((value, i) => Math.abs(value - pixel[i]) < 6), 'sampled ' + name + ' transfer/premultiplication: ' + pixel);
  assert(gl.getError() === gl.NO_ERROR, 'GL error after ' + name);
  console.log('three-pi ktx2-color PASS', T.REVISION, name, pixel.join(','));
  mesh.geometry.dispose(); material.dispose(); texture.dispose();
}
await new Promise(resolve => setTimeout(resolve, 0));
assert(completed > 0 && failures === 0, 'LoadingManager completes after decode');
// Decoding failure must notify once, settle the manager, and leave the loader reusable.
const before = completed;
await new Promise(resolve => ktx2Loader.load('data:application/octet-stream;base64,AA==', () => { throw new Error('invalid KTX2 loaded'); }, undefined, () => resolve()));
await new Promise(resolve => setTimeout(resolve, 0));
assert(completed > before && failures === 1, 'decode error settles manager');
const saved = T.FileLoader.prototype.load, beforeThrow = completed;
try {
  T.FileLoader.prototype.load = () => { throw new Error('synchronous transport failure'); };
  let errors = 0;
  ktx2Loader.load('bad', undefined, undefined, error => { assert(/synchronous/.test(error.message), 'sync error callback'); errors++; });
  assert(errors === 1 && completed > beforeThrow && failures === 2, 'synchronous failure settles manager');
} finally { T.FileLoader.prototype.load = saved; }
ktx2Loader.dispose(); renderer.dispose();
