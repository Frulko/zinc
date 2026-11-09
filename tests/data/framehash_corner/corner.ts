// Paints only a corner, never clears: the rest of the frame must be black at every run (ZN-675), as cleared.ts draws it.
import { onFrame, quit, rect } from 'zinc:gfx';
let n = 0;
onFrame((dt: number) => {
  rect(0, 0, 16, 16, 0xff0000);
  if (++n === 2) quit();
});
