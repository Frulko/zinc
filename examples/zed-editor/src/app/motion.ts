// Motion primitives (from examples/hero), advanced once per frame by `stepMotion(dt)`:
//   - Tween: a value that travels to a target in a fixed time along an easing curve (palette fade, panel toggles);
//   - Spring: a value pulled toward a target by a damped spring (interruptible: chevrons, the panel width).
// Values are signals, so `style={{ opacity: fade.get() }}` updates when (and only while) the value moves.
import { createSignal } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';

export type Ease = (t: number) => number;
/** Fast start, soft landing (the default). */
export const easeOut: Ease = (t: number): number => { const u = 1 - t; return 1 - u * u * u; };
export const easeInOut: Ease = (t: number): number => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const tweens: Tween[] = [];
const springs: Spring[] = [];

export class Tween {
  readonly get: () => number;
  private readonly set: (v: number) => void;
  private from: number;
  private target: number;
  private t: number = 1;
  private dur: number = 0;
  private ease: Ease = easeOut;
  private then: (() => void) | null = null;
  private running: boolean = false;

  constructor(value: number) {
    const [g, s] = createSignal<number>(value);
    this.get = g; this.set = s;
    this.from = value; this.target = value;
  }
  /** Animates from the current value to `target` in `seconds`; `then` runs on arrival. */
  to(target: number, seconds: number, ease: Ease = easeOut, then: (() => void) | null = null): void {
    this.from = this.get(); this.target = target;
    this.t = 0; this.dur = seconds; this.ease = ease; this.then = then;
    if (!this.running) { this.running = true; tweens.push(this); }
  }
  snap(value: number): void { this.from = value; this.target = value; this.t = 1; this.then = null; this.set(value); }
  goal(): number { return this.target; }
  step(dt: number): boolean {
    if (this.t >= 1) { this.running = false; return false; }
    this.t = this.dur <= 0 ? 1 : Math.min(1, this.t + dt / this.dur);
    this.set(this.from + (this.target - this.from) * this.ease(this.t));
    if (this.t < 1) return true;
    const done = this.then;
    this.then = null;
    if (done !== null) done();
    if (this.t < 1) return true;   // restarted by its callback
    this.running = false;
    return false;
  }
}

export class Spring {
  readonly get: () => number;
  private readonly set: (v: number) => void;
  x: number;
  v: number = 0;
  target: number;
  stiffness: number;
  damping: number;
  private running: boolean = false;

  /** stiffness / damping: 170 / 26 is quick without bounce, 260 / 18 bounces. */
  constructor(value: number, stiffness: number = 170, damping: number = 26) {
    const [g, s] = createSignal<number>(value);
    this.get = g; this.set = s;
    this.x = value; this.target = value;
    this.stiffness = stiffness; this.damping = damping;
  }
  to(target: number): void { this.target = target; if (!this.running) { this.running = true; springs.push(this); } }
  snap(value: number): void { this.x = value; this.target = value; this.v = 0; this.set(value); }
  step(dt: number): boolean {
    // semi-implicit Euler in small substeps: stable for stiff springs at any frame rate
    const n: i32 = Math.max(1, Math.ceil(dt * 240));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.stiffness * (this.target - this.x) - this.damping * this.v) * h;
      this.x += this.v * h;
    }
    const settled = Math.abs(this.target - this.x) < 0.002 && Math.abs(this.v) < 0.01;
    if (settled) this.x = this.target;
    this.set(this.x);
    if (settled) this.running = false;
    return !settled;
  }
}

/** Advances every moving tween and spring; canvases that draw them are lazy, so a moving value asks for a repaint. */
export function stepMotion(dt: number): void {
  const k = Math.min(dt, 0.05);   // a stalled frame must not teleport everything
  if (tweens.length > 0 || springs.length > 0) ui.repaint();
  let i: i32 = 0;
  while (i < tweens.length) { if (tweens[i].step(k)) i++; else tweens.splice(i, 1); }
  i = 0;
  while (i < springs.length) { if (springs[i].step(k)) i++; else springs.splice(i, 1); }
}
