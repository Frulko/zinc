// zinc:gfx imageFromPixels / updateImage and ImageFlag.Smooth (ZN-746): a picture a program computes reaches the screen without a file
// format, its pixels are replaced in place, and a small picture stretched far with the smooth filter has no grid. tests/t0/image_pixels.sh
// runs it 200x100 headless and reads the frames.
import { onFrame, clear, drawImageRect, imageFromPixels, updateImage, imageWidth, imageHeight, ImageFlag, quit } from 'zinc:gfx';

// 4 x 1: black, black, white, white; the second version is its mirror
const a: u8[] = [0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255];
const b: u8[] = [255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255];
const img = imageFromPixels(a, 4, 1);
console.log('image', img >= 0, imageWidth(img), imageHeight(img), 'too few bytes', imageFromPixels([1, 2, 3], 4, 1), 'empty', imageFromPixels([], 0, 0));
let n = 0;
onFrame(() => {
  n++;
  if (n === 3) updateImage(img, b);
  if (n === 4) updateImage(img, [1, 2]);   // too few bytes: the image keeps the second version
  clear(0x808080);
  drawImageRect(img, 0, 0, 4, 1, 0, 0, 200, 50, 255, ImageFlag.Smooth);   // smooth: a ramp without kinks
  drawImageRect(img, 0, 0, 4, 1, 0, 50, 200, 50, 255);                    // linear: flat, a straight ramp, flat
  if (n === 5) quit();
});
