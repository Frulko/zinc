// A text on a flat background (ZN-299): the shift of its x is what tests/t1/sim_compare.sh varies.
import { onFrame, clear, font, drawText } from 'zinc:gfx';
const f = font('sans', 14);
onFrame((dt: number) => {
  clear(0x101820);
  drawText(f, 12, 20, 'Hello, simulator', 0xffffff, 255, 0);
});
