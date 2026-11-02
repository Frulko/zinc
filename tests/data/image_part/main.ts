// updatePixelsRect on a big image: a 16 x 16 rectangle of a 512 x 512 image changes each frame; a GL display uploads those 1 KB, not the 1 MB of the
// image (tests/t1/image_part_gl.sh reads ZINC_GL_STATS).
import { onFrame, clear, drawImageRect, createImage, updatePixelsRect, frameStat, ImageFlag, quit } from 'zinc:gfx';

const img = createImage(512, 512, true);
const patch: u32[] = [];
for (let i = 0; i < 256; i++) patch.push(0xFF000000 | ((i * 997) & 0xFFFFFF));
let n = 0;
onFrame(() => {
  n++;
  console.log('stat', n, frameStat(0), frameStat(2));   // the last frame's draw calls and image bytes uploaded: 0 without a GL display
  updatePixelsRect(img, patch, (n * 16) % 512, (n * 48) % 512, 16, 16);
  clear(0x202020);
  drawImageRect(img, 0, 0, 512, 512, 0, 0, 200, 200, 255, ImageFlag.Nearest);
  if (n === 10) quit();
});
