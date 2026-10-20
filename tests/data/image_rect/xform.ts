// zinc:gfx sprites through setTransform (ZN-432 on ZN-263.01): frames of assets/sheet.png under a rotation, a non-uniform scale and both, from
// the baked image and from the decoded one. Each sprite is drawn on (-16, -16, 32, 32) around its own origin, which the matrix puts at
// (cx, cy). The rotation is the one of the 3-4-5 triangle (cos 0.8, sin 0.6): exact constants, no libm between the engines.
// tests/t1/image_rect.sh: xform-golden.png is the software frame; xform_check.py computes the inside of the nearest sprites from the sheet.
// tests/t1/image_rect_gl.sh: the GL replay against the software frame.
import { onFrame, clear, image, drawImage, drawImageRect, imageFromBytes, setTransform, resetTransform, ImageFlag } from 'zinc:gfx';
import { readBytes } from 'zinc:assets';

const baked = image('sheet.png');
const decoded = imageFromBytes(readBytes('sheet.png'));
const N = ImageFlag.Nearest;

// the local origin at (cx, cy), the sprite scaled (sx, sy) along its own axes, then turned (cos, sin)
function place(cx: number, cy: number, cos: number, sin: number, sx: number, sy: number): void {
  setTransform(cos * sx, sin * sx, -sin * sy, cos * sy, cx, cy);
}

onFrame((dt: number) => {
  clear(0x203040);
  // what xform_check.py knows (keep the two in step): frame 0, nearest
  place(40, 44, 0.8, 0.6, 1, 1); drawImageRect(baked, 0, 0, 8, 8, -16, -16, 32, 32, 255, N);                               // turned
  place(120, 44, 1, 0, 2, 0.75); drawImageRect(baked, 0, 0, 8, 8, -16, -16, 32, 32, 255, N);                               // a non-uniform scale
  place(210, 44, 0.8, 0.6, 1.5, 0.75); drawImageRect(baked, 0, 0, 8, 8, -16, -16, 32, 32, 255, N);                         // both
  place(290, 44, 0.8, 0.6, 1.5, 0.75); drawImageRect(decoded, 0, 0, 8, 8, -16, -16, 32, 32, 255, N | ImageFlag.FlipX);     // mirrored, decoded
  place(360, 44, 0.6, -0.8, 1, 1.25); drawImageRect(baked, 0, 0, 8, 8, -16, -16, 32, 32, 255, N | ImageFlag.FlipY);        // the other way round
  // linear, transparency, a source rectangle half outside the image, the whole decoded image
  place(40, 130, 0.8, 0.6, 1.5, 0.75); drawImageRect(baked, 24, 0, 8, 8, -16, -16, 32, 32);
  place(120, 130, 0.8, 0.6, 1, 1); drawImageRect(decoded, 16, 0, 8, 8, -16, -16, 32, 32, 255, N);
  place(190, 130, 0.6, 0.8, 1.25, 1); drawImageRect(decoded, 8, 8, 8, 8, -16, -16, 32, 32, 128);
  place(260, 130, 0.8, 0.6, 1.5, 0.75); drawImageRect(baked, 28, 12, 8, 8, -16, -16, 32, 32, 255, N);
  place(340, 130, 0.8, -0.6, 2, 2); drawImage(decoded, -16, -8, 32, 16, 255, 0);
  resetTransform();
});
