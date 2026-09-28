// Visual regression for determinism: an interval, Date.now and Math.random drive the picture, so these frames match
// their goldens only when the clock is virtual, timers fire in order and the random sequence is seeded.
// zinc-test: frames 20,60
import { onFrame, clear, rrect, font, drawText } from 'zinc:gfx';

interface Dot { x: number; y: number; born: number; color: u32 }
const COLORS: u32[] = [0xef4444, 0xf59e0b, 0x22c55e, 0x3b82f6, 0xa855f7];
const dots: Dot[] = [];
const t0 = Date.now();
let ticks: i32 = 0;
Math.seed(7);
setInterval(() => {
  ticks++;
  dots.push({ x: 20 + Math.random() * 280, y: 40 + Math.random() * 180, born: Date.now(), color: COLORS[ticks % 5] });
}, 100);
const sans = font('sans', 12);
onFrame((dt: number) => {
  clear(0x0f172a);
  const now = Date.now();
  for (const d of dots) {
    const r = 4 + (now - d.born) / 50;
    rrect(d.x - r, d.y - r, r * 2, r * 2, r, d.color, 160);
  }
  drawText(sans, 8, 8, `t=${Math.round(now - t0)}ms dots=${dots.length}`, 0xe2e8f0, 255, 0);
});
