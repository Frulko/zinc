import { onFrame, clear, rect, rrect, border, shadow, clip, unclip, font, drawText, gradient, line, polygon } from 'zinc:gfx';
let seed = 12345;
function rnd(n: number): number { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; }
// B8: 4 layers with rounded clips and translucent fills
onFrame((dt: number) => {
  clear(0x0f172a);
  for (let l = 0; l < 4; l++) {
    clip(40 + l * 60, 40 + l * 40, 700, 460, 24);
    for (let i = 0; i < 150; i++) rrect(rnd(900), rnd(560), 60 + rnd(120), 40 + rnd(80), 12, 0x2563eb + l * 0x200000 + rnd(0x2000), 110);
    unclip();
  }
});
