// glTF in zinc:3d (ZN-658): assets/model.glb (tests/data/zinc3d_gltf/make_model.py) or, with the argument `obj`, its OBJ export drawn with
// the same materials; tests/t1/zinc3d_gltf.sh compares the two frames. `load <file>` only loads a file and prints what it holds.
import { onFrame, width, height, image } from 'zinc:gfx';
import * as sys from 'zinc:sys';
import { Scene, Camera, Node, Material, Light, loadObj } from 'zinc:3d';
import { loadGltf } from 'zinc:3d/gltf';

/** Nodes, nodes with a mesh, and their triangles. */
function count(n: Node): number[] {
  const m = n.mesh;
  const c = [1, m !== null ? 1 : 0, m !== null ? m.triangles : 0];
  for (const k of n.children) { const d = count(k); for (let i = 0; i < 3; i++) c[i] += d[i]; }
  return c;
}

const args = sys.args();
const scene = new Scene();
scene.background = 0x202830;
scene.lights.push(new Light(-0.5, -1, -0.7, 0xffffff));
if (args.length > 1 && args[0] === 'load') {
  const c = count(loadGltf(args[1]));
  console.log(`loaded: ${c[0]} nodes, ${c[1]} with a mesh, ${c[2]} triangles`);
  sys.exit(0);
}
if (args.length > 0 && args[0] === 'obj') {
  const checker = new Material(0xffffff);
  checker.texture = image('checker.png');
  const painted = new Material(0xffffff);
  painted.vertexColors = true;
  scene.add(new Node(loadObj('base.obj'), checker));
  scene.add(new Node(loadObj('top.obj'), painted));
} else {
  const model = loadGltf('model.glb');
  const c = count(model);
  console.log(`model.glb: ${c[0]} nodes, ${c[1]} with a mesh, ${c[2]} triangles`);
  scene.add(model);
}
const camera = new Camera().setPosition(1.6, 1.2, 2.4).lookAt(0, 0.1, 0);
camera.pixelRatio = 1;
onFrame((dt: number) => { camera.render(scene, 0, 0, width(), height()); });
