// corner.ts with the frame cleared to black first: the same pixels, so the same frame hash (ZN-675).
import { onFrame, quit, clear, rect } from 'zinc:gfx';
let n = 0;
onFrame((dt: number) => {
  clear(0x000000);
  rect(0, 0, 16, 16, 0xff0000);
  if (++n === 2) quit();
});
