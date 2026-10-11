// The zinc:3d side of the model test (tests/t1/model.sh, ZN-441): the truck of assets/zm/truck.glb from the .zmesh the model importer made
// (MODEL=zmesh: loadModel, no parsing step) or from the GLB itself (loadGltf), seen by the same camera; prints what it loaded and the load
// times (the second loadModel finds its textures made: the geometry alone).
import { onFrame, width, height } from 'zinc:gfx';
import { env } from 'zinc:sys';
import { readBytes } from 'zinc:assets';
import { Scene, Camera, Light, Node, Mesh, render, loadModel } from 'zinc:3d';
import { loadGltf } from 'zinc:3d/gltf';

const zmesh = env('MODEL') === 'zmesh';
const name = zmesh ? 'zm/truck.zmesh' : 'truck.glb';
let t0 = performance.now();
const model: Node = zmesh ? loadModel(name) : loadGltf(name);
const first = performance.now() - t0;
t0 = performance.now();
const again: Node = zmesh ? loadModel(name) : loadGltf(name);
const second = performance.now() - t0;
let meshes = 0, tris = 0;
function count(n: Node): void {
  const m = n.mesh;
  if (m !== null) { meshes++; tris += m.triangles; }
  for (const c of n.children) count(c);
}
count(model);
t0 = performance.now();
const bytes = readBytes(name).length;   // what readBytes alone costs of the load
const read = performance.now() - t0;
console.log(`${name}: ${meshes} meshes, ${tris} triangles; loaded in ${first.toFixed(2)} ms, again in ${second.toFixed(2)} ms (${again.children.length} nodes), ` +
            `readBytes of its ${bytes} bytes ${read.toFixed(2)} ms`);

function le32(d: u8[], at: i32): i32 { return d[at] | (d[at + 1] << 8) | (d[at + 2] << 16) | (d[at + 3] << 24); }
/** Whether zinc:3d refuses the first part of `d`, a damaged copy of the file. */
function refused(d: u8[], at: i32): boolean {
  try { new Mesh([], [], [], [], [], d, at); } catch (e) { return true; }
  return false;
}
if (zmesh) {   // a damaged file is refused, never drawn: a part cut short, an index past its vertices
  const d = readBytes(name);
  let at: i32 = 16;
  for (let i = 0; i < le32(d, 8); i++) at += 4 + ((le32(d, at) + 3) & ~3);
  const nv = le32(d, at), flags = le32(d, at + 8);
  const cut = refused(d.slice(0, at + 100), at);
  const ix = at + 24 + nv * (24 + ((flags & 1) !== 0 ? 8 : 0) + ((flags & 2) !== 0 ? 4 : 0));
  d[ix] = 255; d[ix + 1] = 255;
  console.log(`damaged parts refused: cut short ${cut}, index past the vertices ${refused(d, at)}`);
  meshes = 0; tris = 0;
  count(loadModel('zm/truck.lod1.zmesh'));   // the rule's "lods": "0.5"
  console.log(`zm/truck.lod1.zmesh: ${meshes} meshes, ${tris} triangles`);
}

const scene = new Scene();
scene.background = 0x1b2230;
scene.ambient = 0x505050;
scene.lights.push(new Light(-0.4, -1, -0.6, 0xffffff));
scene.add(model);
const camera = new Camera();
camera.setPosition(4.2, 3, 5.2).lookAt(0, 1, 0);   // the truck: about -1.4..1.4, -0.1..2.6, -2.4..2.4
onFrame((dt: number) => { render(scene, camera, 0, 0, width(), height()); });
