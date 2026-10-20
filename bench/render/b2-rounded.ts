import { onFrame, clear, rect, rrect, border, shadow, clip, unclip, font, drawText, gradient, line, polygon } from 'zinc:gfx';
let seed = 12345;
function rnd(n: number): number { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; }
// B2: 2k rounded quads with borders and shadows
onFrame((dt: number) => {
  clear(0xf4f4f5);
  for (let i = 0; i < 2000; i++) {
    const x = rnd(1000), y = rnd(640), w = 30 + rnd(60), h = 20 + rnd(40);
    shadow(x, y + 2, w, h, 8, 10, 0x000000, 60);
    rrect(x, y, w, h, 8, 0x3b82f6 + rnd(0x400000), 255);
    border(x, y, w, h, 8, 1, 0x1e3a8a, 255);
  }
});
