import { onFrame, clear } from 'zinc:gfx';
import { scene, BOX_X, BOX_Y } from './scene';

onFrame((dt: number) => {
  clear(0x1c1b20);
  scene(BOX_X, BOX_Y);
});
