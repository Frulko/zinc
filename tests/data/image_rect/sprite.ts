// zinc:gfx sprites (ZN-581): drawImageRect's rotation, tint and blend modes on frames of assets/sheet.png (baked and decoded), over a dark
// background and a grey band so that Multiply and Screen show. tests/t1/image_rect.sh: the software frame is sprite-golden.png on the
// interpreter, with the same hash on QuickJS and the AOT build, and sprite_check.py computes the nearest sprites of the first two rows from
// the sheet with the documented formulas. tests/t1/image_rect_gl.sh: the GL replay against the software frame at the same density.
import { onFrame, clear, rect, image, drawImageRect, imageFromBytes, setTransform, resetTransform, ImageFlag, Blend } from 'zinc:gfx';
import { readBytes } from 'zinc:assets';

const baked = image('sheet.png');
const decoded = imageFromBytes(readBytes('sheet.png'));
const N = ImageFlag.Nearest;
const TINT = 0xff8040;

// what sprite_check.py knows (keep the two in step): at y, frame (sx, sy) nearest 32x32 in the four blend modes, tinted, at x = 8 + 40 k;
// then the same at half alpha from x = 168; a frame with transparent texels at 328 and 368 (Screen, Multiply)
function modes(img: i32, y: number, sx: number, sy: number): void {
  for (let k: i32 = 0; k < 4; k++) drawImageRect(img, sx, sy, 8, 8, 8 + 40 * k, y, 32, 32, 255, N, 0, TINT, k);
  for (let k: i32 = 0; k < 4; k++) drawImageRect(img, sx, sy, 8, 8, 168 + 40 * k, y, 32, 32, 128, N, 0, TINT, k);
  drawImageRect(img, 16, 0, 8, 8, 328, y, 32, 32, 255, N, 0, TINT, Blend.Screen);
  drawImageRect(img, 8, 8, 8, 8, 368, y, 32, 32, 255, N, 0, 0x40c0ff, Blend.Multiply);
}

onFrame((dt: number) => {
  clear(0x203040);
  rect(0, 46, 400, 40, 0x808080);
  modes(baked, 4, 0, 0);
  modes(decoded, 50, 24, 8);
  // turned: nearest and linear, tinted, mirrored, added; one turned inside a turned matrix; a decoded frame with alpha, screened
  drawImageRect(baked, 0, 0, 8, 8, 8, 100, 32, 32, 255, N, 0.6435, 0xffffff);
  drawImageRect(baked, 24, 0, 8, 8, 56, 100, 32, 32, 255, 0, -0.4, 0x80ff80);
  drawImageRect(decoded, 0, 0, 8, 8, 104, 100, 48, 24, 200, N | ImageFlag.FlipX, 1.2, 0xffc0c0, Blend.Add);
  drawImageRect(baked, 16, 0, 8, 8, 168, 96, 40, 40, 255, 0, 2.5, 0xffffff, Blend.Screen);
  setTransform(0.8, 0.6, -0.6, 0.8, 260, 120);
  drawImageRect(baked, 0, 8, 8, 8, -16, -16, 32, 32, 255, N, 0.3, 0xc0c0ff);
  resetTransform();
  drawImageRect(decoded, 8, 8, 8, 8, 300, 100, 40, 40, 255, 0, 0.8, 0xffff00, Blend.Multiply);
  // linear, a source rectangle between texels, scaled and tinted, no turn; Add on Add stacks
  drawImageRect(baked, 2.5, 1.5, 11, 6, 8, 144, 44, 24, 255, 0, 0, 0x4080ff);
  drawImageRect(baked, 24, 0, 8, 8, 60, 144, 32, 32, 160, 0, 0, 0xff4040, Blend.Add);
  drawImageRect(baked, 24, 0, 8, 8, 76, 144, 32, 32, 160, 0, 0, 0x40ff40, Blend.Add);
  // nothing: an angle that is not a number
  drawImageRect(baked, 0, 0, 8, 8, 360, 144, 32, 32, 255, N, NaN, 0xffffff);
});
