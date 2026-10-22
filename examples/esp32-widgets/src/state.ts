// The tour's state, no drawing: the page shown, the clock, the simulated sensors, the music player, the benchmark and LVGL's figures. The
// pages read it and call its actions; LVGL keeps what is on the screen.
import { FRAME_MS, PAGE_BENCH, PAGE_MUSIC, PANEL_BYTES_PER_MS, PIN_CODE } from './constants';

export class Track {
  title: string; artist: string; seconds: i32; from: i32; to: i32;
  constructor(title: string, artist: string, seconds: i32, from: i32, to: i32) {
    this.title = title; this.artist = artist; this.seconds = seconds; this.from = from; this.to = to;
  }
}

export const TRACKS: Track[] = [
  new Track('Neon Drift', 'Zinc Ensemble', 214, 0x312e81, 0xdb2777),
  new Track('Low Tide', 'Band Rendering', 187, 0x0c4a6e, 0x14b8a6),
  new Track('Solar Wind', 'The Rasterizers', 242, 0x7c2d12, 0xf59e0b),
  new Track('Night Shift', 'DMA & the Bands', 199, 0x111827, 0x6d28d9),
];

/** A value eased from where it is to a target (ease in and out), stepped by the frame. */
export class Tween {
  value: number; from: number; to: number; t: number = 0; length: number = 0;
  constructor(v: number) { this.value = v; this.from = v; this.to = v; }
  go(to: number, seconds: number): void { this.from = this.value; this.to = to; this.t = 0; this.length = seconds; }
  step(dt: number): void {
    if (this.t >= this.length) { this.value = this.to; return; }
    this.t = Math.min(this.length, this.t + dt);
    const k = this.t / this.length, e = k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);
    this.value = this.from + (this.to - this.from) * e;
  }
}

export const BARS: i32 = 28;          // the player's spectrum
export const BENCH_MAX: i32 = 64;      // the benchmark's objects
export const BENCH_UNIT: i32 = 4096;   // the arena's side in the benchmark's positions
export const SCENES: string[] = ['Rects', 'Alpha', 'Text', 'Mix'];
const SAMPLES_PER_SECOND: number = 6;   // the throughput chart's samples, drawn as a line that moves every frame between two
export const HISTORY: i32 = 120;         // the throughput line's points, 30 a second: the last 4 s, kept while the page is not built
const POINT_EVERY: number = 1 / 30;

export class AppState {
  page: i32 = 0;
  uptime: number = 0;
  tour: boolean = false;
  turn: i32 = 0;              // the display's quarter turn: 0 portrait, 1 landscape
  tourClock: number = 0;
  // sensors: new readings every 1.5 s, the gauge eased toward its new value
  load: Tween = new Tween(0.42);
  temperature: number = 22.4;
  humidity: i32 = 48;
  throughput: i32 = 412;
  sample: number = 55;       // the last throughput sample and the one before, 0..100
  previous: number = 55;
  phase: number = 0;         // 0..1 between them
  readings: i32 = 0;         // counts the new readings, so a page sees that they changed
  history: number[] = [];    // the throughput line: point n at n % HISTORY
  points: i32 = 0;           // the points made since the start
  pointClock: number = 0;
  // the controls page
  taps: i32 = 0;
  pin: string = '';
  unlocked: boolean = false;
  sync: number = 0;
  // the player
  track: i32 = 0;
  playing: boolean = true;
  position: number = 72;
  energy: Tween = new Tween(1);   // how lively the spectrum is: 1 playing, 0 paused
  spectrum: number[] = [];        // 0..1 a bar, bass on the left
  // the benchmark: positions 0..BENCH_UNIT of the arena, so they fit any size, and speeds in units a second; integers, which mquickjs
  // computes without the board's software doubles and keeps without allocating
  scene: i32 = 0;
  count: i32 = 24;
  xs: i32[] = [];
  ys: i32[] = [];
  vx: i32[] = [];
  vy: i32[] = [];
  animated: boolean = false;      // LVGL moves them (lv.animate), not the program every frame
  running: i32 = -1;              // the scene a run measures, -1 when none
  runClock: number = 0;
  runFrames: i32 = 0;
  results: i32[] = [-1, -1, -1, -1];
  // LVGL's figures, read every STATS_EVERY seconds (lv.stats()): -1 when the computer has no heap to report
  fps: number = 0;
  lvglMs: number = 0;
  slowestMs: number = 0;
  areas: i32 = 0;
  pixels: i32 = 0;
  freeHeap: i32 = -1;
  minHeap: i32 = -1;
  poolUsed: i32 = 0;
  poolSize: i32 = 0;
  poolPeak: i32 = 0;
}

