// A frame with more text than the first text pool holds (32 KB): 900 strings of 40 bytes drawn off screen, then one on screen.
// tests/t1/gfx_text_pool.sh checks that no text is dropped (the pool grows) and that the last string shows.
import { onFrame, clear, drawText, font } from 'zinc:gfx';

const sans = font('sans', 14);
const FILLER = '0123456789012345678901234567890123456789';

onFrame((dt: number) => {
  clear(0xffffff);
  for (let i: i32 = 0; i < 900; i++) drawText(sans, -1000, 0, FILLER, 0x000000, 255, 0);
  drawText(sans, 10, 10, 'the last line', 0x000000, 255, 0);
});
