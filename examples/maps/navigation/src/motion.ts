// Motion primitives for the UI, advanced once per frame by `stepMotion(dt)` (the same as examples/hero):
//   - Tween: a value that travels to a target in a fixed time along an easing curve;
//   - Spring: a value pulled toward a target by a damped spring (interruptible, can overshoot).
// Values are signals, so a `style={{ opacity: fade.get() }}` updates only while the value moves.
import { createSignal, untrack } from 'zinc:ui/solid';

export type Ease = (t: number) => number;

export const linear: Ease = (t: number): number => t;
/** Fast start, soft landing. */
export const easeOut: Ease = (t: number): number => { const u = 1 - t; return 1 - u * u * u; };
export const easeInOut: Ease = (t: number): number => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
/** Overshoots a little, then settles (pop-ins). */
export const easeOutBack: Ease = (t: number): number => { const u = t - 1; return 1 + 2.2 * u * u * u + 1.2 * u * u; };

export function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

const tweens: Tween[] = [];
const springs: Spring[] = [];

export class Tween {
  readonly get: () => number;
  private readonly set: (v: number) => void;
  private from: number;
  private target: number;
  private t: number = 1;
  private dur: number = 0;
  private wait: number = 0;
  private ease: Ease = easeOut;
  private then: (() => void) | null = null;
  private running: boolean = false;

  constructor(value: number) {
    const [g, s] = createSignal<number>(value);
    this.get = g; this.set = s;
    this.from = value; this.target = value;
  }
  /** Animates from the current value to `target` in `seconds` (after `delay`); `then` runs on arrival. */
  to(target: number, seconds: number, ease: Ease = easeOut, then: (() => void) | null = null, delay: number = 0): void {
    this.from = untrack(this.get); this.target = target;   // untracked: an effect may start a tween
    this.t = 0; this.dur = seconds; this.wait = delay;
    this.ease = ease; this.then = then;
    if (!this.running) { this.running = true; tweens.push(this); }
  }
  /** Jumps to `value` and stops. */
  snap(value: number): void { this.from = value; this.target = value; this.t = 1; this.then = null; this.set(value); }
  moving(): boolean { return this.t < 1; }
  step(dt: number): boolean {
    if (this.t >= 1) { this.running = false; return false; }
    if (this.wait > 0) { this.wait -= dt; return true; }
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

  /** stiffness / damping: 170 / 26 is quick without bounce, 260 / 14 bounces. */
  constructor(value: number, stiffness: number = 170, damping: number = 26) {
    const [g, s] = createSignal<number>(value);
    this.get = g; this.set = s;
    this.x = value; this.target = value;
    this.stiffness = stiffness; this.damping = damping;
  }
  to(target: number): void { this.target = target; this.wake(); }
  snap(value: number): void { this.x = value; this.target = value; this.v = 0; this.set(value); }
  private wake(): void { if (!this.running) { this.running = true; springs.push(this); } }
  step(dt: number): boolean {
    // semi-implicit Euler in small substeps: stable for stiff springs at any frame rate
    const n: i32 = Math.max(1, Math.ceil(dt * 240));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.stiffness * (this.target - this.x) - this.damping * this.v) * h;
      this.x += this.v * h;
    }
    const settled = Math.abs(this.target - this.x) < 0.001 && Math.abs(this.v) < 0.001;
    if (settled) this.x = this.target;
    this.set(this.x);
    if (settled) this.running = false;
    return !settled;
  }
}

/** Advances every moving tween and spring. Called once per frame from main.tsx. */
export function stepMotion(dt: number): void {
  const k = Math.min(dt, 0.05);   // a stalled frame must not teleport everything
  let i: i32 = 0;
  while (i < tweens.length) { if (tweens[i].step(k)) i++; else tweens.splice(i, 1); }
  i = 0;
  while (i < springs.length) { if (springs[i].step(k)) i++; else springs.splice(i, 1); }
}
