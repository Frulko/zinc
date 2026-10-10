// zinc:canvas's 9-argument drawImage on the drawImageRect row (ZN-432). canvas-golden.png is this frame as the engine drew it before, when
// the source rectangle was a clip around the whole image scaled: the row must give the same pixels (tests/t1/image_rect.sh).
import { CanvasRenderingContext2D, Canvas } from 'zinc:canvas';
import { onFrame, clear, quit } from 'zinc:gfx';

const off = new Canvas(32, 16);
const octx = off.getContext('2d');
const ctx = new CanvasRenderingContext2D();
let frames = 0;
onFrame((dt: number) => {
  octx.begin();   // sixteen 8x4 cells of different colours, a diagonal across them
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { octx.fillStyle = `rgb(${40 + i * 60}, ${30 + j * 70}, ${(i * 4 + j) * 15})`; octx.fillRect(i * 8, j * 4, 8, 4); }
  octx.strokeStyle = 'white'; octx.lineWidth = 1.5; octx.beginPath(); octx.moveTo(0, 0); octx.lineTo(32, 16); octx.stroke();
  octx.end();
  clear(0x101820);
  ctx.begin(0, 0, 320, 240);
  ctx.drawImage(off.image, 8, 8);                                  // the whole image, for reference
  ctx.drawImage(off.image, 0, 0, 16, 8, 48, 8, 32, 16);            // a quarter, twice the size
  ctx.drawImage(off.image, 8, 4, 16, 8, 88, 8, 48, 24);            // not from the corner, three times
  ctx.drawImage(off.image, 4, 2, 20, 10, 144, 8, 30, 15);          // one and a half
  ctx.drawImage(off.image, 8, 4, 16, 8, 184.5, 8.25, 40, 20);      // at a fraction of a pixel
  ctx.drawImage(off.image, 3.5, 1.5, 9, 5, 232, 8, 45, 25);        // a source rectangle between texels
  ctx.drawImage(off.image, 16, 8, 16, 8, 8, 48, 16, 8);            // pixel for texel
  ctx.drawImage(off.image, 24, 12, 16, 8, 32, 48, 32, 16);         // half outside the image
  ctx.drawImage(off.image, 0, 0, 32, 16, 72, 48, 16, 8);           // reduced
  ctx.globalAlpha = 0.5;
  ctx.drawImage(off.image, 0, 0, 16, 8, 96, 48, 32, 16);
  ctx.globalAlpha = 1;
  ctx.save(); ctx.translate(136, 48); ctx.scale(2, 2);             // under a transform
  ctx.drawImage(off.image, 8, 0, 8, 8, 0, 0, 12, 12);
  ctx.restore();
  ctx.imageSmoothingEnabled = false;                               // nearest, whole multiples
  ctx.drawImage(off.image, 0, 0, 16, 8, 8, 88, 32, 16);
  ctx.drawImage(off.image, 8, 4, 8, 8, 48, 88, 32, 32);
  ctx.imageSmoothingEnabled = true;
  ctx.end();
  frames++;
  if (frames === 2) quit();
});
