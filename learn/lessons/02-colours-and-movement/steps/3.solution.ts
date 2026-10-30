import { onFrame, clear, rrect, width, height } from 'zinc:gfx';

const SPEED = 160;   // pixels per second
const SIZE = 60;
let x = 0;           // the left edge of the ball
let time = 0;        // seconds since the start

onFrame((dt: number) => {
  time += dt;
  x += SPEED * dt;
  if (x > width()) x = -SIZE;
  const glow = (Math.sin(time * 2) + 1) / 2;   // from 0 to 1 and back
  clear(Math.round(40 + 60 * glow));
  rrect(x, height() - SIZE - 40, SIZE, SIZE, SIZE / 2, 0xff9a3c, 255);
});
