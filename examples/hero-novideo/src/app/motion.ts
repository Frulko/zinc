// Motion primitives, advanced once per frame by `stepMotion(dt)`:
//   - Tween: a value that travels to a target in a fixed time along an easing curve (screen transitions, fades);
//   - Spring: a value pulled toward a target by a damped spring (interruptible: hover lifts, the nav indicator, drags);
//   - Entrance: a clock restarted when a screen appears, read with `at(delay)` to stagger its elements.
// Values are signals, so a `style={{ opacity: fade.get() }}` updates when (and only while) the value moves.
import { createSignal } from 'zinc:ui/solid';

export type Ease = (t: number) => number;

export const linear: Ease = (t: number): number => t;
/** Fast start, soft landing (the default). */
export const easeOut: Ease = (t: number): number => { const u = 1 - t; return 1 - u * u * u; };
export const easeInOut: Ease = (t: number): number => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
/** Overshoots the target a little, then settles (entrances with some bounce). */
export const easeOutBack: Ease = (t: number): number => { const u = t - 1; return 1 + 2.2 * u * u * u + 1.2 * u * u; };

export function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

// Settings > Motion: a global speed factor (slow motion) and "reduce motion" (every tween ends at once).
let timeScale: number = 1;
let instant: boolean = false;
export function setMotion(scale: number, reduce: boolean): void { timeScale = scale; instant = reduce; }

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
    this.from = this.get(); this.target = target;
    this.t = 0; this.dur = instant ? 0 : seconds; this.wait = instant ? 0 : delay;
    this.ease = ease; this.then = then;
    if (!this.running) { this.running = true; tweens.push(this); }
  }
  /** Jumps to `value` and stops. */
  snap(value: number): void { this.from = value; this.target = value; this.t = 1; this.then = null; this.set(value); }
  moving(): boolean { return this.t < 1; }
  /** One frame; false once finished (the `then` callback may start it again). */
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

  /** stiffness / damping: 170 / 26 is quick without bounce, 260 / 18 bounces. */
  constructor(value: number, stiffness: number = 170, damping: number = 26) {
    const [g, s] = createSignal<number>(value);
    this.get = g; this.set = s;
    this.x = value; this.target = value;
    this.stiffness = stiffness; this.damping = damping;
  }
  to(target: number): void { this.target = target; this.wake(); }
  /** Adds velocity (a flick, a bump). */
  kick(velocity: number): void { this.v += velocity; this.wake(); }
  snap(value: number): void { this.x = value; this.target = value; this.v = 0; this.set(value); }
  private wake(): void {
    if (instant) { this.snap(this.target); return; }
    if (!this.running) { this.running = true; springs.push(this); }
  }
  step(dt: number): boolean {
    // semi-implicit Euler in small substeps: stable for stiff springs at any frame rate
    const n: i32 = Math.max(1, Math.ceil(dt * 240));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.stiffness * (this.target - this.x) - this.damping * this.v) * h;
      this.x += this.v * h;
    }
    const settled = Math.abs(this.target - this.x) < 0.01 && Math.abs(this.v) < 0.01;
    if (settled) this.x = this.target;
    this.set(this.x);
    if (settled) this.running = false;
    return !settled;
  }
}

/** Entrance clock of a screen: `restart()` when it appears, `at(delay)` gives an eased 0..1 for one element. */
export class Entrance {
  private clock: Tween = new Tween(10);
  restart(): void { this.clock.snap(0); this.clock.to(3, 3, linear); }
  /** Progress of an element that starts `delay` seconds after the screen and takes `seconds`. */
  at(delay: number, seconds: number = 0.38): number { return easeOut(this.raw(delay, seconds)); }
  /** Linear progress, for a custom easing. */
  raw(delay: number, seconds: number = 0.38): number { return clamp01((this.clock.get() - delay) / seconds); }
}

/** Advances every moving tween and spring. Called once per frame from main.tsx. */
export function stepMotion(dt: number): void {
  const k = Math.min(dt, 0.05) * timeScale;   // clamp: a stalled frame must not teleport everything
  let i: i32 = 0;
  while (i < tweens.length) { if (tweens[i].step(k)) i++; else tweens.splice(i, 1); }
  i = 0;
  while (i < springs.length) { if (springs[i].step(k)) i++; else springs.splice(i, 1); }
}
