// Fog in zinc:3d: a camera looking down on three white unlit quads at view depths 5, 30 and 60, each a third of the screen's width apart,
// under a blue fog from 10 to 50. tests/t1/zinc3d_fog.sh reads the pixels: white, half blue, all blue.
import { onFrame, width, height } from 'zinc:gfx';
import { Scene, Camera, Node, Material, Fog, plane, Shading } from 'zinc:3d';

const scene = new Scene();
scene.background = 0x0000ff;
scene.fog = new Fog(0x0000ff, 10, 50);
const white = new Material(0xffffff);
white.shading = Shading.Unlit;
white.doubleSided = true;
const EYE = 60, HALF = Math.tan(Math.PI / 6) * 400 / 240;   // the visible half width at depth 1
const quads: number[][] = [[-0.5, 5], [0, 30], [0.5, 60]];   // screen x (-1..1), view depth
for (const q of quads) {
  const s = 0.3 * q[1] * HALF;
  const n = new Node(plane(s, s, 1, 1), white);
  n.setPosition(q[0] * q[1] * HALF, EYE - q[1], 0);
  scene.add(n);
}
const camera = new Camera().setPosition(0, EYE, 0.001).lookAt(0, 0, 0);
camera.near = 1;
camera.far = 100;
camera.pixelRatio = 1;
onFrame((dt: number) => { camera.render(scene, 0, 0, width(), height()); });
