// zinc:ui/animated (ZN-364): React Native's Animated API on zinc:ui. The timing, spring, decay, easing, bezier and interpolation maths are ports of React
// Native 0.76 (Libraries/Animated: TimingAnimation, SpringAnimation, SpringConfig, DecayAnimation, Easing, bezier, AnimatedInterpolation; MIT, Copyright (c)
// Meta Platforms, Inc. and affiliates), so the same configuration gives the same values. Values are signals: read them in a style with `.get()`
// (`style={{ opacity: fade.get() }}`), the node updates when the value moves. Animations advance on the engine clock (zinc:ui now(), deterministic in
// tests). useNativeDriver is accepted; running off the program's code per frame is ZN-364.02.
import { createSignal } from 'zinc:ui/solid';
import { now, addStepper, removeStepper } from 'zinc:ui';

// ---------------------------------------------------------------- nodes
/** Anything that has a numeric value: a Value, an interpolation, an arithmetic node. */
export class Node {
  get(): number { return 0; }
  interpolate(c: InterpolationConfig): Interpolation { return new Interpolation(this, c); }
}

export class Value extends Node {
  private read: () => number;
  private write: (v: number) => void;
  base: number;
  offset: number = 0;
  animation: Animation | null = null;
  private listeners: ((v: number) => void)[] = [];
  constructor(v: number) {
    super();
    this.base = v;
    const [r, w] = createSignal<number>(v);
    this.read = r; this.write = w;
  }
  /** The current value (base + offset); reactive in a style or an effect. */
  get(): number { return this.read(); }
  setValue(v: number): void { this.stopAnimation(); this.update(v); }
  setOffset(o: number): void { this.offset = o; this.write(this.base + this.offset); }
  flattenOffset(): void { this.base += this.offset; this.offset = 0; }
  extractOffset(): void { this.offset += this.base; this.base = 0; }
  addListener(f: (v: number) => void): i32 { this.listeners.push(f); return this.listeners.length - 1; }
  removeAllListeners(): void { this.listeners = []; }
  stopAnimation(): void { const a = this.animation; if (a !== null) { (a as Animation).stop(); this.animation = null; } }
  /** Used by the animations: the base value moves, the offset stays. */
  update(v: number): void {
    this.base = v;
    const full = v + this.offset;
    this.write(full);
    for (const f of this.listeners) f(full);
  }
}

/** Two values for x and y (a drag, a position). */
export class ValueXY {
  x: Value; y: Value;
  constructor(x: number = 0, y: number = 0) { this.x = new Value(x); this.y = new Value(y); }
  setValue(x: number, y: number): void { this.x.setValue(x); this.y.setValue(y); }
  setOffset(x: number, y: number): void { this.x.setOffset(x); this.y.setOffset(y); }
  flattenOffset(): void { this.x.flattenOffset(); this.y.flattenOffset(); }
  stopAnimation(): void { this.x.stopAnimation(); this.y.stopAnimation(); }
}

class Binary extends Node {
  a: Node; b: Node; op: i32;
  constructor(a: Node, b: Node, op: i32) { super(); this.a = a; this.b = b; this.op = op; }
  get(): number {
    const x = this.a.get(), y = this.b.get();
    if (this.op === 0) return x + y;
    if (this.op === 1) return x - y;
    if (this.op === 2) return x * y;
    if (this.op === 3) return y === 0 ? 0 : x / y;
    return ((x % y) + y) % y;
  }
}
class Constant extends Node { v: number; constructor(v: number) { super(); this.v = v; } get(): number { return this.v; } }
export function constant(v: number): Node { return new Constant(v); }
export function add(a: Node, b: Node): Node { return new Binary(a, b, 0); }
export function subtract(a: Node, b: Node): Node { return new Binary(a, b, 1); }
export function multiply(a: Node, b: Node): Node { return new Binary(a, b, 2); }
export function divide(a: Node, b: Node): Node { return new Binary(a, b, 3); }
export function modulo(a: Node, m: number): Node { return new Binary(a, new Constant(m), 4); }

