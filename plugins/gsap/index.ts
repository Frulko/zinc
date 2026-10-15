// GSAP's core API in Zinc (typed, no JavaScript engine): `import gsap from 'gsap'` runs in the interpreter, in a `zinc build` program, on
// every target the language reaches. The tweens, timelines, eases, staggers, position parameters, labels and utils of GSAP 3; what the
// typed language cannot carry is spelled otherwise:
//   - callbacks do not ride in the vars object (a function cannot become Dyn): `tween.onComplete(fn)` or `tween.eventCallback('onComplete', fn)`
//   - a custom ease is registered by name: `gsap.registerEase('mine', fn)`
//   - the clock is the program's: call `gsap.ticker.tick(dt)` once a frame (dt in seconds); nothing else drives it, so a run is deterministic
// The plugins of GSAP (ScrollTrigger, Flip, SplitText...) need a DOM; the original library with all of them runs on the QuickJS engine
// (examples/js-gsap). Easing formulas follow GSAP's eases (power, sine, expo, circ, back, elastic, bounce, steps).

const PI = Math.PI;
const TIME_EPS = 1e-9;

// ---------------------------------------------------------------- eases
export type EaseFn = (p: number) => number;
const customEases = new Map<string, EaseFn>();

function powerIn(n: number): EaseFn { return (p: number): number => Math.pow(p, n); }
function powerOut(n: number): EaseFn { return (p: number): number => 1 - Math.pow(1 - p, n); }
function powerInOut(n: number): EaseFn { return (p: number): number => p < 0.5 ? 0.5 * Math.pow(p * 2, n) : 1 - 0.5 * Math.pow((1 - p) * 2, n); }
function bounceOut(p: number): number {
  if (p < 1 / 2.75) return 7.5625 * p * p;
  if (p < 2 / 2.75) { const q = p - 1.5 / 2.75; return 7.5625 * q * q + 0.75; }
  if (p < 2.5 / 2.75) { const q = p - 2.25 / 2.75; return 7.5625 * q * q + 0.9375; }
  const q = p - 2.625 / 2.75;
  return 7.5625 * q * q + 0.984375;
}
function elasticOut(amp: number, per: number): EaseFn {
  const a = Math.max(1, amp), s = per / (2 * PI) * Math.asin(1 / a);
  return (p: number): number => p <= 0 ? 0 : p >= 1 ? 1 : a * Math.pow(2, -10 * p) * Math.sin((p - s) * (2 * PI) / per) + 1;
}

/** The ease of a name such as `power2.out`, `back.inOut(2)`, `elastic.out(1, 0.3)`, `steps(12)`, `none`; a name not known is linear. */
export function ease(name: string): EaseFn {
  const custom = customEases.get(name);
  if (custom !== undefined) return custom;
  let base = name, args: number[] = [];
  const open = name.indexOf('(');
  if (open >= 0) {
    base = name.slice(0, open);
    for (const part of name.slice(open + 1, name.length - 1).split(',')) { const v = parseFloat(part.trim()); if (!Number.isNaN(v)) args.push(v); }
  }
  const dot = base.indexOf('.');
  const kind = dot >= 0 ? base.slice(0, dot) : base, dir = dot >= 0 ? base.slice(dot + 1) : 'out';
  if (kind === 'none' || kind === 'linear') return (p: number): number => p;
  if (kind === 'steps') { const n = args.length > 0 ? args[0] : 12; return (p: number): number => p >= 1 ? 1 : Math.floor(p * n) / n; }
  let fwd: EaseFn;   // the "in" shape; out and inOut are made from it
  if (kind.startsWith('power') && kind.length === 6) { const n = parseInt(kind.slice(5)) + 1; return dir === 'in' ? powerIn(n) : dir === 'inOut' ? powerInOut(n) : powerOut(n); }
  if (kind === 'sine') fwd = (p: number): number => 1 - Math.cos(p * PI / 2);
  else if (kind === 'expo') fwd = (p: number): number => p <= 0 ? 0 : Math.pow(2, 10 * (p - 1));
  else if (kind === 'circ') fwd = (p: number): number => 1 - Math.sqrt(1 - p * p);
  else if (kind === 'back') { const o = args.length > 0 ? args[0] : 1.70158; fwd = (p: number): number => p * p * ((o + 1) * p - o); }
  else if (kind === 'bounce') fwd = (p: number): number => 1 - bounceOut(1 - p);
  else if (kind === 'elastic') {
    const out = elasticOut(args.length > 0 ? args[0] : 1, args.length > 1 ? args[1] : 0.3);
    fwd = (p: number): number => 1 - out(1 - p);
  } else return (p: number): number => p;
  const f = fwd;
  if (dir === 'in') return f;
  if (dir === 'inOut') return (p: number): number => p < 0.5 ? 0.5 * f(p * 2) : 1 - 0.5 * f((1 - p) * 2);
  return (p: number): number => 1 - f(1 - p);
}

