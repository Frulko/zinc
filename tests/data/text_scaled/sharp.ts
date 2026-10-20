// A 16 pixel text enlarged 2 and 3 times by a matrix (ZN-726); direct.ts sets the same lines at 32 and 48 pixels, on the same baselines.
// tests/t1/text_scaled.sh compares the two frames: the enlarged text is as sharp as the one set at its size.
import { onFrame, clear, drawText, font, setTransform, resetTransform } from 'zinc:gfx';

const sans = font('sans', 16);
onFrame((dt: number) => {
  clear(0xffffff);
  setTransform(2, 0, 0, 2, 10, 10); drawText(sans, 0, 0, 'Sharp glyphs, kept breaks 123', 0x000000, 255, 0);
  setTransform(3, 0, 0, 3, 10, 60); drawText(sans, 0, 0, 'Sharp glyphs, kept breaks 123', 0x000000, 255, 0);
  resetTransform();
});
