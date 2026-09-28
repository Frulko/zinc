// 3d/cubes: spinning textured cubes, a Gouraud torus and a flat-shaded sphere rendered by zinc:3d, with a 2D
// readout (fps, render time, triangles) drawn over the 3D view.
// Keys: Left / Right orbit the camera, Up / Down zoom.
import { onFrame, width, height, isDown, Btn } from 'zinc:gfx';
import { clock } from 'zinc:sys';
import { Camera, render } from 'zinc:3d';
import { createScene, animate, paintLogo } from './scene';
import { FrameStats, drawReadings } from './hud';

const world = createScene();
const camera = new Camera();
camera.fov = 55;
let yaw = 0.6, distance = 7;   // orbit angle (radians) and distance from the centre

const stats = new FrameStats('3d/cubes');
let t = 0, logoPainted = false;

/** Arrow keys orbit and zoom; the camera always looks at the centre. */
function moveCamera(dt: number): void {
  if (isDown(Btn.Left)) yaw -= dt * 1.5;
  if (isDown(Btn.Right)) yaw += dt * 1.5;
  if (isDown(Btn.Up)) distance = Math.max(3, distance - dt * 4);
  if (isDown(Btn.Down)) distance = Math.min(20, distance + dt * 4);
  camera.setPosition(Math.sin(yaw) * distance, 2.5, Math.cos(yaw) * distance).lookAt(0, 0, 0);
}

onFrame((dt: number) => {
  if (!logoPainted) { paintLogo(); logoPainted = true; }   // render-to-image needs the frame loop running
  t += dt;
  moveCamera(dt);
  animate(world, t);

  const w = width(), h = height();
  const started = clock();
  const triangles = render(world.scene, camera, 0, 0, w, h);
  stats.rendered(clock() - started, w, h);
  stats.frame(dt);

  drawReadings(8, 8, [
    { value: `${Math.round(stats.fps)}`, unit: 'fps' },
    { value: stats.renderMs.toFixed(1), unit: 'ms' },
    { value: `${triangles}`, unit: 'tris' },
  ]);
});
