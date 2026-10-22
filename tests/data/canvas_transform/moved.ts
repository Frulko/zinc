import { onFrame, clear, setTransform, resetTransform } from 'zinc:gfx';
import { scene, BOX_X, BOX_Y } from './scene';

onFrame((dt: number) => {
  clear(0x1c1b20);
  setTransform(1, 0, 0, 1, BOX_X, BOX_Y);   // as a zinc:stage node draws at its place
  scene(0, 0);
  resetTransform();
});
