import { onFrame, clear, rrect, rect, width, height } from 'zinc:gfx';

function rgb(red: number, green: number, blue: number): u32 {
  return Math.round(red) * 65536 + Math.round(green) * 256 + Math.round(blue);
}

const SPEED = 160;   // pixels per second
const SIZE = 60;
let x = 0;           // the left edge of the ball
let time = 0;        // seconds since the start
let told = false;

onFrame((dt: number) => {
  time += dt;
  x += SPEED * dt;
  if (x > width()) x = -SIZE;

  if (!told && time >= 1) {
    console.log(`After ${time.toFixed(2)} seconds the ball is at x = ${Math.round(x)}.`);
    told = true;
  }

  const glow = (Math.sin(time * 2) + 1) / 2;   // goes from 0 to 1 and back, again and again
  clear(rgb(20, 20, 40 + 60 * glow));
  rect(0, height() - 40, width(), 40, 0x2f8f57);
  rrect(x, height() - 40 - SIZE, SIZE, SIZE, SIZE / 2, rgb(255, 120 + 100 * glow, 60), 255);
});
