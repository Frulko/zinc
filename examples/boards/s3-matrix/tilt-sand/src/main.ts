// tilt-sand: coloured grains of sand in the 8x8 box; tilt the board and they pour to the lower side, shake it and
// they fly everywhere. On the Mac: arrow keys or a mouse drag tilt the emulated board, Space shakes it.
import { onFrame, clear, rect, width, height } from 'zinc:gfx';
import * as imu from 'zinc:imu';
import { Sand } from './sand';

const GRAINS: i32 = 26;
const FLAT = 0.12;  // tilt (sine of the angle) below which the sand stays put

const sand = new Sand(width(), height());
for (let i: i32 = 0; i < GRAINS; i++) sand.drop(rainbow(i / GRAINS));

/** Saturated colour around the colour wheel, h in 0..1. */
function rainbow(h: number): u32 {
  const k = (n: number): number => {
    const t = (n + h * 6) % 6;
    return Math.max(0, Math.min(1, Math.min(t, 4 - t)));
  };
  return (Math.round(k(5) * 255) << 16) | (Math.round(k(3) * 255) << 8) | Math.round(k(1) * 255);
}

/** -1, 0 or 1: the direction of a tilt component, 0 when it is small next to the other one (8 directions). */
function dir(v: number, mag: number): i32 { return Math.abs(v) < mag * 0.38 ? 0 : v > 0 ? 1 : -1; }

let timer = 0;
onFrame((dt: number) => {
  imu.update(dt);
  if (imu.shaken()) sand.scatter();
  const tx = imu.tiltX(), ty = imu.tiltY();
  const mag = Math.sqrt(tx * tx + ty * ty);
  timer -= dt;
  if (mag > FLAT && timer <= 0) {
    sand.step(dir(tx, mag), dir(ty, mag));
    timer = Math.min(0.3, Math.max(0.03, 0.08 / mag));  // steeper = faster
  }

  clear(0x000000);
  for (let y: i32 = 0; y < sand.rows; y++)
    for (let x: i32 = 0; x < sand.cols; x++) {
      const c = sand.at(x, y);
      if (c !== 0) rect(x, y, 1, 1, c);
    }
});
