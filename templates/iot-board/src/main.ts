// A bubble level on a 128x64 OLED: the motion sensor every frame, the bubble, both angles and the temperature. Shake to calibrate.
import { onFrame, clear, rect, text, width, height } from 'zinc:gfx';
import * as imu from 'zinc:imu';
import { Level } from './level';

const level = new Level();
const WHITE = 0xffffff, BLACK = 0x000000;
const R = 24;   // the ring's radius in px
let calibrations: i32 = 0;

function circle(cx: number, cy: number, r: number, filled: boolean): void {   // whole pixels: crisp on a 1-bit screen
  if (filled) { for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(r * r - y * y)); rect(Math.round(cx) - w, Math.round(cy) + y, w * 2 + 1, 1, WHITE); } return; }
  const steps = Math.ceil(r * 7);
  for (let i = 0; i < steps; i++) { const a = i / steps * Math.PI * 2; rect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1, WHITE); }
}
let settle = -1;   // seconds until the board, shaken, has settled and its position becomes level

console.log(`{{name}}: ready (${imu.emulated() ? 'sensor emulated' : 'QMI8658'})`);
onFrame((dt: number) => {
  imu.update(dt);
  if (imu.shaken()) settle = 0.8;
  if (settle > 0) { settle -= dt; if (settle <= 0) { level.calibrate(imu.tiltX(), imu.tiltY()); calibrations++; console.log(`calibrated ${calibrations}`); } }
  const ax = level.angleX(imu.tiltX()), ay = level.angleY(imu.tiltY());
  clear(BLACK);
  const cx = 32, cy = height() / 2;
  circle(cx, cy, R, false);
  rect(cx - 3, cy, 7, 1, WHITE); rect(cx, cy - 3, 1, 7, WHITE);
  circle(cx + level.bubble(ax, R - 6), cy + level.bubble(ay, R - 6), 5, true);
  text(70, 6, `X ${ax.toFixed(1)}`, WHITE, 1);
  text(70, 20, `Y ${ay.toFixed(1)}`, WHITE, 1);
  text(70, 34, `${imu.temperature().toFixed(1)} C`, WHITE, 1);
  if (level.isLevel(ax, ay)) text(70, 50, 'LEVEL', WHITE, 1);
  rect(0, 0, width(), 1, BLACK);
});
