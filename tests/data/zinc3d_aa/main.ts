// Edges on the GPU (ZN-657): a white unlit cube turned on a black background; tests/t1/zinc3d_aa.sh counts the edge pixels that are all black
// or all white (stair steps) with multisampling off and on.
import { onFrame, width, height } from 'zinc:gfx';
import { Scene, Camera, Node, Material, cube, Shading, render } from 'zinc:3d';

const scene = new Scene();
scene.background = 0x000000;
const m = new Material(0xffffff);
m.shading = Shading.Unlit;
const box = new Node(cube(1.6), m);
box.setRotation(0.4, 0.6, 0.3);
scene.add(box);
const camera = new Camera().setPosition(0, 0, 4).lookAt(0, 0, 0);
camera.pixelRatio = 1;
onFrame((dt: number) => { render(scene, camera, 0, 0, width(), height()); });
