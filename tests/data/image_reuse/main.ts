// A runtime image that is destroyed, then created again, takes the slot and the id of the old one: whatever draws it must show the new
// pixels. With `--swap` the texture of the quad starts red and is replaced by a blue image on the third frame; without it the texture is
// blue from the start. The last frames must be the same (zinc:3d's GPU renderer kept the red texture: same id, same version).
import { onFrame, width, height, createImage, destroyImage, beginImage, endImage, rect } from 'zinc:gfx';
import { args } from 'zinc:sys';
import { Scene, Camera, Node, Material, Mesh, Shading } from 'zinc:3d';

const swap = args().indexOf('--swap') >= 0;
const scene = new Scene();
const camera = new Camera();
camera.ortho = true;
camera.height = 200;
const material = new Material(0xffffff);
material.shading = Shading.Unlit;
scene.add(new Node(new Mesh([-0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0], [0, 1, 2, 0, 2, 3], [], [0, 0, 0, 1, 1, 1, 1, 0], []), material)).setScale(240, 160, 1);

function painted(color: u32): i32 {
  const i = createImage(64, 64);
  beginImage(i);
  rect(0, 0, 64, 64, color);
  rect(8, 8, 20, 20, 0xffffff);
  endImage();
  return i;
}
let texture: i32 = -1, n: i32 = 0;
onFrame((dt: number) => {
  if (n === 0) texture = painted(swap ? 0xcc2222 : 0x2244cc);
  if (n === 2 && swap) { destroyImage(texture); texture = painted(0x2244cc); }
  material.texture = texture;
  camera.render(scene, 0, 0, width(), height());
  n++;
});
