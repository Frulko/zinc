// 3d/model: an OBJ model with vertex colours on a checkered floor, rendered by zinc:3d, with a 2D readout.
// Keys: Left / Right orbit, Up / Down zoom, A perspective / orthographic, B smooth / flat shading.
import { onFrame, width, height, isDown, wasPressed, Btn } from 'zinc:gfx';
import { clock } from 'zinc:sys';
import { Camera, Shading, render } from 'zinc:3d';
import { createScene, paintChecker } from './scene';
import { FrameStats, drawReadings } from './hud';

const world = createScene();
const camera = new Camera();
let yaw = 0.4, distance = 6;   // orbit angle (radians) and distance from the centre

const stats = new FrameStats('3d/model');
let t = 0, checkerPainted = false;

function handleKeys(dt: number): void {
  if (isDown(Btn.Left)) yaw -= dt * 1.5;
  if (isDown(Btn.Right)) yaw += dt * 1.5;
  if (isDown(Btn.Up)) distance = Math.max(3, distance - dt * 4);
  if (isDown(Btn.Down)) distance = Math.min(15, distance + dt * 4);
  if (wasPressed(Btn.A)) camera.ortho = !camera.ortho;
  if (wasPressed(Btn.B)) world.paint.shading = world.paint.shading === Shading.Flat ? Shading.Smooth : Shading.Flat;
}

onFrame((dt: number) => {
  if (!checkerPainted) { paintChecker(); checkerPainted = true; }   // render-to-image needs the frame loop running
  t += dt;
  handleKeys(dt);
  camera.height = distance * 0.9;   // orthographic view height follows the zoom
  camera.setPosition(Math.sin(yaw) * distance, 1.5, Math.cos(yaw) * distance).lookAt(0, 0, 0);
  world.rocket.setRotation(0.25 * Math.sin(t), t * 0.8, 0);

  const started = clock();
  const drawn = render(world.scene, camera, 0, 0, width(), height());
  stats.rendered(clock() - started, width(), height());
  stats.frame(dt);

  drawReadings(8, 8, [
    { value: `${world.mesh.triangles}`, unit: 'model tris' },
    { value: `${drawn}`, unit: 'drawn' },
    { value: stats.renderMs.toFixed(1), unit: 'ms' },
  ]);
  drawReadings(8, 38, [
    { value: camera.ortho ? 'Orthographic' : 'Perspective', unit: '(A)' },
    { value: world.paint.shading === Shading.Flat ? 'Flat' : 'Smooth', unit: '(B)' },
  ]);
});