// ---------------------------------------------------------------- animations
type Callback = () => void;

/** What a tween and a timeline share: where they sit in their parent, their speed, and the play controls. */
export class Animation {
  parent: Timeline | null = null;
  startTime: number = 0;          // in the parent's time
  time: number = 0;               // the playhead, in [0, totalDuration()]
  paused: boolean = false;
  reversed: boolean = false;
  timeScaleValue: number = 1;
  killed: boolean = false;
  started: boolean = false;
  completed: boolean = false;
  delayValue: number = 0;
  repeatCount: number = 0;        // -1: forever
  repeatDelayValue: number = 0;
  yoyoValue: boolean = false;
  lastRendered: number = -1;
  onStartCb: Callback | null = null;
  onUpdateCb: Callback | null = null;
  onCompleteCb: Callback | null = null;
  onRepeatCb: Callback | null = null;
  vars: any = null;

  /** One pass: the length of a single iteration. */
  iterationDuration(): number { return 0; }
  /** Delay, every iteration and the pauses between them. */
  totalDuration(): number {
    const it = this.iterationDuration();
    if (this.repeatCount < 0) return Infinity;
    return this.delayValue + it * (this.repeatCount + 1) + this.repeatDelayValue * this.repeatCount;
  }
  duration(): number { return this.iterationDuration(); }
  /** Applies the playhead `t` (in [0, totalDuration()]): moves the values; fires nothing. */
  renderAt(t: number): void {}

  /** Moves the playhead by `dt` of the parent's seconds; true when the animation has just ended. */
  advance(dt: number): boolean {
    if (this.paused || this.killed) return false;
    const total = this.totalDuration();
    const step = dt * this.timeScaleValue * (this.reversed ? -1 : 1);
    this.seekTo(Math.min(total, Math.max(0, this.time + step)), true);
    if (!this.reversed && this.time >= total && !this.completed) { this.completed = true; if (this.onCompleteCb !== null) this.onCompleteCb(); return true; }
    if (this.reversed && this.time <= 0 && !this.completed) { this.completed = true; if (this.onCompleteCb !== null) this.onCompleteCb(); return true; }
    return false;
  }
  seekTo(t: number, fire: boolean): void {
    const was = this.time;
    this.time = t;
    if (fire && !this.started && t > 0) { this.started = true; if (this.onStartCb !== null) this.onStartCb(); }
    const it = this.iterationDuration(), cycle = it + this.repeatDelayValue;
    if (fire && this.repeatCount !== 0 && cycle > 0 && this.onRepeatCb !== null) {
      const a = Math.floor(Math.max(0, was - this.delayValue) / cycle), b = Math.floor(Math.max(0, t - this.delayValue) / cycle);
      if (b > a && t - this.delayValue < this.totalDuration()) this.onRepeatCb();
    }
    this.renderAt(t);
    this.lastRendered = t;
    if (fire && this.onUpdateCb !== null) this.onUpdateCb();
  }