/** The value's changes clamped into [min, max] (a header that hides while scrolling down). */
class DiffClamp extends Node {
  a: Node; min: number; max: number; last: number = NaN; acc: number = 0;
  constructor(a: Node, min: number, max: number) { super(); this.a = a; this.min = min; this.max = max; }
  get(): number {
    const v = this.a.get();
    const d = this.last !== this.last ? 0 : v - this.last;
    this.last = v;
    this.acc = Math.min(Math.max(this.acc + d, this.min), this.max);
    return this.acc;
  }
}
export function diffClamp(a: Node, min: number, max: number): Node { return new DiffClamp(a, min, max); }

// ---------------------------------------------------------------- interpolation
export type InterpolationConfig = {
  inputRange: number[];
  outputRange: number[];
  easing?: (t: number) => number;
  extrapolate?: string;        // 'extend' (default), 'clamp', 'identity'
  extrapolateLeft?: string;
  extrapolateRight?: string;
  colors?: boolean;            // outputRange holds 0xRRGGBB colours: interpolated per channel
};
export class Interpolation extends Node {
  src: Node; c: InterpolationConfig;
  constructor(src: Node, c: InterpolationConfig) { super(); this.src = src; this.c = c; }
  get(): number {
    const x = this.src.get(), ins = this.c.inputRange, outs = this.c.outputRange;
    let i = 1;
    while (i < ins.length - 1 && ins[i] < x) i++;
    if (this.c.colors === true) {
      let out = 0;
      for (let sh = 16; sh >= 0; sh -= 8) {
        const ch = interpolate1(x, ins[i - 1], ins[i], (outs[i - 1] >> sh) & 255, (outs[i] >> sh) & 255, this.c);
        out = out * 256 + Math.round(Math.min(255, Math.max(0, ch)));
      }
      return out;
    }
    return interpolate1(x, ins[i - 1], ins[i], outs[i - 1], outs[i], this.c);
  }
}
/** AnimatedInterpolation's interpolate() for one segment. */
function interpolate1(input: number, inMin: number, inMax: number, outMin: number, outMax: number, c: InterpolationConfig): number {
  const left = c.extrapolateLeft ?? c.extrapolate ?? 'extend', right = c.extrapolateRight ?? c.extrapolate ?? 'extend';
  let r = input;
  if (r < inMin) { if (left === 'identity') return r; if (left === 'clamp') r = inMin; }
  if (r > inMax) { if (right === 'identity') return r; if (right === 'clamp') r = inMax; }
  if (outMin === outMax) return outMin;
  if (inMin === inMax) return input <= inMin ? outMin : outMax;
  if (inMin === -Infinity) r = -r; else if (inMax === Infinity) r = r - inMin; else r = (r - inMin) / (inMax - inMin);
  const e = c.easing;
  if (e !== undefined) r = (e as (t: number) => number)(r);
  if (outMin === -Infinity) r = -r; else if (outMax === Infinity) r = r + outMin; else r = r * (outMax - outMin) + outMin;
  return r;
}

