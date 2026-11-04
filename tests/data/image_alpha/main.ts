// zinc:gfx transparent render targets and partial uploads: a target of createImage(w, h, true) keeps the transparency of what is drawn into it
// (a 50% box, a nearest-sampled sheet), shows it over the frame, and updatePixelsRect changes only its rectangle.
// tests/t1/image_alpha.sh runs it 200x100 on the software raster and on the GL replay and reads the frames.
import { onFrame, clear, rrect, drawImageRect, imageFromPixels, createImage, clearImage, beginImage, endImage, updatePixels, updatePixelsRect, ImageFlag, quit } from 'zinc:gfx';

const sheet = imageFromPixels([255, 0, 0, 255, 0, 0, 0, 0], 2, 1);   // one red texel, one transparent
const tgt = createImage(40, 20, true);
const opaque = createImage(8, 8);
const part = createImage(8, 8, true);
console.log('images', sheet >= 0, tgt >= 0, opaque >= 0, part >= 0);
const quarter: u32[] = [];
for (let i = 0; i < 64; i++) quarter.push(i < 4 ? 0x800000FF : 0);   // one row of 4 pixels of red at 50% (0xAABBGGRR), the rest clear
let n = 0;
onFrame(() => {
  n++;
  if (n === 1) {
    beginImage(tgt);
    rrect(0, 0, 10, 10, 0, 0x00C800, 128);          // green at 50% over nothing: alpha 128
    rrect(5, 5, 10, 10, 0, 0xFFFFFF, 255);          // opaque white over its corner
    rrect(20, 0, 10, 10, 0, 0xFF0000, 128);         // red 50% twice: alpha 192
    rrect(20, 0, 10, 10, 0, 0xFF0000, 128);
    drawImageRect(sheet, 0, 0, 2, 1, 0, 16, 8, 4, 255, ImageFlag.Nearest);   // 4 red pixels then 4 transparent, exactly
    endImage();
    updatePixels(part, quarter, false);
    updatePixelsRect(part, [0xFF00FF00, 0xFF00FF00, 0xFF00FF00, 0xFF00FF00], 2, 4, 2, 2);   // an opaque green 2 x 2 inside it
    updatePixelsRect(opaque, [0x80FFFFFF], 1, 1, 1, 1);                                      // an opaque image stays opaque
    updatePixelsRect(part, [1], 7, 7, 2, 2);                                                  // leaves the image: nothing changes
  }
  clear(0x0000FF);
  drawImageRect(tgt, 0, 0, 40, 20, 10, 10, 40, 20);
  drawImageRect(part, 0, 0, 8, 8, 100, 10, 8, 8, 255, ImageFlag.Nearest);
  drawImageRect(opaque, 0, 0, 8, 8, 120, 10, 8, 8, 255, ImageFlag.Nearest);
  if (n === 2) clearImage(tgt);   // frame 3 shows nothing of it
  if (n === 3) quit();
});