  // ---- controls (GSAP names)
  play(): Animation { this.paused = false; this.reversed = false; this.completed = false; return this; }
  pause(): Animation { this.paused = true; return this; }
  resume(): Animation { this.paused = false; return this; }
  reverse(): Animation { this.reversed = !this.reversed; this.paused = false; this.completed = false; return this; }
  restart(): Animation { this.paused = false; this.reversed = false; this.completed = false; this.started = false; this.seekTo(0, false); return this; }
  seek(t: number): Animation { this.seekTo(Math.min(this.totalDuration(), Math.max(0, t)), false); this.completed = false; return this; }
  progress(): number { const d = this.totalDuration(); return d > 0 && d < Infinity ? this.time / d : 0; }
  setProgress(p: number): Animation { const d = this.totalDuration(); if (d < Infinity) this.seekTo(Math.min(1, Math.max(0, p)) * d, false); return this; }
  timeScale(v: number): Animation { this.timeScaleValue = v; return this; }
  isActive(): boolean { return !this.paused && !this.killed && !this.completed && this.time > 0; }
  kill(): void { this.killed = true; if (this.parent !== null) this.parent.detach(this); else root.detach(this); }
  delay(v: number): Animation { this.delayValue = v; return this; }
  repeat(n: number): Animation { this.repeatCount = n; return this; }
  repeatDelay(v: number): Animation { this.repeatDelayValue = v; return this; }
  yoyo(on: boolean = true): Animation { this.yoyoValue = on; return this; }

  // ---- callbacks (a function cannot be a value of the vars object)
  onStart(fn: Callback): Animation { this.onStartCb = fn; return this; }
  onUpdate(fn: Callback): Animation { this.onUpdateCb = fn; return this; }
  onComplete(fn: Callback): Animation { this.onCompleteCb = fn; return this; }
  onRepeat(fn: Callback): Animation { this.onRepeatCb = fn; return this; }
  /** GSAP's name for the four above: 'onStart', 'onUpdate', 'onComplete', 'onRepeat'. */
  eventCallback(type: string, fn: Callback | null): Animation {
    if (type === 'onStart') this.onStartCb = fn; else if (type === 'onUpdate') this.onUpdateCb = fn;
    else if (type === 'onComplete') this.onCompleteCb = fn; else if (type === 'onRepeat') this.onRepeatCb = fn;
    return this;
  }
}

function num(vars: any, key: string, fallback: number): number {
  if (vars === null || vars === undefined) return fallback;
  const v = vars[key];
  return typeof v === 'number' ? v as number : fallback;
}
function has(vars: any, key: string): boolean { return vars !== null && vars !== undefined && vars[key] !== undefined; }
const RESERVED = ['duration', 'delay', 'ease', 'repeat', 'repeatDelay', 'yoyo', 'stagger', 'paused', 'immediateRender', 'overwrite', 'runBackwards', 'startAt',
  'data', 'id', 'lazy', 'keyframes', 'yoyoEase', 'repeatRefresh', 'defaults', 'smoothChildTiming', 'autoRemoveChildren'];

/** One target's values: the property names, where they start and where they go. */
class Channel {
  target: any;
  names: string[] = [];
  from: number[] = [];
  to: number[] = [];
  constructor(target: any) { this.target = target; }
}

/** A tween: some properties of one or several objects moved from a value to another with an ease. */
export class Tween extends Animation {
  targets: any[] = [];
  channels: Channel[] = [];
  easeFn: EaseFn = (p: number): number => p;
  dur: number = 0.5;
  private fromMode: boolean = false;
  private startVars: any = null;   // fromTo: the "from" values
  private ready: boolean = false;
  private staggerDelay: number[] = [];

  constructor(targets: any[], vars: any, mode: i32, fromVars: any) {
    super();
    this.targets = targets;
    this.vars = vars;
    this.fromMode = mode === 1;
    this.startVars = mode === 2 ? fromVars : null;
    this.dur = num(vars, 'duration', 0.5);
    this.delayValue = num(vars, 'delay', 0);
    this.repeatCount = num(vars, 'repeat', 0);
    this.repeatDelayValue = num(vars, 'repeatDelay', 0);
    this.yoyoValue = has(vars, 'yoyo') && vars['yoyo'] === true;
    this.paused = has(vars, 'paused') && vars['paused'] === true;
    if (has(vars, 'ease') && typeof vars['ease'] === 'string') this.easeFn = ease(vars['ease'] as string);
    else this.easeFn = ease('power1.out');
    this.staggerDelay = staggerOffsets(vars, targets.length);
  }