// ---------------------------------------------------------------- easing (Easing.js) and bezier (bezier.js)
function calcBezier(t: number, a1: number, a2: number): number { return (((1 - 3 * a2 + 3 * a1) * t + (3 * a2 - 6 * a1)) * t + 3 * a1) * t; }
function slopeOf(t: number, a1: number, a2: number): number { return 3 * (1 - 3 * a2 + 3 * a1) * t * t + 2 * (3 * a2 - 6 * a1) * t + 3 * a1; }
export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const N = 11, STEP = 1 / (N - 1);
  const samples: number[] = [];
  for (let i = 0; i < N; i++) samples.push(calcBezier(i * STEP, x1, x2));
  const tForX = (x: number): number => {
    let start = 0, cur = 1;
    while (cur !== N - 1 && samples[cur] <= x) { start += STEP; cur++; }
    cur--;
    const dist = (x - samples[cur]) / (samples[cur + 1] - samples[cur]);
    let guess = start + dist * STEP;
    const slope = slopeOf(guess, x1, x2);
    if (slope >= 0.001) {
      for (let k = 0; k < 4; k++) { const s = slopeOf(guess, x1, x2); if (s === 0) return guess; guess -= (calcBezier(guess, x1, x2) - x) / s; }
      return guess;
    }
    if (slope === 0) return guess;
    let a = start, b = start + STEP, t = 0, i = 0, cx = 0;
    do { t = a + (b - a) / 2; cx = calcBezier(t, x1, x2) - x; if (cx > 0) b = t; else a = t; } while (Math.abs(cx) > 0.0000001 && ++i < 10);
    return t;
  };
  return (x: number): number => {
    if (x1 === y1 && x2 === y2) return x;
    if (x === 0) return 0;
    if (x === 1) return 1;
    return calcBezier(tForX(x), y1, y2);
  };
}
const EASE: (t: number) => number = bezier(0.42, 0, 1, 1);
export class Easing {
  static linear(t: number): number { return t; }
  static ease(t: number): number { return EASE(t); }
  static quad(t: number): number { return t * t; }
  static cubic(t: number): number { return t * t * t; }
  static poly(n: number): (t: number) => number { return (t: number): number => Math.pow(t, n); }
  static sin(t: number): number { return 1 - Math.cos((t * Math.PI) / 2); }
  static circle(t: number): number { return 1 - Math.sqrt(1 - t * t); }
  static exp(t: number): number { return Math.pow(2, 10 * (t - 1)); }
  static elastic(bounciness: number = 1): (t: number) => number { const p = bounciness * Math.PI; return (t: number): number => 1 - Math.pow(Math.cos((t * Math.PI) / 2), 3) * Math.cos(t * p); }
  static back(s: number = 1.70158): (t: number) => number { return (t: number): number => t * t * ((s + 1) * t - s); }
  static bounce(t: number): number {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) { const u = t - 1.5 / 2.75; return 7.5625 * u * u + 0.75; }
    if (t < 2.5 / 2.75) { const u = t - 2.25 / 2.75; return 7.5625 * u * u + 0.9375; }
    const u = t - 2.625 / 2.75;
    return 7.5625 * u * u + 0.984375;
  }
  static bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number { return bezier(x1, y1, x2, y2); }
  static in(e: (t: number) => number): (t: number) => number { return e; }
  static out(e: (t: number) => number): (t: number) => number { return (t: number): number => 1 - e(1 - t); }
  static inOut(e: (t: number) => number): (t: number) => number { return (t: number): number => t < 0.5 ? e(t * 2) / 2 : 1 - e((1 - t) * 2) / 2; }
}
const EASE_IN_OUT: (t: number) => number = Easing.inOut(Easing.ease);

// ---------------------------------------------------------------- the driver: running animations advance each frame on the engine clock
const running: Animation[] = [];
let stepping = false;
function step(): void {
  const t = now();
  let i = 0;
  while (i < running.length) { const a = running[i]; if (a.active) { a.frame(t); i++; } else running.splice(i, 1); }
  if (running.length === 0 && stepping) { removeStepper(step); stepping = false; }
}
function run(a: Animation): void {
  running.push(a);
  if (!stepping) { addStepper(step); stepping = true; }
}

