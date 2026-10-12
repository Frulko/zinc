// A picture on a hardware layer of the display, and the ways of drawing it that a layer cannot show (ZN-731, tests/t1/video_layers.sh).
// The test's display driver (plugins/display-layertest) gives the first runtime image a picture in "device memory" and composes the
// frame over it as a plane does; the frame must be the one the software rasterizer draws from the image's pixels.
//   -- plain    the image upright and whole, with what a program draws over a film: an opaque box, a rounded one (antialiased corners),
//               a translucent bar, a shadow. It goes to the layer, and all of that stays in front of it
//   -- turned | blend | round | part
//               the image under a matrix that turns, half transparent, with rounded corners, a part of it: drawn in software
import { onFrame, clear, rect, rrect, shadow, drawImage, drawImageRect, createImage, beginImage, endImage, setTransform, resetTransform } from 'zinc:gfx';
import { args } from 'zinc:sys';

const mode = args().length > 0 ? args()[0] : 'plain';
const img = createImage(160, 90);
beginImage(img);
for (let i: i32 = 0; i < 16; i++) for (let j: i32 = 0; j < 9; j++) rect(i * 10, j * 10, 10, 10, ((i * 16) << 16) | ((j * 28) << 8) | ((i + j) % 2 === 0 ? 230 : 60));
endImage();

onFrame((dt: number) => {
  clear(0x1f2937);
  rect(20, 20, 280, 160, 0xe5e7eb);
  if (mode === 'plain') {
    drawImage(img, 80, 50, 160, 90, 255, 0);
    rect(70, 60, 30, 20, 0xdc2626);                 // across its left edge
    rrect(120, 70, 60, 30, 12, 0xfacc15, 255);      // inside it, round corners
    rrect(80, 126, 160, 14, 0, 0x000000, 160);      // a timeline: translucent
    rrect(80, 126, 70, 14, 0, 0x2563eb, 255);
    shadow(200, 40, 50, 30, 6, 10, 0x000000, 150);  // a soft edge over its corner
  } else if (mode === 'turned') {
    const t = 10 * Math.PI / 180;
    setTransform(Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 160, 100);
    drawImage(img, -80, -45, 160, 90, 255, 0);
    resetTransform();
  } else if (mode === 'blend') drawImage(img, 80, 50, 160, 90, 128, 0);
  else if (mode === 'round') drawImage(img, 80, 50, 160, 90, 255, 16);
  else drawImageRect(img, 40, 20, 80, 45, 80, 50, 160, 90, 255, 0, 0, 0xffffff, 0);
});
