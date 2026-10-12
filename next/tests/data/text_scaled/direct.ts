// The lines of sharp.ts set directly at 32 and 48 pixels, on the baselines the enlarged 16 pixel text has.
import { onFrame, clear, drawText, font, fontAscent } from 'zinc:gfx';

const sans = font('sans', 16), twice = font('sans', 32), thrice = font('sans', 48);
onFrame((dt: number) => {
  clear(0xffffff);
  drawText(twice, 10, 10 + 2 * fontAscent(sans) - fontAscent(twice), 'Sharp glyphs, kept breaks 123', 0x000000, 255, 0);
  drawText(thrice, 10, 60 + 3 * fontAscent(sans) - fontAscent(thrice), 'Sharp glyphs, kept breaks 123', 0x000000, 255, 0);
});
