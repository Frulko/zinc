// Colour emoji from the system font (ZN-225): the app embeds no emoji font, Apple Color Emoji (sbix) answers on macOS; emoji presentation (U+FE0F) picks the colour glyph.
import * as gfx from 'zinc:gfx';
const f = gfx.font('sans', 32);
gfx.onFrame((dt: number) => {
  gfx.clear(0xffffff);
  gfx.drawText(f, 10, 10, 'Hi 😀 🇫🇷 👨‍👩‍👧', 0x000000, 255, 0);
  gfx.drawText(f, 10, 60, '🎉 ok ❤️', 0x000000, 255, 0);
});
