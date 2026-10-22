import { onFrame, clear, rrect, width, height } from 'zinc:gfx';

let t = 0;
onFrame((dt: number) => {
  t += dt;
  clear(0x1c1b20);
  const r = 40 + 10 * Math.sin(t * 2);
  rrect(width() / 2 - r, height() / 2 - r, r * 2, r * 2, r, 0x9388ff, 255);
});
