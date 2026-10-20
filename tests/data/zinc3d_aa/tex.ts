// Texture filtering on the GPU (ZN-657): a 4 x 4 checkerboard magnified on two quads; the left one's material asks for the nearest texel,
// the right one follows the renderer's `filter` option (ZINC_3D_FILTER in tests/t1/zinc3d_aa.sh).
import { onFrame, width, height, createImage, beginImage, endImage, rect } from 'zinc:gfx';
import { Scene, Camera, Node, Material, plane, Shading, Filter, render } from 'zinc:3d';

const img = createImage(4, 4);
beginImage(img);
for (let y: i32 = 0; y < 4; y++) for (let x: i32 = 0; x < 4; x++) rect(x, y, 1, 1, (x + y) % 2 === 0 ? 0xffffff : 0x000000);
endImage();
const scene = new Scene();
const quad = (x: number, filter: Filter): void => {
  const m = new Material(0xffffff);
  m.shading = Shading.Unlit; m.texture = img; m.filter = filter; m.doubleSided = true;
  const n = new Node(plane(1.8, 1.8, 1, 1), m);
  n.setPosition(x, 0, 0); n.setRotation(Math.PI / 2, 0, 0);
  scene.add(n);
};
quad(-1, Filter.Nearest);
quad(1, Filter.Default);
const camera = new Camera().setPosition(0, 0, 3).lookAt(0, 0, 0);
camera.pixelRatio = 1;
onFrame((dt: number) => { render(scene, camera, 0, 0, width(), height()); });
