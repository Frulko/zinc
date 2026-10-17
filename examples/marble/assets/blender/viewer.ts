// The marble course's art seen by zinc:3d (make.sh runs it headless and keeps its frame): the sample course of course.json built from
// the .zmesh pieces of models/<VARIANT>/ (low: PSP, PS2, 3DS; high: desktop, Vita). Each piece is loaded once; its placements share
// its meshes. Prints the pieces, the placements and the triangles zinc:3d drew.
import { onFrame, width, height } from 'zinc:gfx';
import { env } from 'zinc:sys';
import { readText } from 'zinc:assets';
import { Scene, Camera, Light, Node, render, loadModel } from 'zinc:3d';

interface Placement { piece: string; x: number; y: number; z: number; yaw: number; }
interface Course { placements: Placement[]; }

const variant = env('VARIANT') === 'high' ? 'high' : 'low';
const course: Course = JSON.parse(readText('course.json'));
const pieces = new Map<string, Node>();
const scene = new Scene();
scene.background = 0xbcd4f0;
scene.ambient = 0x707070;
scene.lights.push(new Light(-0.45, -1, -0.55, 0xffffff));
for (const p of course.placements) {
  let src = pieces.get(p.piece);
  if (src === undefined) {
    src = loadModel(`models/${variant}/${p.piece}.zmesh`);
    pieces.set(p.piece, src);
  }
  const n = new Node(null, null);
  for (const part of src.children) n.add(new Node(part.mesh, part.material));
  n.setPosition(p.x, p.y, p.z).setRotation(0, p.yaw * Math.PI / 180, 0);
  scene.add(n);
}
const camera = new Camera();
camera.setPosition(7.5, 9, 11.5).lookAt(0, 0.2, -0.5);   // the Blender preview's camera (lens 30 mm at 960 x 544)
camera.fov = 37.6;
camera.far = 150;
let frame = 0;
onFrame((dt: number) => {
  const tris = render(scene, camera, 0, 0, width(), height());
  if (frame++ === 1) console.log(`${variant}: ${pieces.size} pieces, ${course.placements.length} placements, ${tris} triangles drawn`);
});