  iterationDuration(): number { return this.dur + this.maxStagger(); }
  private maxStagger(): number { let m = 0; for (const s of this.staggerDelay) m = Math.max(m, s); return m; }

  /** Records the start values (at the first render, as GSAP does, so values set meanwhile count). */
  private init(): void {
    if (this.ready) return;
    this.ready = true;
    const v = this.vars;
    for (const target of this.targets) {
      const ch = new Channel(target);
      for (const key in v) {
        if (RESERVED.indexOf(key) >= 0) continue;
        const cur = target[key];
        if (typeof cur !== 'number') continue;
        const now = cur as number;
        const raw = v[key];
        let begin = now;
        if (this.startVars !== null && this.startVars[key] !== undefined) { const f = this.startVars[key]; begin = typeof f === 'number' ? f as number : relative(f as string, now); }
        let goal = begin;   // "+=10" counts from where the tween starts
        if (typeof raw === 'number') goal = raw as number;
        else if (typeof raw === 'string') goal = relative(raw as string, begin);
        if (this.fromMode) { begin = goal; goal = now; }
        ch.names.push(key); ch.from.push(begin); ch.to.push(goal);
      }
      this.channels.push(ch);
    }
  }
  /** `from` and `fromTo` show their first values at once (GSAP's immediateRender). */
  showStart(): void {
    if (!(this.fromMode || this.startVars !== null)) return;
    if (has(this.vars, 'immediateRender') && this.vars['immediateRender'] === false) return;
    this.init();
    this.renderAt(0);
  }

  renderAt(t: number): void {
    this.init();
    const it = this.dur;
    const x = t - this.delayValue;
    for (let i = 0; i < this.channels.length; i++) {
      const ch = this.channels[i];
      const local = x - (this.staggerDelay.length > i ? this.staggerDelay[i] : 0);
      let p = 0;
      if (local > 0 && it > 0) {
        const cycle = it + this.repeatDelayValue;
        let iter = this.repeatCount === 0 ? 0 : Math.floor(local / cycle);
        if (this.repeatCount >= 0 && iter > this.repeatCount) iter = this.repeatCount;
        let within = local - iter * cycle;
        if (within > it) within = it;
        p = within / it;
        if (this.repeatCount >= 0 && iter === this.repeatCount && local >= this.repeatCount * cycle + it - TIME_EPS) p = 1;
        if (this.yoyoValue && iter % 2 === 1) p = 1 - p;
      } else if (local > 0 && it <= 0) p = 1;
      const e = this.easeFn(Math.min(1, Math.max(0, p)));
      for (let k = 0; k < ch.names.length; k++) ch.target[ch.names[k]] = ch.from[k] + (ch.to[k] - ch.from[k]) * e;
    }
  }
}

/** "+=50", "-=20", "*=2", "/=2" and plain numbers in strings ("100px" is 100: units are not carried). */
function relative(s: string, now: number): number {
  if (s.length > 2 && s.charAt(1) === '=') {
    const v = parseFloat(s.slice(2)), op = s.charAt(0);
    if (op === '+') return now + v; if (op === '-') return now - v; if (op === '*') return now * v; if (op === '/') return now / v;
  }
  const v = parseFloat(s);
  return Number.isNaN(v) ? now : v;
}

/** The start delay of each target for a `stagger` of a number or `{ each, amount, from, grid }`. */
function staggerOffsets(vars: any, n: number): number[] {
  const out: number[] = [];
  if (!has(vars, 'stagger') || n < 2) return out;
  const s = vars['stagger'];
  let each = 0, amount = 0, from = 'start', fromIndex = 0;
  if (typeof s === 'number') each = s as number;
  else {
    each = num(s, 'each', 0); amount = num(s, 'amount', 0);
    const f = s['from'];
    if (typeof f === 'string') from = f as string; else if (typeof f === 'number') { from = 'index'; fromIndex = f as number; }
  }
  if (amount > 0 && each === 0) each = amount / (n - 1);
  for (let i = 0; i < n; i++) {
    let d = i;
    if (from === 'end') d = n - 1 - i;
    else if (from === 'center') d = Math.abs(i - (n - 1) / 2);
    else if (from === 'edges') d = (n - 1) / 2 - Math.abs(i - (n - 1) / 2);
    else if (from === 'index') d = Math.abs(i - fromIndex);
    else if (from === 'random') d = Math.floor(rand() * n);
    out.push(d * each);
  }
  return out;
}

