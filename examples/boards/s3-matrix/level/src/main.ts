// level: a spirit level. The 2x2 bubble floats to the higher side of the board, like the air bubble in a real level;
// when the board is level (within LEVEL_DEG) it turns green and the frame glows. Behind it a dim rainbow drifts.
// The angles are printed on the serial console once per second.
// On the Mac: arrow keys or a mouse drag tilt the emulated board.
import { onFrame, clear, rect, width, height } from 'zinc:gfx';
import * as imu from 'zinc:imu';
import { rainbow, dim } from './color';

const W = width(), H = height();
const LEVEL_DEG = 2;    // "level" tolerance, degrees
const RANGE_DEG = 20;   // tilt that pushes the bubble to the edge
const SMOOTH = 8;       // bubble follows the angle with this rate (1/s): a real bubble lags a little

let bx = 0, by = 0;     // bubble offset from the centre, pixels
let hue = 0, report = 0;

onFrame((dt: number) => {
  imu.update(dt);
  const ax = imu.angleX(), ay = imu.angleY();
  // the bubble goes up-hill: opposite to where things would roll
  const reach = (W - 2) / 2;
  const tx = -Math.max(-1, Math.min(1, ax / RANGE_DEG)) * reach;
  const ty = -Math.max(-1, Math.min(1, ay / RANGE_DEG)) * reach;
  const k = Math.min(1, dt * SMOOTH);
  bx += (tx - bx) * k;
  by += (ty - by) * k;
  hue += dt * 0.08;
  report += dt;
  if (report >= 1) { report = 0; console.log(`tilt x ${ax.toFixed(1)} deg, y ${ay.toFixed(1)} deg, ${imu.temperature().toFixed(1)} C`); }

  const level = Math.abs(ax) < LEVEL_DEG && Math.abs(ay) < LEVEL_DEG;
  clear(0x000000);
  // dim diagonal rainbow background
  for (let y: i32 = 0; y < H; y++)
    for (let x: i32 = 0; x < W; x++) rect(x, y, 1, 1, dim(rainbow(hue + (x + y) / (W + H)), 0.12));
  // centre marks: the four middle LEDs' corners of the bubble's home
  const home: u32 = level ? 0x00ff40 : 0x303030;
  rect(W / 2 - 2, H / 2 - 2, 1, 1, home); rect(W / 2 + 1, H / 2 - 2, 1, 1, home);
  rect(W / 2 - 2, H / 2 + 1, 1, 1, home); rect(W / 2 + 1, H / 2 + 1, 1, 1, home);
  // the bubble, whole pixels so it stays crisp on LEDs
  const off = Math.sqrt(ax * ax + ay * ay);
  const color: u32 = level ? 0x40ff60 : off < 8 ? 0xffffff : 0xffb020;
  rect(Math.round(W / 2 - 1 + bx), Math.round(H / 2 - 1 + by), 2, 2, color);
});
