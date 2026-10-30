import { onFrame, clear, rrect, height } from 'zinc:gfx';

const SPEED = 160;   // pixels per second
const SIZE = 60;
let x = 0;           // the left edge of the ball

onFrame((dt: number) => {
  clear(0x141428);
  rrect(x, height() - SIZE - 40, SIZE, SIZE, SIZE / 2, 0xff9a3c, 255);
});
