import N from './native/gpio.spec';
import { env } from 'zinc:sys';
export class PinEdge { pin: u8 = 0; value: u8 = 0; timestampMs: f64 = 0; sequence: f64 = 0; }
enum WatchState { idle, watching }
class Pin {
  state: WatchState = WatchState.idle; timer: i32 = -1; generation: i32 = 0; epoch: i32 = 0;
  nativeGeneration: i32 = 0; cb: (e: PinEdge) => void = (e: PinEdge) => {};
}
function transition(p: Pin, state: WatchState): boolean {
  if (p.state === state) return false;
  if ((p.state === WatchState.idle && state === WatchState.watching) || (p.state === WatchState.watching && state === WatchState.idle)) { p.state = state; return true; }
  throw new Error('gpio: illegal watch transition');
}
const pins: Pin[] = [];
enum InitState { cold, initializing, ready, failed }
let initState: InitState = InitState.cold;
function initTransition(state: InitState): void {
  if ((initState === InitState.cold && state === InitState.initializing) || (initState === InitState.initializing && (state === InitState.ready || state === InitState.failed))) { initState = state; return; }
  throw new Error('gpio: illegal initialization transition');
}
function checked(ok: boolean): void { if (!ok) throw new Error('gpio: ' + N.error()); }
function pinOf(pin: u8): Pin {
  if (initState === InitState.failed) throw new Error('gpio: initialization failed');
  if (initState === InitState.cold) {
    initTransition(InitState.initializing);
    try {
    for (let i: i32 = 0; i < 256; i++) pins.push(new Pin());
    const script = env('ZINC_GPIO_SCRIPT');
    const steps = script.split(',');
    for (let i: i32 = 0; i < steps.length && i < 64; i++) {
      const s = steps[i]; const colon = s.indexOf(':'); const at = s.indexOf('@');
      if (colon < 0) break;
      const n = parseInt(s.slice(0, colon)) as u8;
      const v = parseInt(at < 0 ? s.slice(colon + 1) : s.slice(colon + 1, at)) as u8;
      const ms = at < 0 ? 0 : parseFloat(s.slice(at + 1));
      const epoch = pins[n].epoch;
      setTimeout(() => { if (pins[n].epoch === epoch) simulate(n, v); }, ms);
    }
    initTransition(InitState.ready);
    } catch (e) { initTransition(InitState.failed); throw e; }
  }
  return pins[pin];
}
function stop(p: Pin): void {
  if (p.timer >= 0) clearInterval(p.timer);
  p.timer = -1; p.generation++; transition(p, WatchState.idle);
}
/** Select a chip label (or /dev/gpiochipN) and local offset string or exact line name; 'sim' selects simulation. Releases the old line. */
export function select(pin: u8, chip: string, line: string): void {
  const p = pinOf(pin); checked(N.select(pin, chip, line)); stop(p); p.epoch++;
}
/** pull: none/up/down/keep; drive: push-pull/open-drain/open-source. Initial output is set atomically with the request. */
export function setup(pin: u8, mode: string, pull: string, drive: string = 'push-pull', initial: u8 = 0): void {
  pinOf(pin); checked(N.setup(pin, mode, pull, drive, initial));
}
export function write(pin: u8, value: u8): void { pinOf(pin); checked(N.write(pin, value)); }
export function read(pin: u8): u8 {
  pinOf(pin); const value = N.read(pin); if (value < 0) throw new Error('gpio: ' + N.error()); return value as u8;
}
export function watch(pin: u8, edge: string, debounceMs: u16, cb: (e: PinEdge) => void): void {
  const p = pinOf(pin); stop(p);
  const nativeGeneration = N.watch(pin, edge, debounceMs);
  if (nativeGeneration < 0) throw new Error('gpio: ' + N.error());
  p.nativeGeneration = nativeGeneration; p.cb = cb; transition(p, WatchState.watching);
  if (!N.simulated(pin)) p.timer = setInterval(() => { pump(pin); }, 2);
}
function pump(pin: u8): void {
  const p = pinOf(pin); if (p.state !== WatchState.watching) return;
  const generation = p.generation;
  const events = N.poll(pin, p.nativeGeneration);
  if (N.error() !== '') { stop(p); throw new Error('gpio: ' + N.error()); }
  for (let i: i32 = 0; i + 2 < events.length; i += 3) {
    const e = new PinEdge(); e.pin = pin; e.value = events[i] as u8; e.timestampMs = events[i + 1]; e.sequence = events[i + 2];
    const cb = p.cb;
    queueMicrotask(() => { if (p.generation === generation) cb(e); });
  }
}

export function unwatch(pin: u8): void {
  const p = pinOf(pin); if (p.state === WatchState.idle) return;
  stop(p); checked(N.watch(pin, 'none', 0) >= 0);
}
/** Release ownership; the electrical level after release is unspecified. Call before VM teardown/reload. */
export function release(pin: u8): void { const p = pinOf(pin); stop(p); p.epoch++; N.release(pin); checked(N.error() === ''); }
export function simulate(pin: u8, value: u8): void { pinOf(pin); checked(N.simulate(pin, value)); pump(pin); }
