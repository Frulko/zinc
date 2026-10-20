// A zoom from 0.5 to 4 over 300 frames, a new scale at each one, of two families (ZN-726): the fonts made for the glyphs are those of the
// ladder's steps, not one per scale. Prints the counters of the fonts made at run time after the last frame.
import { onFrame, clear, drawText, font, loadFont, setTransform, resetTransform, frame } from 'zinc:gfx';
import { resourceStats } from 'zinc:__diagnostics';

const sans = font('sans', 16), mono = loadFont('mono', 16);
onFrame((dt: number) => {
  clear(0xffffff);
  const s = 0.5 * Math.pow(8, Math.min(1, frame() / 300));
  setTransform(s, 0, 0, s, 10, 10);
  drawText(sans, 0, 0, 'A zoom makes few fonts', 0x000000, 255, 0);
  drawText(mono, 0, 24, 'whatever its scales', 0x000000, 255, 0);
  resetTransform();
  if (frame() === 300) console.log(resourceStats());
});
