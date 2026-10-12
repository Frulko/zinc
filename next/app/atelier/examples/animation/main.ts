// Animation: `dt` is the time since the last frame, in seconds. Speeds are per second, so the ball moves the same
// on a fast and on a slow machine.
import { onFrame, clear, rrect, width, height } from 'zinc:gfx';

let x = 80, y = 60;          // where the ball is
let vx = 220, vy = 0;        // its speed, in pixels per second
const r = 22;
let bounces = 0;

onFrame((dt: number) => {
  vy += 1200 * dt;           // gravity
  x += vx * dt;
  y += vy * dt;
  if (x < r || x > width() - r) { vx = -vx; x = Math.max(r, Math.min(width() - r, x)); }
  if (y > height() - r) {
    y = height() - r;
    vy = -vy * 0.86;         // it loses a little at each bounce
    bounces++;
    if (bounces % 5 === 0) console.log(`${bounces} bounces`);
    if (Math.abs(vy) < 120) vy = -900;   // and gets a kick when it is about to stop
  }
  clear(0x1c1b20);
  rrect(x - r, height() - 8, r * 2, 6, 3, 0x000000, 90);   // its shadow
  rrect(x - r, y - r, r * 2, r * 2, r, 0x9388ff, 255);
});
