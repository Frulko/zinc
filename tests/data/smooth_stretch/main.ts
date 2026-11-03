import { onFrame, clear, imageFromPixels, drawImageRect, ImageFlag, quit } from 'zinc:gfx';

// ImageFlag.Smooth over a seeded noise field, at the ratios that take the vector path (a small picture stretched far, whole or part of the
// screen, with and without alpha) and the one that does not (shrunk): the frame is pinned by a hash (tests/t0/smooth_stretch.sh).
const W = 40, H = 30;
const px: u8[] = [];
let seed = 12345;
for (let i = 0; i < W * H * 4; i++) {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  px.push(i % 4 === 3 ? 255 : (seed >> 16) & 255);
}
const tex = imageFromPixels(px, W, H);
let n = 0;
onFrame((dt: number) => {
  clear(0x102030);
  drawImageRect(tex, 0, 0, W, H, 0, 0, 400, 300, 255, ImageFlag.Smooth);     // 10x
  drawImageRect(tex, 0, 0, W, H, 410, 5, 77, 61, 255, ImageFlag.Smooth);      // 1.9x, odd sizes
  drawImageRect(tex, 5, 5, 20, 12, 10, 310, 330, 130, 120, ImageFlag.Smooth); // a part, with alpha
  drawImageRect(tex, 0, 0, W, H, 350, 320, 30, 20, 255, ImageFlag.Smooth);    // shrunk
  drawImageRect(tex, 0, 0, W, H, 470, 10, -64, 64, 255, ImageFlag.Smooth);    // mirrored by a negative width
  if (++n > 1) quit();
});