export const state = new AppState();

let seed: i32 = 2432;
/** A repeatable pseudo-random number in [0, 1). */
export function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

for (let i = 0; i < BARS; i++) state.spectrum.push(0);
for (let i = 0; i < HISTORY; i++) state.history.push(state.sample);
for (let i = 0; i < BENCH_MAX; i++) {
  state.xs.push(Math.floor(rand() * BENCH_UNIT)); state.ys.push(Math.floor(rand() * BENCH_UNIT));
  const a = rand() * 6.2832, s = (0.25 + rand() * 0.35) * BENCH_UNIT;
  state.vx.push(Math.round(Math.cos(a) * s)); state.vy.push(Math.round(Math.sin(a) * s));
}

function nextSample(): number {
  const v = state.sample;
  return Math.max(8, Math.min(96, v + (rand() - 0.5) * 22 + (55 - v) * 0.08));
}

let slow: number = 1.5;
function stepSensors(dt: number): void {
  state.load.step(dt);
  state.phase += dt * SAMPLES_PER_SECOND;
  while (state.phase >= 1) { state.phase -= 1; state.previous = state.sample; state.sample = nextSample(); }
  state.pointClock = Math.min(state.pointClock + dt, 0.2);
  while (state.pointClock >= POINT_EVERY) { state.pointClock -= POINT_EVERY; state.history[state.points % HISTORY] = throughputNow(); state.points++; }
  slow += dt;
  if (slow < 1.5) return;
  slow = 0;
  state.load.go(Math.max(0.08, Math.min(0.96, state.load.to + (rand() - 0.5) * 0.5)), 1.2);
  state.temperature = Math.round((state.temperature + (rand() - 0.5) * 0.6) * 10) / 10;
  state.humidity = Math.max(30, Math.min(70, state.humidity + Math.round((rand() - 0.5) * 4)));
  state.throughput = Math.round(state.sample * 7.3);
  state.readings++;
}

/** The throughput line's newest point, between the last two samples. */
export function throughputNow(): number { return state.previous + (state.sample - state.previous) * state.phase; }

let beat: number = 0;
function stepMusic(dt: number): void {
  state.energy.step(dt);
  if (state.playing) {
    state.position += dt;
    if (state.position >= TRACKS[state.track].seconds) skip(1);
  }
  beat = (beat + dt * 2) % 1;   // 120 beats a minute
  if (state.page !== PAGE_MUSIC) return;   // the spectrum is only seen there
  // each band follows a travelling wave and a kick on the beat, louder on the bass side; it jumps up and falls back slowly, as a meter does
  const e = state.energy.value, t = state.uptime, kick = Math.max(0, 1 - beat * 4);
  for (let i = 0; i < BARS; i++) {
    const band = i / BARS;
    const wave = 0.5 + 0.5 * Math.sin(t * 3.1 + i * 0.45) * Math.sin(t * 1.3 - i * 0.2);
    const level = e * Math.min(1, (0.15 + 0.55 * wave) * (1 - band * 0.55) + kick * 0.45 * (1 - band) + 0.2 * rand());
    const v = state.spectrum[i];
    state.spectrum[i] = level > v ? v + (level - v) * Math.min(1, dt * 30) : v + (level - v) * Math.min(1, dt * 5);
  }
}