// ---------------------------------------------------------------- timelines
/** A timeline: animations placed on one clock (position parameter, labels), played as one. */
export class Timeline extends Animation {
  children: Animation[] = [];
  labels: Map<string, number> = new Map();
  defaults: any = null;
  private cursor: number = 0;   // the end of the last child added: where the next one goes by default

  constructor(vars: any = null) {
    super();
    this.vars = vars;
    if (vars !== null && vars !== undefined) {
      this.repeatCount = num(vars, 'repeat', 0); this.repeatDelayValue = num(vars, 'repeatDelay', 0);
      this.yoyoValue = has(vars, 'yoyo') && vars['yoyo'] === true;
      this.paused = has(vars, 'paused') && vars['paused'] === true;
      this.delayValue = num(vars, 'delay', 0);
      if (has(vars, 'defaults')) this.defaults = vars['defaults'];
    }
  }
  iterationDuration(): number {
    let end = 0;
    for (const c of this.children) end = Math.max(end, c.startTime + c.totalDuration() / c.timeScaleValue);
    return end;
  }
  /** Where a position parameter points: a number, "+=1", "-=0.5", "<", ">", "<0.5", "label", "label+=0.5". */
  position(pos: any): number {
    if (pos === undefined || pos === null) return this.cursor;
    if (typeof pos === 'number') return pos as number;
    const s = pos as string;
    const end = this.iterationDuration();
    const last = this.children.length > 0 ? this.children[this.children.length - 1] : null;
    if (s.length > 1 && s.charAt(1) === '=' && (s.charAt(0) === '+' || s.charAt(0) === '-')) {
      const v = parseFloat(s.slice(2));
      return end + (s.charAt(0) === '+' ? v : -v);
    }
    const c0 = s.charAt(0);
    if (c0 === '<' || c0 === '>') {
      const rest = s.slice(1);
      let base = c0 === '<' ? (last !== null ? last.startTime : 0) : this.cursor;
      if (rest.length > 0) {
        if (rest.length > 1 && rest.charAt(1) === '=') { const v = parseFloat(rest.slice(2)); base += rest.charAt(0) === '-' ? -v : v; }
        else { const v = parseFloat(rest); if (!Number.isNaN(v)) base += v; }
      }
      return base;
    }
    // label, then an optional +=/-= offset
    let name = s, off = 0;
    const plus = s.indexOf('+='), minus = s.indexOf('-=');
    const cut = plus >= 0 ? plus : minus;
    if (cut > 0) { name = s.slice(0, cut); off = parseFloat(s.slice(cut + 2)) * (plus >= 0 ? 1 : -1); }
    const at = this.labels.get(name);
    if (at !== undefined) return (at as number) + off;
    const asNumber = parseFloat(s);
    return Number.isNaN(asNumber) ? this.cursor : asNumber;
  }
  /** Adds an animation at a position; callbacks go through call(), labels through addLabel(). */
  add(a: Animation, pos: any = undefined): Timeline {
    a.startTime = this.position(pos);
    this.attach(a);
    return this;
  }
  private attach(a: Animation): void {
    if (a.parent !== null) a.parent.detach(a);
    root.detach(a);
    a.parent = this;
    this.children.push(a);
    this.cursor = a.startTime + a.totalDuration() / a.timeScaleValue;
  }
  detach(a: Animation): void {
    const i = this.children.indexOf(a);
    if (i >= 0) this.children.splice(i, 1);
    if (a.parent === this) a.parent = null;
  }
  addLabel(name: string, pos: any = undefined): Timeline { this.labels.set(name, this.position(pos)); return this; }
  call(fn: Callback, pos: any = undefined): Timeline {
    const t = new Tween([{ v: 0 }], { duration: 0 }, 0, null);
    t.onComplete(fn);
    t.startTime = this.position(pos);
    this.attach(t);
    return this;
  }
  private put(target: any, vars: any, mode: i32, fromVars: any, pos: any): Tween {
    let merged = vars;
    if (this.defaults !== null) { merged = {}; for (const k in this.defaults) merged[k] = this.defaults[k]; for (const k in vars) merged[k] = vars[k]; }
    const tw = new Tween(asArray(target), merged, mode, fromVars);
    tw.startTime = this.position(pos);
    this.attach(tw);
    tw.showStart();
    return tw;
  }
  to(target: any, vars: any, pos: any = undefined): Timeline { this.put(target, vars, 0, null, pos); return this; }
  from(target: any, vars: any, pos: any = undefined): Timeline { this.put(target, vars, 1, null, pos); return this; }
  fromTo(target: any, fromVars: any, toVars: any, pos: any = undefined): Timeline { this.put(target, toVars, 2, fromVars, pos); return this; }
  set(target: any, vars: any, pos: any = undefined): Timeline { const v: any = {}; for (const k in vars) v[k] = vars[k]; v['duration'] = 0; this.put(target, v, 0, null, pos); return this; }

