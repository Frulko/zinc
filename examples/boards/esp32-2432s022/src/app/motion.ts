// Motion: a Tween is a value (a signal) that travels to a target along an easing curve; stepMotion(dt) advances
// every running tween once per frame. Only nodes that read a moving tween repaint, so a finished animation costs
// nothing: the frame is kept and the panel is not touched.
import { createSignal } from 'zinc:ui/solid';

export type Ease = (t: number) => number;
/** Fast start, soft landing. */
export const easeOut: Ease = (t: number): number => { const u = 1 - t; return 1 - u * u * u; };
export const easeIn: Ease = (t: number): number => t * t;
export const easeInOut: Ease = (t: number): number => t < 0.5 ? 4 * t * t * t : 1 - (2 - 2 * t) * (2 - 2 * t) * (2 - 2 * t) / 2;

/** Reduce motion: every tween lands at once (no page transition, no easing) and the dashboard chart advances one
 *  sample at a time instead of scrolling: on the ESP32 a full repaint of an animated chart costs ~40 ms. */
export const [reduceMotion, setReduceMotion] = createSignal<boolean>(false);

const running: Tween[] = [];

export class Tween {
  readonly get: () => number;
  private readonly set: (v: number) => void;
  private from: number;
  private target: number;
  private t: number = 1;
  private dur: number = 0;
  private ease: Ease = easeOut;

  constructor(value: number) {
    const [g, s] = createSignal<number>(value);
    this.get = g; this.set = s;
    this.from = value; this.target = value;
  }
  /** Animates from the current value to `target` in `seconds`. */
  to(target: number, seconds: number, ease: Ease = easeOut): void {
    if (reduceMotion()) { this.snap(target); return; }
    this.from = this.get(); this.target = target; this.t = 0; this.dur = seconds; this.ease = ease;
    if (running.indexOf(this) < 0) running.push(this);
  }
  snap(value: number): void { this.from = value; this.target = value; this.t = 1; this.set(value); }
  moving(): boolean { return this.t < 1; }
  /** One frame; false once arrived. */
  step(dt: number): boolean {
    this.t = this.dur <= 0 ? 1 : Math.min(1, this.t + dt / this.dur);
    this.set(this.from + (this.target - this.from) * this.ease(this.t));
    return this.t < 1;
  }
}

export function stepMotion(dt: number): void {
  for (let i = running.length - 1; i >= 0; i--) if (!running[i].step(dt)) running.splice(i, 1);
}
