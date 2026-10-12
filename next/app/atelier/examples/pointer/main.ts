// Pointer: pointerX() and pointerY() are where the mouse (or the first finger) is; pointerDown() says whether it is
// pressed. A trail of the last places follows it; pressing makes the trail thicker.
import { onFrame, clear, rrect, pointerX, pointerY, pointerDown } from 'zinc:gfx';

const xs: number[] = [], ys: number[] = [];
const LENGTH = 40;
let was = false;

onFrame((dt: number) => {
  xs.push(pointerX()); ys.push(pointerY());
  if (xs.length > LENGTH) { xs.shift(); ys.shift(); }
  if (pointerDown() && !was) console.log(`pressed at ${Math.round(pointerX())}, ${Math.round(pointerY())}`);
  was = pointerDown();

  clear(0xf3f1ec);
  for (let i = 0; i < xs.length; i++) {
    const age = (i + 1) / xs.length;                       // 0 the oldest, 1 the newest
    const r = (pointerDown() ? 26 : 14) * age;
    rrect(xs[i] - r, ys[i] - r, r * 2, r * 2, r, 0x5746e0, Math.round(200 * age));
  }
});
