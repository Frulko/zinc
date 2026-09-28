// zinc:3d: primitives, OBJ parsing (plain and v/t/n faces), transforms, and a few rendered frames (smoke test: the
// rasterizer's output is checked by screenshots, see docs/plugins/3d.md).
import { onFrame, quit } from 'zinc:gfx';
import { Scene, Camera, Node, Material, Mesh, cube, sphere, plane, torus, parseObj, mat4, mat4Compose, quatFromEuler, render } from 'zinc:3d';

const meshes: Mesh[] = [cube(1), sphere(1, 8, 6), plane(2, 2, 3, 2), torus(1, 0.3, 8, 6)];
for (const m of meshes) console.log('mesh', m.vertices, m.triangles);
const quad = parseObj('# quad\nv 0 0 0\nv 1 0 0 1 0 0\nv 1 1 0\nv 0 1 0\n\nf 1 2 3 4\n');
console.log('plain obj', quad.vertices, quad.triangles);
const refs = parseObj('v 0 0 0\nv 1 0 0\nv 1 1 0\nvt 0 0\nvt 1 0\nvn 0 0 1\nf 1/1/1 2/2/1 3/1/1\nf 1/1/1 3/1/1 -1/2/1\n');
console.log('v/t/n obj', refs.vertices, refs.triangles);
const m = mat4Compose(mat4(), [1, 2, 3], quatFromEuler(0, Math.PI / 2, 0, [0, 0, 0, 1]), [2, 2, 2]);
console.log('rotate y 90: x ->', Math.abs(m[0]) < 0.01, Math.abs(m[2] + 2) < 0.01, 'translation', m[12], m[13], m[14]);

const scene = new Scene();
const mat = new Material(0xff8000);
const box = scene.add(new Node(meshes[0], mat));
box.add(new Node(meshes[3], mat)).setPosition(0, 1, 0);
const camera = new Camera().setPosition(0, 1, 4).lookAt(0, 0, 0);
let frames: i32 = 0;
onFrame((dt: number) => {
  box.setRotation(0, frames * 0.1, 0);
  render(scene, camera, 0, 0, 64, 48);
  frames++;
  if (frames === 3) {
    console.log('rendered', frames, 'frames');
    for (const x of meshes) x.dispose();
    camera.dispose();
    quit();
  }
});
