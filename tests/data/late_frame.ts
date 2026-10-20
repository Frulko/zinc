// tests/t0/late_frame.sh: a program that starts drawing from a timer (a menu bar app opening its window from the menu) runs frames from then
// on, and its timers keep firing in them.
import { onFrame } from 'zinc:gfx';

let n = 0;
setTimeout(() => {
  console.log('drawing from now');
  onFrame((dt: number) => { n++; if (n === 3) console.log('frame 3'); });
}, 20);
setTimeout(() => console.log('timer during frames'), 200);
