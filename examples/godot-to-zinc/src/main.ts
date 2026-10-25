import { onFrame, width, height, isDown, wasPressed, Btn, keep } from 'zinc:gfx';
import { render } from 'zinc:3d';
import { Yard } from './state';
import { drawHud } from './hud';

const yard = new Yard();
const camera = yard.revision.cameraFor('camera');
camera.lookAt(0, 0, 0);
let first = true;
onFrame((dt: number) => {
  const dx = (isDown(Btn.Right) ? 1 : 0) - (isDown(Btn.Left) ? 1 : 0);
  const dz = (isDown(Btn.Down) ? 1 : 0) - (isDown(Btn.Up) ? 1 : 0);
  const action = wasPressed(Btn.A);
  if (!first && dx === 0 && dz === 0 && !action) { keep(); return; }
  first = false;
  yard.move(dx * dt * 3, dz * dt * 3);
  if (action) yard.interact();
  render(yard.revision.scene, camera, 0, 0, width(), height());
  drawHud(yard.delivered);
});
