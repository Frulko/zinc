// The frame diff sees a sprite whose source rectangle alone changes (ZN-432): from frame 3 the source is twice as wide, on the same destination.
// With a source x of 0 only the width of the image's box differs, which lives in the command's off (image_box), or in the XFORM's payload under
// a matrix: neither was compared for an IMAGE before. tests/t1/image_rect.sh diffs the scene dumps of frames 2, 3 and 4; ZINC_XF=1 draws
// the sprite through a matrix instead.
import { onFrame, clear, image, drawImageRect, setTransform, resetTransform, ImageFlag } from 'zinc:gfx';
import { env } from 'zinc:sys';

const sheet = image('sheet.png');
const turned = env('ZINC_XF') === '1';
let n = 0;
onFrame((dt: number) => {
  clear(0x203040);
  n++;
  const sw = n < 3 ? 8 : 16;
  if (turned) setTransform(0.8, 0.6, -0.6, 0.8, 60, 60);
  drawImageRect(sheet, 0, 0, sw, 8, turned ? -16 : 20, turned ? -16 : 20, 32, 32, 255, ImageFlag.Nearest);
  resetTransform();
});
