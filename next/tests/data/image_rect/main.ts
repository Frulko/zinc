// zinc:gfx sprites (ZN-432): frames of assets/sheet.png (32x16, eight 8x8 frames) through drawImageRect, from the baked image and from the
// same file decoded at run time with imageFromBytes. tests/t1/image_rect.sh runs it 400x180 on the interpreter, the AOT build and QuickJS
// (the same frame hash) and checks the sprites of row() against the sheet (check.py); tests/t1/image_rect_gl.sh compares the frame of the
// GL replay with the software one.
import { onFrame, clear, clip, unclip, translate, image, imageWidth, imageHeight, drawImage, drawImageRect, imageFromBytes, destroyImage, ImageFlag } from 'zinc:gfx';
import { readBytes } from 'zinc:assets';

const baked = image('sheet.png');
const decoded = imageFromBytes(readBytes('sheet.png'));
console.log('baked', imageWidth(baked), imageHeight(baked), 'decoded', imageWidth(decoded), imageHeight(decoded), decoded !== baked);
const gone = imageFromBytes(readBytes('sheet.png'));
destroyImage(gone);
console.log('not an image', imageFromBytes([1, 2, 3]), imageFromBytes([]), 'destroyed', imageWidth(gone));
const N = ImageFlag.Nearest;

// What check.py knows (keep the two in step): the nearest sprites, four pixels a texel, then two linear ones. Drawn from the baked image
// and from the decoded one, which must give the same pixels.
function row(img: i32, y: number): void {
  drawImageRect(img, 0, 0, 8, 8, 8, y, 32, 32, 255, N);
  drawImageRect(img, 0, 0, 8, 8, 48, y, 32, 32, 255, N | ImageFlag.FlipX);
  drawImageRect(img, 0, 0, 8, 8, 88, y, 32, 32, 255, N | ImageFlag.FlipY);
  drawImageRect(img, 0, 0, 8, 8, 128, y, 32, 32, 255, N | ImageFlag.FlipX | ImageFlag.FlipY);
  drawImageRect(img, 16, 0, 8, 8, 168, y, 32, 32, 255, N);          // transparent around a disc
  drawImageRect(img, 8, 8, 8, 8, 208, y, 32, 32, 128, N);           // translucent texels, half alpha on top
  drawImageRect(img, 28, 12, 8, 8, 248, y, 32, 32, 255, N);         // half of the source rectangle is outside the image: not drawn
  drawImageRect(img, 8, 0, 8, 8, 288, y, 8, 8);                     // one texel a pixel: a copy, whatever the filter
  drawImageRect(img, 24, 0, 8, 8, 304, y, 32, 32);                  // linear, enlarged
  drawImageRect(img, 16, 0, 8, 8, 344, y, 32, 32, 200, ImageFlag.FlipX);   // linear, mirrored, transparency
}

onFrame((dt: number) => {
  clear(0x203040);
  row(baked, 8);
  row(decoded, 48);
  // linear at a fraction of a pixel, reduced, a source rectangle between texels; nearest reduced
  drawImageRect(baked, 0, 0, 8, 8, 8.5, 88.25, 20, 20);
  drawImageRect(baked, 0, 0, 32, 16, 40, 88, 16, 8);
  drawImageRect(decoded, 0, 0, 32, 16, 64, 88, 16, 8, 255, N);
  drawImageRect(baked, 2.5, 1.5, 11, 6, 88, 88, 44, 24, 255, ImageFlag.FlipY);
  // the whole decoded image with drawImage keeps its transparency, rounded too
  drawImage(decoded, 8, 128, 64, 32, 255, 0);
  drawImage(decoded, 80, 128, 64, 32, 180, 10);
  // under a translation and a clip
  translate(150, 126);
  clip(10, 6, 20, 20);
  drawImageRect(baked, 0, 8, 8, 8, 4, 0, 32, 32, 255, N);
  unclip();
  drawImageRect(decoded, 24, 8, 8, 8, 40, 0, 32, 32, 255, N | ImageFlag.FlipX);
  translate(0, 0);
  // nothing: an empty source or destination, an image that does not exist
  drawImageRect(baked, 0, 0, 0, 8, 240, 128, 32, 32);
  drawImageRect(baked, 0, 0, 8, 8, 240, 128, -32, 32);
  drawImageRect(-1, 0, 0, 8, 8, 240, 128, 32, 32);
});