/** One animation of one value; composites are built from these. */
export class Animation {
  active: boolean = false;
  value: Value | null = null;
  done: ((finished: boolean) => void) | null = null;
  delayMs: number = 0;
  startAt: number = 0;
  iterations: i32 = 1;
  begin(v: Value, done: ((finished: boolean) => void) | null): void {
    v.stopAnimation();
    this.value = v; this.done = done; this.active = true; this.startAt = now() + this.delayMs;
    v.animation = this;
    this.started(v.base);
    run(this);
  }
  started(from: number): void {}
  frame(t: number): void {}
  finish(finished: boolean): void {
    if (!this.active) return;
    this.active = false;
    const v = this.value;
    if (v !== null && (v as Value).animation === this) (v as Value).animation = null;
    const d = this.done;
    if (d !== null) (d as (f: boolean) => void)(finished);
  }
  stop(): void { this.finish(false); }
}

export type TimingConfig = { toValue: number; duration?: number; easing?: (t: number) => number; delay?: number; useNativeDriver?: boolean; isInteraction?: boolean };
class Timing extends Animation {
  to: number; dur: number; easing: (t: number) => number; from: number = 0;
  constructor(c: TimingConfig) { super(); this.to = c.toValue; this.dur = c.duration ?? 500; this.easing = c.easing ?? EASE_IN_OUT; this.delayMs = c.delay ?? 0; }
  started(from: number): void { this.from = from; }
  frame(t: number): void {
    const v = this.value as Value;
    if (t < this.startAt) return;
    if (t >= this.startAt + this.dur) {
      v.update(this.dur === 0 ? this.to : this.from + this.easing(1) * (this.to - this.from));
      this.finish(true);
      return;
    }
    v.update(this.from + this.easing((t - this.startAt) / this.dur) * (this.to - this.from));
  }
}

export type SpringConfig = {
  toValue: number; velocity?: number; overshootClamping?: boolean; restDisplacementThreshold?: number; restSpeedThreshold?: number; delay?: number;
  stiffness?: number; damping?: number; mass?: number; bounciness?: number; speed?: number; tension?: number; friction?: number; useNativeDriver?: boolean;
};
function stiffnessFromOrigami(o: number): number { return (o - 30) * 3.62 + 194; }
function dampingFromOrigami(o: number): number { return (o - 8) * 3 + 25; }
function b3Nobounce(t: number): number {
  if (t <= 18) return 0.0007 * Math.pow(t, 3) - 0.031 * Math.pow(t, 2) + 0.64 * t + 1.28;
  if (t <= 44) return 0.000044 * Math.pow(t, 3) - 0.006 * Math.pow(t, 2) + 0.36 * t + 2;
  return 0.00000045 * Math.pow(t, 3) - 0.000332 * Math.pow(t, 2) + 0.1078 * t + 5.84;
}
class Spring extends Animation {
  to: number; k: number = 100; c: number = 10; m: number = 1; v0: number; clampOver: boolean; restD: number; restV: number;
  from: number = 0; t0: number = -1;
  constructor(cfg: SpringConfig) {
    super();
    this.to = cfg.toValue; this.v0 = cfg.velocity ?? 0; this.clampOver = cfg.overshootClamping ?? false;
    this.restD = cfg.restDisplacementThreshold ?? 0.001; this.restV = cfg.restSpeedThreshold ?? 0.001; this.delayMs = cfg.delay ?? 0;
    if (cfg.stiffness !== undefined || cfg.damping !== undefined || cfg.mass !== undefined) { this.k = cfg.stiffness ?? 100; this.c = cfg.damping ?? 10; this.m = cfg.mass ?? 1; }
    else if (cfg.bounciness !== undefined || cfg.speed !== undefined) {   // SpringConfig.fromBouncinessAndSpeed
      const b = 0.8 * ((cfg.bounciness ?? 8) / 1.7) / 20, s = ((cfg.speed ?? 12) / 1.7) / 20;
      const tension = 0.5 + s * (200 - 0.5);
      const q = 2 * b - b * b;
      const friction = q * 0.01 + (1 - q) * b3Nobounce(tension);
      this.k = stiffnessFromOrigami(tension); this.c = dampingFromOrigami(friction); this.m = 1;
    } else { this.k = stiffnessFromOrigami(cfg.tension ?? 40); this.c = dampingFromOrigami(cfg.friction ?? 7); this.m = 1; }
  }
  started(from: number): void { this.from = from; this.t0 = -1; }
  frame(t: number): void {
    if (t < this.startAt) return;
    if (this.t0 < 0) this.t0 = this.startAt;
    const v = this.value as Value;
    const time = (t - this.t0) / 1000;   // (React Native caps a frame at 64 ms of catch-up; the engine clock never jumps here)
    const c = this.c, m = this.m, k = this.k, v0 = -this.v0;
    const zeta = c / (2 * Math.sqrt(k * m)), w0 = Math.sqrt(k / m), w1 = w0 * Math.sqrt(1 - zeta * zeta), x0 = this.to - this.from;
    let pos = 0, vel = 0;
    if (zeta < 1) {
      const env = Math.exp(-zeta * w0 * time);
      pos = this.to - env * (((v0 + zeta * w0 * x0) / w1) * Math.sin(w1 * time) + x0 * Math.cos(w1 * time));
      vel = zeta * w0 * env * ((Math.sin(w1 * time) * (v0 + zeta * w0 * x0)) / w1 + x0 * Math.cos(w1 * time)) - env * (Math.cos(w1 * time) * (v0 + zeta * w0 * x0) - w1 * x0 * Math.sin(w1 * time));
    } else {
      const env = Math.exp(-w0 * time);
      pos = this.to - env * (x0 + (v0 + w0 * x0) * time);
      vel = env * (v0 * (time * w0 - 1) + time * x0 * (w0 * w0));
    }
    v.update(pos);
    const over = this.clampOver && k !== 0 && (this.from < this.to ? pos > this.to : pos < this.to);
    const still = Math.abs(vel) <= this.restV && (k === 0 || Math.abs(this.to - pos) <= this.restD);
    if (over || still) { if (k !== 0) v.update(this.to); this.finish(true); }
  }
}