  renderAt(t: number): void {
    const x = t - this.delayValue;
    const it = this.iterationDuration();
    let local = x < 0 ? 0 : x;
    if (this.repeatCount !== 0 && it > 0) {
      const cycle = it + this.repeatDelayValue;
      let iter = Math.floor(local / cycle);
      if (this.repeatCount >= 0 && iter > this.repeatCount) iter = this.repeatCount;
      local = local - iter * cycle;
      if (local > it) local = it;
      if (this.yoyoValue && iter % 2 === 1) local = it - local;
    }
    const forward = local >= this.lastLocal;
    this.lastLocal = local;
    const order = this.children.slice();
    if (!forward) order.reverse();
    for (const c of order) {
      const rel = (local - c.startTime) * c.timeScaleValue;
      const total = c.totalDuration();
      if (rel < 0 && !(c.lastRendered > 0) && c.lastRendered !== -1) { c.seekTo(0, false); continue; }
      if (rel < 0 && c.lastRendered === -1) continue;
      const clamped = Math.min(total, Math.max(0, rel));
      if (clamped === c.lastRendered && clamped !== 0 && clamped !== total) continue;
      c.seekTo(clamped, true);
      if (clamped >= total && !c.completed && c.onCompleteCb !== null) { c.completed = true; c.onCompleteCb(); }
      if (clamped < total) c.completed = false;
    }
  }
  private lastLocal: number = 0;
}

function asArray(target: any): any[] {
  if (Array.isArray(target)) return target as any[];
  return [target];
}

// ---------------------------------------------------------------- the clock
export class Ticker {
  time: number = 0;
  frame: number = 0;
  deltaTime: number = 0;
  listeners: ((time: number, dt: number) => void)[] = [];
  add(fn: (time: number, dt: number) => void): void { this.listeners.push(fn); }
  remove(fn: (time: number, dt: number) => void): void { const i = this.listeners.indexOf(fn); if (i >= 0) this.listeners.splice(i, 1); }
  /** Advances every animation by `dt` seconds and calls the listeners: once a frame, with the frame's delta. */
  tick(dt: number): void {
    this.deltaTime = dt;
    this.time += dt;
    this.frame++;
    root.step(dt);
    for (const l of this.listeners.slice()) l(this.time, dt);
  }
}

/** The top of every tree: the animations not inside a timeline. */
class Root {
  items: Animation[] = [];
  step(dt: number): void {
    for (const a of this.items.slice()) {
      if (a.killed) { this.detach(a); continue; }
      const ended = a.advance(dt);
      if (ended && a.parent === null && !(a.repeatCount < 0)) this.detach(a);
    }
  }
  attach(a: Animation): void { if (this.items.indexOf(a) < 0) this.items.push(a); }
  detach(a: Animation): void { const i = this.items.indexOf(a); if (i >= 0) this.items.splice(i, 1); }
}
const root = new Root();

