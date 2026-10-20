import { onFrame, clear, rect, rrect, border, shadow, clip, unclip, font, drawText, gradient, line, polygon } from 'zinc:gfx';
let seed = 12345;
function rnd(n: number): number { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; }
// B10: one primitive of every kind and option
onFrame((dt: number) => {
  clear(0xffffff);
  const f = font('sans', 16);
  rect(10, 10, 80, 50, 0xff0000);
  rrect(100, 10, 80, 50, 12, 0x00aa00, 255);
  rrect(190, 10, 80, 50, 12, 0x0000ff, 128);
  gradient(280, 10, 80, 50, 8, 0xff0000, 0x0000ff, true, 255);
  gradient(370, 10, 80, 50, 8, 0xff0000, 0x0000ff, false, 255);
  border(460, 10, 80, 50, 12, 3, 0x000000, 255);
  shadow(560, 10, 80, 50, 12, 16, 0x000000, 120);
  rrect(560, 10, 80, 50, 12, 0xffffff, 255);
  line(10, 100, 200, 160, 0x333333);
  polygon([220, 100, 300, 100, 260, 170], 0x9333ea, 255);
  drawText(f, 330, 100, 'Matrix 0123', 0x111111, 255, 0);
  clip(450, 100, 100, 60, 16);
  rect(440, 90, 200, 200, 0xf97316);
  unclip();
});
