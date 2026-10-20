// The cost of a size chosen at run time (ZN-669): loadFont, then the first measure of a 54-character text (which rasterizes its 37 glyphs on
// this thread), then the same measure again (cached glyphs), in microseconds; for sizes 14, 24, 48 and 96 of the engine's sans.
import { loadFont, textWidth } from 'zinc:gfx';

const text = 'The quick brown fox jumps over the lazy dog, 0123456789';
for (const px of [14, 24, 48, 96]) {
  const t0 = performance.now();
  const f = loadFont('sans', px + 0.4);
  const t1 = performance.now();
  textWidth(f, text, 0);
  const t2 = performance.now();
  textWidth(f, text, 0);
  const t3 = performance.now();
  console.log(`${px} px: loadFont ${Math.round((t1 - t0) * 1000)} us, first measure ${Math.round((t2 - t1) * 1000)} us, again ${Math.round((t3 - t2) * 1000)} us`);
}
