// The tour's state, no drawing: the page shown, the clock, the simulated sensors and the music player. The pages read it and call its
// actions; LVGL keeps what is on the screen.
import { PIN_CODE } from './constants';

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

export class AppState {
  page: i32 = 0;
  uptime: number = 0;
  // sensors, moving slowly
  load: number = 42;
  temperature: number = 22.4;
  humidity: i32 = 48;
  throughput: i32 = 120;
  // the controls page
  taps: i32 = 0;
  pin: string = '';
  unlocked: boolean = false;
  sync: number = 0;
  // the player
  track: i32 = 0;
  playing: boolean = false;
  position: number = 72;
  // LVGL's figures, read every STATS_EVERY seconds (lv.stats()): -1 when the computer has no heap to report
  fps: number = 0;
  lvglMs: number = 0;
  slowestMs: number = 0;
  areas: i32 = 0;
  pixels: i32 = 0;
  freeHeap: i32 = -1;
  minHeap: i32 = -1;
}

export const state = new AppState();

let seed: i32 = 2432;
/** A repeatable pseudo-random number in [0, 1). */
export function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

/** The clock and the sensors, every frame. */
export function tick(dt: number): void {
  state.uptime += dt;
  const t = state.uptime;
  state.load = 50 + 30 * Math.sin(t * 0.7) + 10 * Math.sin(t * 2.3);
  state.temperature = 22 + 1.5 * Math.sin(t * 0.2);
  state.humidity = Math.round(48 + 6 * Math.sin(t * 0.13));
  state.throughput = Math.round(120 + 60 * Math.sin(t * 0.9) + 25 * rand());
  state.sync = (state.sync + dt / 4) % 1;
  if (state.playing) {
    state.position += dt;
    if (state.position >= TRACKS[state.track].seconds) skip(1);
  }
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

export function togglePlay(): void { state.playing = !state.playing; }
export function skip(by: i32): void {
  state.track = (state.track + by + TRACKS.length) % TRACKS.length;
  state.position = 0;
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
}

export function seek(fraction: number): void { state.position = fraction * TRACKS[state.track].seconds; }
