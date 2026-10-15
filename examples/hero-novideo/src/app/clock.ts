// The app clock: seconds since launch and a smoothed frame rate.
// Canvas callbacks read `seconds()` directly (they redraw every frame anyway); the fps readout is a signal
// refreshed twice a second so it does not re-render text on every frame.
import { createSignal } from 'zinc:ui/solid';

let elapsed: number = 0;
let frames: i32 = 0;
let window: number = 0;

export const [fps, setFps] = createSignal<i32>(60);
/** Frames drawn since launch (the Home screen counts them). */
export const [frameCount, setFrameCount] = createSignal<i32>(0);
/** Whole seconds since launch (a signal, for text). */
export const [uptime, setUptime] = createSignal<i32>(0);

export function seconds(): number { return elapsed; }

export function stepClock(dt: number): void {
  elapsed += dt;
  frames++;
  window += dt;
  if (window >= 0.5) {
    setFps(Math.round(frames / window));
    setFrameCount(frameCount() + frames);
    setUptime(Math.floor(elapsed));
    frames = 0;
    window = 0;
  }
}