// ---------------------------------------------------------------- random (deterministic: a program's run must repeat)
let seed: i32 = 123456789;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

// ---------------------------------------------------------------- utils
class Utils {
  clamp(min: number, max: number, v: number): number { return Math.min(max, Math.max(min, v)); }
  mapRange(inMin: number, inMax: number, outMin: number, outMax: number, v: number): number { return outMin + (v - inMin) / (inMax - inMin) * (outMax - outMin); }
  normalize(min: number, max: number, v: number): number { return (v - min) / (max - min); }
  interpolate(a: number, b: number, p: number): number { return a + (b - a) * p; }
  random(min: number, max: number, snapTo: number = 0): number {
    const v = min + rand() * (max - min);
    return snapTo > 0 ? Math.round(v / snapTo) * snapTo : v;
  }
  snap(step: number, v: number): number { return Math.round(v / step) * step; }
  wrap(min: number, max: number, v: number): number { const r = max - min; return r === 0 ? min : ((v - min) % r + r) % r + min; }
  wrapYoyo(min: number, max: number, v: number): number {
    const r = max - min, m = ((v - min) % (r * 2) + r * 2) % (r * 2);
    return min + (m > r ? r * 2 - m : m);
  }
  toArray(v: any): any[] { return asArray(v); }
}

// ---------------------------------------------------------------- the entry point
class Gsap {
  version: string = '3.15.0-zinc';
  ticker: Ticker = new Ticker();
  utils: Utils = new Utils();
  private defaultVars: any = null;

  private make(target: any, vars: any, mode: i32, fromVars: any): Tween {
    let merged = vars;
    if (this.defaultVars !== null) { merged = {}; for (const k in this.defaultVars) merged[k] = this.defaultVars[k]; for (const k in vars) merged[k] = vars[k]; }
    const tw = new Tween(asArray(target), merged, mode, fromVars);
    root.attach(tw);
    tw.showStart();
    return tw;
  }
  to(target: any, vars: any): Tween { return this.make(target, vars, 0, null); }
  from(target: any, vars: any): Tween { return this.make(target, vars, 1, null); }
  fromTo(target: any, fromVars: any, toVars: any): Tween { return this.make(target, toVars, 2, fromVars); }
  set(target: any, vars: any): Tween {
    const v: any = {};
    for (const k in vars) v[k] = vars[k];
    v['duration'] = 0;
    const tw = this.make(target, v, 0, null);
    tw.seek(0.0001);   // applied now, not at the next frame
    return tw;
  }
  timeline(vars: any = null): Timeline {
    const tl = new Timeline(vars);
    root.attach(tl);
    return tl;
  }
  /** Calls `fn` once after `delay` seconds. */
  delayedCall(delay: number, fn: Callback): Tween {
    const tw = new Tween([{ v: 0 }], { duration: 0, delay: delay }, 0, null);
    tw.onComplete(fn);
    root.attach(tw);
    return tw;
  }
  /** Settings every later tween starts from (`gsap.defaults({ ease: 'power2.out', duration: 1 })`). */
  defaults(vars: any): void { this.defaultVars = vars; }
  registerEase(name: string, fn: EaseFn): void { customEases.set(name, fn); }
  /** The ease function of a name, as GSAP's `gsap.parseEase`. */
  parseEase(name: string): EaseFn { return ease(name); }
  killTweensOf(target: any): void {
    for (const a of root.items.slice()) {
      if (a instanceof Tween) { for (const t of (a as Tween).targets) if (t === target) a.kill(); }
    }
  }
  /** Every animation not yet finished at the top level. */
  getTweensOf(target: any): Tween[] {
    const out: Tween[] = [];
    for (const a of root.items) if (a instanceof Tween) { for (const t of (a as Tween).targets) if (t === target) out.push(a as Tween); }
    return out;
  }
  /** Moves the clock without a frame: `gsap.tick(0.5)`. */
  tick(dt: number): void { this.ticker.tick(dt); }
  /** Stops and forgets everything (a test between scenes). */
  reset(): void { root.items = []; }
}

const gsap = new Gsap();
export default gsap;
export { gsap };
