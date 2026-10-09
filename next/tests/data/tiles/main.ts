// Tiled painting (ZN-410): a frame of thousands of commands, enough of them hidden, goes through the tiles; tests/t1/tiles.sh compares its frame hashes with
// ZINC_TILES=0 (every frame through render()). Opaque rects close tiles; clips (rounded and nested), text, shadows, borders, gradients,
// polygons and strokes cross tile edges; the rects move, so later frames are painted through the damage rectangles.
import { onFrame, clear, rect, rrect, gradient, border, shadow, polygon, stroke, clip, unclip, font, drawText, text, width, height, quit } from 'zinc:gfx';

let seed = 12345;
function rnd(n: number): number { seed = (seed * 1103515245 + 12345) % 2147483648; return (seed / 2147483648) * n; }
const n = 6000;
const xs: number[] = [], ys: number[] = [], ss: number[] = [], cs: number[] = [];
for (let i = 0; i < n; i++) { xs.push(rnd(width())); ys.push(rnd(height())); ss.push(6 + rnd(58)); cs.push(Math.floor(rnd(16777215))); }
const sans = font('sans', 16);
let t = 0;
onFrame((dt: number) => {
  t++;
  clear(0x101820);
  for (let i = 0; i < n; i++) {
    if (i % 3 === t % 3) xs[i] = (xs[i] + 1.5) % width();
    rect(xs[i], ys[i], ss[i], ss[i] * 0.7, cs[i]);
    if (i % 600 === 7) {
      rrect(xs[i] - 20, ys[i] - 10, 90, 50, 14, 0xffcc66, 200);
      border(xs[i] - 10, ys[i] + 30, 70, 30, 8, 3, 0x3366ff, 255);
      shadow(xs[i], ys[i] - 40, 60, 24, 6, 9, 0x000000, 160);
      gradient(xs[i] + 30, ys[i] + 5, 80, 40, 10, 0xff0000, 0x0000ff, (i & 1) === 0, 255);
      polygon([xs[i], ys[i], xs[i] + 50, ys[i] + 10, xs[i] + 20, ys[i] + 45], 0x66ff99, 180);
      stroke([xs[i], ys[i] + 50, xs[i] + 60, ys[i] + 20, xs[i] + 120, ys[i] + 60], 4, 0xffffff, 255, false);
      drawText(sans, xs[i], ys[i] + 60, 'tiles ' + i, 0xffffff, 255, 0);
      text(xs[i], ys[i] - 20, 'GRID', 0xff00ff, 2);
    }
    if (i === 3000) {
      clip(100, 80, 300, 220, 24);
      rect(90, 70, 400, 400, 0x223344);
      clip(150, 120, 120, 90, 12);
      for (let k = 0; k < 40; k++) rrect(120 + k * 7, 100 + k * 3, 40, 30, 8, 0xaa33cc, 220);
      unclip();
      rect(200, 260, 300, 60, 0x55aa55);
      unclip();
    }
    if (i % 1000 === 250) { rect(xs[i], ys[i], 140, 90, 0xffffff); rrect(xs[i] + 20, ys[i] + 20, 120, 70, 0, 0x0080ff, 120); }   // a cover, then a translucent square
  }
  rect(0, 0, width(), 30, 0x000000);
  drawText(sans, 8, 6, 'frame ' + t, 0xffffff, 255, 0);
  if (t === 6) quit();
});
