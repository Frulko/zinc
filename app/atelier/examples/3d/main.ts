// 3D: zinc:3d draws shapes (meshes) with a colour (a material), lit by a light and seen by a camera. Move the pointer
// left and right: the camera turns around them.
import { onFrame, width, height, pointerX } from 'zinc:gfx';
import { Scene, Node, Material, Light, Camera, cube, torus, render } from 'zinc:3d';

const scene = new Scene();
scene.background = 0x1c1b20;
scene.ambient = 0x403c50;
scene.lights.push(new Light(-0.4, -0.8, -1, 0xffffff));   // the direction the light goes: down and away from the front
scene.lights.push(new Light(0.8, -0.2, 0.4, 0x8070a0));   // a softer one from the other side
const box = scene.add(new Node(cube(1.4), new Material(0x9388ff)));
const ring = scene.add(new Node(torus(1.8, 0.16, 48, 12), new Material(0xe8b060)));
const camera = new Camera();

let t = 0;
onFrame((dt: number) => {
  t += dt;
  box.setRotation(t * 0.6, t, 0);
  ring.setRotation(1.2 + Math.sin(t) * 0.3, t * 0.5, 0);   // angles in radians around x, y and z
  const angle = (pointerX() / width() - 0.5) * 3;   // the pointer from the left to the right edge: about half a turn
  camera.setPosition(Math.sin(angle) * 5, 2, Math.cos(angle) * 5).lookAt(0, 0, 0);
  render(scene, camera, 0, 0, width(), height());
});
