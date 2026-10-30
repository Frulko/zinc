// A chain of setTimeout(0) started from a timer, as a long computation that yields: each step must run in a later frame than the one
// before, so the frames and the input get through (tests/t0/timer_yield.sh).
import { onFrame, frame } from 'zinc:gfx';
const seen: i32[] = [];
function step(k: i32): void {
  seen.push(frame());
  if (k < 5) setTimeout(() => step(k + 1), 0);
  else { let rising = true; for (let i = 1; i < seen.length; i++) rising = rising && seen[i] > seen[i - 1]; console.log('one step a frame', rising); }
}
setTimeout(() => step(0), 0);
onFrame((dt: number) => {});
