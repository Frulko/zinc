// 3d/cubes: spinning textured cubes (baked PNG and a runtime image painted with zinc:gfx), a Gouraud torus and a
// flat-shaded sphere, with a 2D overlay (fps, render time, triangles) drawn over the 3D view.
// Left/Right orbit the camera, Up/Down zoom.
import { onFrame, width, height, image, createImage, beginImage, endImage, gradient, font, drawText, rrect, isDown, Btn } from 'zinc:gfx';
import { clock } from 'zinc:sys';
import { Scene, Camera, Node, Material, Light, Shading, cube, torus, sphere, plane, render } from 'zinc:3d';

// runtime texture: painted once with 2D commands (render-to-image)
const painted = createImage(64, 64);
let paintedReady = false;
function paint(): void {
  beginImage(painted);
  gradient(0, 0, 64, 64, 0, 0x2266ff, 0xff3399, true, 255);
  rrect(6, 6, 52, 52, 10, 0xffffff, 60);
  drawText(font('sans-bold', 20), 12, 20, 'Zn', 0xffffff, 255, 0);
  endImage();
}

const scene = new Scene();
scene.background = 0x10141c;
scene.ambient = 0x303848;
scene.lights.push(new Light(-0.5, -1, -0.6, 0xfff0e0));

const crate = new Material(0xffffff);
crate.texture = image('crate.png');
const zinc = new Material(0xffffff);
zinc.texture = painted;
const box = cube(1);
const cubes: Node[] = [];
for (let i = 0; i < 6; i++) {
  const a = i * Math.PI / 3;
  const n = scene.add(new Node(box, i % 2 === 0 ? crate : zinc)).setPosition(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6);
  cubes.push(n);
}
const gold = new Material(0xffc040);
const ring = scene.add(new Node(torus(0.9, 0.3, 32, 16), gold));
const facet = new Material(0x40d0a0);
facet.shading = Shading.Flat;
const ball = ring.add(new Node(sphere(0.45, 12, 8), facet));
const floorMat = new Material(0x808890);
floorMat.texture = image('crate.png');
scene.add(new Node(plane(12, 12, 6, 6), floorMat)).setPosition(0, -1.2, 0);

const camera = new Camera();
camera.fov = 55;
let yaw = 0.6, dist = 7;

const ui = font('sans', 12);
let t = 0, fps = 0, acc = 0, frames: i32 = 0, ms = 0, msSum = 0, msN: i32 = 0;
let hud = '';

onFrame((dt: number) => {
  if (!paintedReady) { paint(); paintedReady = true; }
  t += dt;
  if (isDown(Btn.Left)) yaw -= dt * 1.5;
  if (isDown(Btn.Right)) yaw += dt * 1.5;
  if (isDown(Btn.Up)) dist = Math.max(3, dist - dt * 4);
  if (isDown(Btn.Down)) dist = Math.min(20, dist + dt * 4);
  camera.setPosition(Math.sin(yaw) * dist, 2.5, Math.cos(yaw) * dist).lookAt(0, 0, 0);
  for (let i = 0; i < cubes.length; i++) cubes[i].setRotation(t * 0.7 + i, t * 1.1, t * 0.3 * i);
  ring.setRotation(t * 0.9, t * 0.5, 0);
  ball.setPosition(0, Math.sin(t * 2) * 0.3, 0);

  const w = width(), h = height();
  const t0 = clock();
  const tris = render(scene, camera, 0, 0, w, h);
  const r = clock() - t0;
  ms = ms * 0.9 + r * 0.1;
  msSum += r; msN++;
  if (msN === 300) { console.log(`3d/cubes ${w}x${h}: ${(msSum / msN).toFixed(2)} ms/render`); msSum = 0; msN = 0; }

  acc += dt; frames++;
  if (acc >= 0.5) { fps = frames / acc; acc = 0; frames = 0; }
  hud = `${Math.round(fps)} fps  ${ms.toFixed(1)} ms  ${tris} tris`;
  rrect(6, 6, 170, 22, 6, 0x000000, 150);
  drawText(ui, 12, 10, hud, 0xffffff, 255, 0);
});