function stepBench(dt: number): void {
  const ms = Math.round(dt * 1000);
  const xs = state.xs, ys = state.ys, vx = state.vx, vy = state.vy;
  for (let i = 0; !state.animated && i < state.count; i++) {   // the hidden ones wait where they are
    let x = xs[i] + ((vx[i] * ms) >> 10), y = ys[i] + ((vy[i] * ms) >> 10);   // a second of 1024 ms: a shift, not a division
    if (x < 0) { x = -x; vx[i] = -vx[i]; } else if (x > BENCH_UNIT) { x = 2 * BENCH_UNIT - x; vx[i] = -vx[i]; }
    if (y < 0) { y = -y; vy[i] = -vy[i]; } else if (y > BENCH_UNIT) { y = 2 * BENCH_UNIT - y; vy[i] = -vy[i]; }
    xs[i] = x; ys[i] = y;
  }
  if (state.running < 0) return;
  state.runClock += dt; state.runFrames++;
  if (state.runClock < 3) return;
  state.results[state.running] = Math.round(state.runFrames / state.runClock);
  state.runClock = 0; state.runFrames = 0;
  state.running = state.running + 1 < SCENES.length ? state.running + 1 : -1;
  if (state.running >= 0) { state.scene = state.running; return; }
  let s = 'widgets: bench of ' + state.count + ' objects' + (state.animated ? ' moved by LVGL,' : ',');   // the results in the console too: the board's UART keeps them
  for (let i = 0; i < SCENES.length; i++) s += ' ' + SCENES[i] + ' ' + state.results[i];
  console.log(s + ' fps');
}

/** The clock, the sensors, the player and the benchmark, every frame. */
export function tick(dt: number): void {
  state.uptime += dt;
  stepSensors(dt);
  stepMusic(dt);
  if (state.page === PAGE_BENCH) stepBench(dt);
  state.sync = (state.sync + dt / 4) % 1;
}

/** Takes the figures of lv.stats() gathered over `seconds`. */
export function takeStats(st: i32[], seconds: number): void {
  const turns = Math.max(1, st[0]);
  state.fps = st[0] / seconds;
  state.lvglMs = st[1] / turns / 1000;
  state.slowestMs = st[2] / 1000;
  state.areas = Math.round(st[3] / turns);
  state.pixels = Math.round(st[4] / turns);
  state.freeHeap = st[5];
  state.minHeap = st[6];
  state.poolUsed = st[7];
  state.poolSize = st[8];
  state.poolPeak = st[9];
}

/** Milliseconds a frame the board's panel bus needs for the pixels LVGL sends (the emulator and the computer do not count it). */
export function busMs(): number { return state.pixels * 2 / PANEL_BYTES_PER_MS; }
/** The board's frame rate as the figures say: LVGL renders an area while the bus sends the previous one, so the slower of the two sets the
 *  pace. On the computer LVGL's own time is not the board's: only the bus counts. */
export function boardFps(): number {
  const render = state.freeHeap < 0 ? 0 : state.lvglMs;
  return 1000 / Math.max(FRAME_MS, render, busMs());
}

export function clockText(seconds: number): string {
  const s = Math.floor(seconds), m = Math.floor(s / 60), r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

export function pressKey(k: string): void {
  if (k === 'C') { state.pin = ''; state.unlocked = false; return; }
  if (k === 'OK') { state.unlocked = state.pin === PIN_CODE; if (!state.unlocked) state.pin = ''; return; }
  if (state.pin.length < 4) state.pin += k;
}

export function togglePlay(): void {
  state.playing = !state.playing;
  state.energy.go(state.playing ? 1 : 0, 0.6);
}
export function skip(by: i32): void {
  state.track = (state.track + by + TRACKS.length) % TRACKS.length;
  state.position = 0;
}
export function seek(fraction: number): void { state.position = fraction * TRACKS[state.track].seconds; }

export function startRun(): void {
  state.running = 0; state.scene = 0; state.runClock = 0; state.runFrames = 0;
  state.results = [-1, -1, -1, -1];
}
