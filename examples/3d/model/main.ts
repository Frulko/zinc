// 3d/model: an OBJ model from the assets (vertex colours, computed normals) on a checkered floor.
// Left/Right orbit, Up/Down zoom, A toggles perspective / orthographic, B toggles smooth / flat shading.
import { onFrame, width, height, font, drawText, rrect, isDown, wasPressed, Btn, createImage, beginImage, endImage, rect } from 'zinc:gfx';
import { clock } from 'zinc:sys';
import { Scene, Camera, Node, Material, Light, Shading, loadObj, plane, render } from 'zinc:3d';

const scene = new Scene();
scene.background = 0x87a8d0;
scene.ambient = 0x404850;
scene.lights.push(new Light(-0.4, -1, -0.5, 0xffffff));
scene.lights.push(new Light(0.8, 0.2, 0.6, 0x303050));

const paint = new Material(0xffffff);
paint.vertexColors = true;
const rocketMesh = loadObj('rocket.obj');
const rocket = scene.add(new Node(rocketMesh, paint)).setPosition(0, 0.3, 0);

// 2x2 checker drawn once into a runtime image, repeated once per floor cell
const checker = createImage(2, 2);
let painted = false;
const ground = new Material(0xffffff);
ground.texture = checker;
scene.add(new Node(plane(10, 10, 10, 10), ground)).setPosition(0, -1.6, 0).setScale(1, 1, 1);

const camera = new Camera();
let yaw = 0.4, dist = 6;
const ui = font('sans', 12);
let t = 0, ms = 0;

onFrame((dt: number) => {
  if (!painted) {
    beginImage(checker);
    rect(0, 0, 2, 2, 0x5a6b50); rect(0, 0, 1, 1, 0x7d8f6a); rect(1, 1, 1, 1, 0x7d8f6a);
    endImage();
    painted = true;
  }
  t += dt;
  if (isDown(Btn.Left)) yaw -= dt * 1.5;
  if (isDown(Btn.Right)) yaw += dt * 1.5;
  if (isDown(Btn.Up)) dist = Math.max(3, dist - dt * 4);
  if (isDown(Btn.Down)) dist = Math.min(15, dist + dt * 4);
  if (wasPressed(Btn.A)) camera.ortho = !camera.ortho;
  if (wasPressed(Btn.B)) paint.shading = paint.shading === Shading.Flat ? Shading.Smooth : Shading.Flat;
  camera.height = dist * 0.9;
  camera.setPosition(Math.sin(yaw) * dist, 1.5, Math.cos(yaw) * dist).lookAt(0, 0, 0);
  rocket.setRotation(0.25 * Math.sin(t), t * 0.8, 0);

  const t0 = clock();
  const tris = render(scene, camera, 0, 0, width(), height());
  ms = ms * 0.9 + (clock() - t0) * 0.1;
  rrect(6, 6, 250, 22, 6, 0x000000, 150);
  drawText(ui, 12, 10, `rocket.obj ${rocketMesh.triangles} tris  ${tris} drawn  ${ms.toFixed(1)} ms`, 0xffffff, 255, 0);
});