export type DecayConfig = { velocity: number; deceleration?: number; delay?: number; useNativeDriver?: boolean };
class Decay extends Animation {
  vel: number; dec: number; from: number = 0; last: number = 0;
  constructor(c: DecayConfig) { super(); this.vel = c.velocity; this.dec = c.deceleration ?? 0.998; this.delayMs = c.delay ?? 0; }
  started(from: number): void { this.from = from; this.last = from; }
  frame(t: number): void {
    if (t < this.startAt) return;
    const v = this.value as Value;
    const x = this.from + (this.vel / (1 - this.dec)) * (1 - Math.exp(-(1 - this.dec) * (t - this.startAt)));
    v.update(x);
    if (Math.abs(this.last - x) < 0.1 && t > this.startAt) { this.finish(true); return; }
    this.last = x;
  }
}

// ---------------------------------------------------------------- composite animations: start(cb), stop(), reset()
export class CompositeAnimation {
  start(done: ((finished: boolean) => void) | null = null): void {}
  stop(): void {}
  reset(): void {}
}
class Single extends CompositeAnimation {
  v: Value; make: () => Animation; a: Animation | null = null; initial: number;
  constructor(v: Value, make: () => Animation) { super(); this.v = v; this.make = make; this.initial = v.base; }
  start(done: ((finished: boolean) => void) | null = null): void { const a = this.make(); this.a = a; a.begin(this.v, done); }
  stop(): void { const a = this.a; if (a !== null) (a as Animation).stop(); }
  reset(): void { this.stop(); this.v.update(this.initial); }
}
export function timing(v: Value, c: TimingConfig): CompositeAnimation { return new Single(v, (): Animation => new Timing(c)); }
export function spring(v: Value, c: SpringConfig): CompositeAnimation { return new Single(v, (): Animation => new Spring(c)); }
export function decay(v: Value, c: DecayConfig): CompositeAnimation { return new Single(v, (): Animation => new Decay(c)); }

