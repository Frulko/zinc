// Shaped text through zinc:gfx (ZN-224): Latin with kerning, Hebrew and Arabic (right to left), Devanagari conjuncts and a ZWJ emoji family, in one frame.
import * as gfx from 'zinc:gfx';
const f = gfx.font('sans', 28);
gfx.onFrame((dt: number) => {
  gfx.clear(0xffffff);
  gfx.drawText(f, 12, 10, 'AVATAR Wave', 0x000000, 255, 0);
  gfx.drawText(f, 12, 55, 'שלום עולם', 0x1d4ed8, 255, 0);
  gfx.drawText(f, 12, 100, 'مرحبا بالعالم', 0xb91c1c, 255, 0);
  gfx.drawText(f, 12, 150, 'क्षत्रिय हिन्दी', 0x15803d, 255, 0);
  gfx.drawText(f, 12, 200, '👨‍👩‍👧 é', 0x000000, 255, 0);
});
