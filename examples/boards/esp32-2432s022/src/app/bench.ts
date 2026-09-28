// Benchmark, in the spirit of lv_demo_benchmark: bouncing objects drawn four ways (opaque rounded rectangles,
// translucent circles, text, a mix), with a live fps figure. "Run" measures each scene for three seconds and
// keeps the averages.
import { createSignal } from 'zinc:ui/solid';
import { rand } from './sensors';

export const SCENES: string[] = ['Rects', 'Alpha', 'Text', 'Mix'];
export const MAX_OBJECTS: i32 = 64;   // the esp32 build holds 256 draw commands per frame, the page uses ~80

export const [scene, setScene] = createSignal<i32>(0);
export const [count, setCount] = createSignal<number>(24);
/** Live frame rate of the bench scene (updated twice a second). */
export const [benchFps, setBenchFps] = createSignal<i32>(0);
/** Averages per scene after a run, -1 = not measured yet. */
export const [results, setResults] = createSignal<i32[]>([-1, -1, -1, -1]);
export const [runningScene, setRunningScene] = createSignal<i32>(-1);

export const xs: number[] = [], ys: number[] = [], vx: number[] = [], vy: number[] = [];
for (let i = 0; i < MAX_OBJECTS; i++) {
  xs.push(rand()); ys.push(rand());
  const a = rand() * 6.2832, s = 0.25 + rand() * 0.35;
  vx.push(Math.cos(a) * s); vy.push(Math.sin(a) * s);
}

let acc: number = 0, frames: i32 = 0, runClock: number = 0, runFrames: i32 = 0;
const RUN_SECONDS: number = 3;

export function startRun(): void { setRunningScene(0); setScene(0); runClock = 0; runFrames = 0; setResults([-1, -1, -1, -1]); }

/** Moves the objects (positions are 0..1 of the canvas, so they fit any size) and measures. */
export function stepBench(dt: number): void {
  for (let i = 0; i < MAX_OBJECTS; i++) {
    xs[i] += vx[i] * dt; ys[i] += vy[i] * dt;
    if (xs[i] < 0) { xs[i] = -xs[i]; vx[i] = -vx[i]; } else if (xs[i] > 1) { xs[i] = 2 - xs[i]; vx[i] = -vx[i]; }
    if (ys[i] < 0) { ys[i] = -ys[i]; vy[i] = -vy[i]; } else if (ys[i] > 1) { ys[i] = 2 - ys[i]; vy[i] = -vy[i]; }
  }
  acc += dt; frames++;
  if (acc >= 0.5) { setBenchFps(Math.round(frames / acc)); acc = 0; frames = 0; }
  const r = runningScene();
  if (r < 0) return;
  runClock += dt; runFrames++;
  if (runClock < RUN_SECONDS) return;
  const next = results().slice();
  next[r] = Math.round(runFrames / runClock);
  setResults(next);
  runClock = 0; runFrames = 0;
  if (r + 1 < SCENES.length) { setRunningScene(r + 1); setScene(r + 1); } else setRunningScene(-1);
}