class Sequence extends CompositeAnimation {
  list: CompositeAnimation[]; at: i32 = 0; stopped: boolean = false;
  constructor(list: CompositeAnimation[]) { super(); this.list = list; }
  start(done: ((finished: boolean) => void) | null = null): void {
    this.at = 0; this.stopped = false;
    const next = (finished: boolean): void => {
      if (!finished || this.stopped) { if (done !== null) (done as (f: boolean) => void)(false); return; }
      this.at++;
      if (this.at >= this.list.length) { if (done !== null) (done as (f: boolean) => void)(true); return; }
      this.list[this.at].start(next);
    };
    if (this.list.length === 0) { if (done !== null) (done as (f: boolean) => void)(true); return; }
    this.list[0].start(next);
  }
  stop(): void { this.stopped = true; if (this.at < this.list.length) this.list[this.at].stop(); }
  reset(): void { for (let i = this.list.length - 1; i >= 0; i--) this.list[i].reset(); this.at = 0; }
}
class Parallel extends CompositeAnimation {
  list: CompositeAnimation[]; together: boolean; left: i32 = 0;
  constructor(list: CompositeAnimation[], together: boolean) { super(); this.list = list; this.together = together; }
  start(done: ((finished: boolean) => void) | null = null): void {
    this.left = this.list.length;
    let failed = false;
    if (this.left === 0) { if (done !== null) (done as (f: boolean) => void)(true); return; }
    for (const a of this.list) a.start((finished: boolean): void => {
      if (!finished) { failed = true; if (this.together) this.stop(); }
      this.left--;
      if (this.left === 0 && done !== null) (done as (f: boolean) => void)(!failed);
    });
  }
  stop(): void { for (const a of this.list) a.stop(); }
  reset(): void { for (const a of this.list) a.reset(); }
}
class Wait extends CompositeAnimation {
  ms: number; at: number = -1; done: ((finished: boolean) => void) | null = null;
  constructor(ms: number) { super(); this.ms = ms; }
  start(done: ((finished: boolean) => void) | null = null): void { const v = new Value(0); timing(v, { toValue: 1, duration: this.ms, easing: Easing.linear }).start(done); }
}
class Loop extends CompositeAnimation {
  a: CompositeAnimation; n: i32; reset0: boolean; i: i32 = 0; stopped: boolean = false;
  constructor(a: CompositeAnimation, n: i32, reset0: boolean) { super(); this.a = a; this.n = n; this.reset0 = reset0; }
  start(done: ((finished: boolean) => void) | null = null): void {
    this.i = 0; this.stopped = false;
    const again = (finished: boolean): void => {
      if (!finished || this.stopped) { if (done !== null) (done as (f: boolean) => void)(false); return; }
      this.i++;
      if (this.n >= 0 && this.i >= this.n) { if (done !== null) (done as (f: boolean) => void)(true); return; }
      if (this.reset0) this.a.reset();
      this.a.start(again);
    };
    if (this.n === 0) { if (done !== null) (done as (f: boolean) => void)(true); return; }
    this.a.start(again);
  }
  stop(): void { this.stopped = true; this.a.stop(); }
  reset(): void { this.a.reset(); }
}
export function sequence(list: CompositeAnimation[]): CompositeAnimation { return new Sequence(list); }
export function parallel(list: CompositeAnimation[], stopTogether: boolean = true): CompositeAnimation { return new Parallel(list, stopTogether); }
export function delay(ms: number): CompositeAnimation { return new Wait(ms); }
export function stagger(ms: number, list: CompositeAnimation[]): CompositeAnimation {
  const each: CompositeAnimation[] = [];
  for (let i = 0; i < list.length; i++) each.push(sequence([delay(ms * i), list[i]]));
  return parallel(each);
}
/** iterations -1: forever. */
export function loop(a: CompositeAnimation, iterations: i32 = -1, resetBeforeIteration: boolean = true): CompositeAnimation { return new Loop(a, iterations, resetBeforeIteration); }
