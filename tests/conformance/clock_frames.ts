// zinc-test: deterministic
// Deterministic mode with a frame loop: each frame advances the virtual clock by dt (1/60 s), then runs the timers due
// by then, then the frame callback.
import { onFrame, quit, frame } from 'zinc:gfx';

const t0 = Date.now();
setTimeout(() => { console.log(`timeout 50 in frame ${frame()}, t=${(Date.now() - t0).toFixed(3)}`); }, 50);
const iv = setInterval(() => { console.log(`interval 40 in frame ${frame()}`); }, 40);
onFrame((dt: number) => {
  const f = frame();
  if (f < 3 || f === 6) console.log(`frame ${f} t=${(Date.now() - t0).toFixed(3)} rnd=${Math.floor(Math.random() * 1000)}`);
  if (f === 7) { clearInterval(iv); quit(); }
});
