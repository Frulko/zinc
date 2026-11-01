// zinc:gfx updatePixels: one u32 a pixel (red in the low byte) gives the same picture as the RGBA bytes of updateImage, opaque or with its own alpha.
// tests/t0/update_pixels.sh draws the same four pixels both ways and compares the frames.
import { onFrame, clear, drawImageRect, createImage, updateImage, updatePixels, ImageFlag, quit } from 'zinc:gfx';

const bytes: u8[] = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 40, 80, 120, 128];
const packed: u32[] = [0xFF0000FF, 0xFF00FF00, 0xFFFF0000, 0x80785028];
const viaBytes = createImage(4, 1), viaPixels = createImage(4, 1), forced = createImage(4, 1);
let n = 0;
onFrame(() => {
  n++;
  if (n === 1) { updateImage(viaBytes, bytes); updatePixels(viaPixels, packed, false); updatePixels(forced, [0x0000FF, 0x00FF00, 0xFF0000, 0x785028], true); }
  clear(0xC0C0C0);
  drawImageRect(viaBytes, 0, 0, 4, 1, 0, 0, 200, 30, 255, ImageFlag.Nearest);
  drawImageRect(viaPixels, 0, 0, 4, 1, 0, 35, 200, 30, 255, ImageFlag.Nearest);
  drawImageRect(forced, 0, 0, 4, 1, 0, 70, 200, 30, 255, ImageFlag.Nearest);
  if (n === 3) quit();
});
