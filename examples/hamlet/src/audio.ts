// The sound bank of Hamlet: every effect and ambience is synthesised once from a few lines of maths (no files), then played with a little pitch and
// volume jitter so repeats never sound the same. Audio alone: the rules call `sound(kind, amount)` and run headless without the renderer.
import { Sound, fromSamples } from 'zinc:audio';
import { settings } from './settings';

export let muted = false;
const RATE: i32 = 22050;
const TAU = Math.PI * 2;
const bank = new Map<string, Sound[]>();
const loops = new Map<string, Sound>();
/** What the debug window reads (ui/Debug.ts): voices started, the last effect, the ambience playing. */
export const audioStats = { voices: 0, last: '', ambience: '' };
let ready = false, ambience: Sound | null = null, ambienceKind = '', paused = false;
let seed: u32 = 2463534242;
function rnd(): number { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }
function noise(): number { return rnd() * 2 - 1; }

/** Builds a mono sound of `seconds` from a function of the time and the progress (0..1). */
function make(seconds: number, f: (t: number, p: number) => number, gain: number): Sound {
  const n = Math.floor(seconds * RATE), out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.max(-1, Math.min(1, f(i / RATE, i / n))) * gain);
  return fromSamples(out, 1, RATE);
}
function add(name: string, sound: Sound, volume: number): void {
  sound.volume = volume;
  const list = bank.get(name);
  if (list === undefined) bank.set(name, [sound]); else list.push(sound);
}
const sine = (hz: number, t: number): number => Math.sin(TAU * hz * t);
const decay = (p: number, k: number): number => Math.exp(-p * k);
const attack = (t: number, s: number): number => Math.min(1, t / s);

function note(hz: number, t: number, p: number, k: number, partials: number): number {
  let v = 0;
  for (let h = 1; h <= partials; h++) v += sine(hz * h, t) / h;
  return v * decay(p, k);
}

function build(): void {
  ready = true;
  // The interface: a click, a hover tick, a window opening and closing, a refusal.
  add('click', make(.05, (t, p) => (sine(1500, t) * .6 + sine(2250, t) * .3) * decay(p, 9), 1), .30);
  add('tick', make(.025, (t, p) => sine(2200, t) * decay(p, 8), 1), .12);
  add('open', make(.14, (t, p) => sine(480 + 340 * p, t) * Math.sin(Math.PI * p) * .8, 1), .25);
  add('close', make(.14, (t, p) => sine(820 - 340 * p, t) * Math.sin(Math.PI * p) * .8, 1), .22);
  add('error', make(.2, (t, p) => (sine(150, t) > 0 ? .5 : -.5) * decay(p, 3) * (p < .5 ? 1 : .6) + noise() * .05, 1), .22);
  add('notify', make(.5, (t, p) => (note(880, t, p, 6, 2) + (t > .1 ? note(1175, t - .1, p, 6, 2) : 0)) * .5, 1), .30);
  // Building: knocks of wood with three timbres, a gravel crunch for roads, a swish for demolition.
  for (const hz of [150, 175, 205]) add('place', make(.16, (t, p) => (sine(hz, t) * .8 + noise() * .35 * decay(p, 30)) * decay(p, 14), 1), .55);
  add('road', make(.12, (t, p) => noise() * decay(p, 12) * (.6 + .4 * sine(70, t)), 1), .40);
  let low = 0;
  add('erase', make(.3, (t, p) => { low += (noise() - low) * (.05 + .25 * (1 - p)); return low * Math.sin(Math.PI * p) * 2; }, 1), .50);
  // Work: the axe, the tree falling, the saw, the hammer on iron, the bow.
  for (const hz of [260, 300]) add('chop', make(.14, (t, p) => (sine(hz, t) * .5 + sine(hz * 1.9, t) * .2 + noise() * .5 * decay(p, 40)) * decay(p, 18), 1), .55);
  let f = 0;
  add('fall', make(.9, (t, p) => { f += (noise() - f) * (.3 - .27 * p); return (f * 2.4 + sine(90 - 50 * p, t) * .5) * Math.sin(Math.PI * Math.min(1, p * 1.3)) + (p < .02 ? noise() : 0); }, 1), .6);
  let s = 0;
  add('saw', make(.42, (t, p) => { s += (noise() - s) * .5; const saw = ((t * 130) % 1) * 2 - 1; return (saw * .35 + s * .5) * (.6 + .4 * sine(11, t)) * Math.sin(Math.PI * p); }, 1), .28);
  add('hammer', make(.35, (t, p) => (sine(930, t) * .5 + sine(1480, t) * .35 + sine(2410, t) * .2) * decay(p, 12) + noise() * .4 * decay(p, 80), 1), .30);
  let w = 0;
  add('bow', make(.22, (t, p) => { w += (noise() - w) * (.1 + .5 * p); return w * 1.8 * Math.sin(Math.PI * p) + sine(240 + 600 * p, t) * .15 * decay(p, 6); }, 1), .30);
  add('hit', make(.12, (t, p) => (sine(110, t) + noise() * .4) * decay(p, 22), 1), .50);
  // Water: a splash, then bubbles rising for a catch.
  let wl = 0;
  add('splash', make(.5, (t, p) => { wl += (noise() - wl) * .12; return wl * 2.2 * Math.sin(Math.PI * Math.pow(p, .5)) * decay(p, 2.5); }, 1), .50);
  add('fish', make(.35, (t, p) => sine(500 + 1100 * p * p, t) * decay(p, 5) * Math.sin(Math.PI * Math.min(1, p * 2)), 1), .30);
  add('step', make(.07, (t, p) => noise() * decay(p, 16) * .8 + sine(70, t) * decay(p, 14), 1), .18);
  // Rewards and signals: coins, a bell with its inharmonic partials, a fanfare, a horn, an alarm.
  add('coin', make(.4, (t, p) => (sine(988, t) * (t < .07 ? 1 : 0) + sine(1319, t) * (t >= .07 ? 1 : 0)) * decay(p, 5) * attack(t, .004), 1), .30);
  add('bell', make(1.6, (t, p) => (sine(523, t) + sine(523 * 2.76, t) * .5 + sine(523 * 5.4, t) * .25) * decay(p, 4) * attack(t, .003) * .5, 1), .40);
  const tune = [523, 659, 784, 1046];
  add('fanfare', make(1.3, (t, p) => {
    const i = Math.min(3, Math.floor(t / .22)), local = t - i * .22, last = i === 3 ? 1 : 0;
    return (note(tune[i], local, local * (last ? 1.5 : 5), 4, 4) * .5) * (i === 3 ? Math.max(0, 1 - Math.max(0, t - .66) / .6) : 1);
  }, 1), .35);
  let hl = 0;
  add('horn', make(.9, (t, p) => { const saw = ((t * 196) % 1) * 2 - 1; hl += (saw - hl) * .12; return hl * 1.4 * Math.sin(Math.PI * Math.pow(p, .6)); }, 1), .35);
  add('alarm', make(.7, (t, p) => (sine(Math.floor(t / .1) % 2 === 0 ? 720 : 960, t) > 0 ? .4 : -.4) * Math.sin(Math.PI * p), 1), .25);
  // Nature: three bird songs, a gull-like cry, a cricket phrase, a wolf-free night owl.
  add('bird', make(.35, (t, p) => sine(2600 + 1100 * Math.sin(p * 14), t) * Math.sin(Math.PI * p) * (Math.sin(p * 40) > -.2 ? 1 : 0), 1), .20);
  add('bird', make(.3, (t, p) => sine(3200 - 1500 * p, t) * Math.sin(Math.PI * p) * decay(p, 1.5), 1), .22);
  add('bird', make(.5, (t, p) => { const k = Math.floor(p * 4); return sine(2200 + k * 350 + 200 * Math.sin(p * 90), t) * Math.sin(Math.PI * ((p * 4) % 1)) * .8; }, 1), .20);
  add('gull', make(.7, (t, p) => sine(1500 + 500 * Math.sin(p * 9) * (1 - p), t) * Math.sin(Math.PI * p) * (.7 + .3 * noise()), 1), .16);
  add('cricket', make(.9, (t, p) => sine(4300, t) * (Math.sin(TAU * 28 * t) > .2 ? 1 : 0) * (Math.sin(p * Math.PI * 3) > 0 ? 1 : 0) * .5, 1), .10);
  add('owl', make(.9, (t, p) => (sine(390, t) * .8 + sine(780, t) * .2) * Math.sin(Math.PI * p) * (p < .45 || p > .55 ? 1 : .1), 1), .18);
  // Bees and the pour: a buzz (two detuned saw hums with a slow wobble, an ambient sound) and a liquid glug that rises in pitch as the jug fills.
  add('buzz', make(1.1, (t, p) => { const saw = ((t * 232) % 1) * 2 - 1, saw2 = ((t * 241) % 1) * 2 - 1; return (saw + saw2) * .3 * (.55 + .45 * sine(34, t)) * Math.sin(Math.PI * p); }, 1), .16);
  add('pour', make(.7, (t, p) => { w += (noise() - w) * .25; return (w * .5 + sine(320 + 520 * p, t) * (sine(19, t) > 0 ? .35 : .15)) * Math.sin(Math.PI * Math.pow(p, .7)) * .8; }, 1), .32);
  // Risks: a blaze (a low roar with crackling pops), a quieter crackle for the ambience over a burning ruin, and a collapse (a crash of stone and beams that settles into a rumble).
  let fr = 0, fc = 0;
  add('fire', make(1.6, (t, p) => { fr += (noise() - fr) * .06; return (fr * 2.2 + (rnd() < .02 ? noise() * 1.4 : 0)) * Math.sin(Math.PI * Math.pow(p, .5)) * (.8 + .2 * sine(7, t)); }, 1), .45);
  add('crackle', make(.9, (t, p) => { fc += (noise() - fc) * .08; return (fc * 1.2 + (rnd() < .012 ? noise() : 0)) * Math.sin(Math.PI * p); }, 1), .22);
  let cl = 0;
  add('collapse', make(1.5, (t, p) => { cl += (noise() - cl) * (.4 - .3 * p); return cl * 2.4 * decay(p, 3.5) + sine(58 - 24 * p, t) * decay(p, 2.2) * .8 + ((t > .28 && t < .33) || (t > .55 && t < .58) ? noise() * .5 : 0); }, 1), .6);
  add('wind', make(2.2, (t, p) => { w += (noise() - w) * .02; return w * 3 * Math.sin(Math.PI * p); }, 1), .30);
}

function loopOf(kind: string): Sound {
  const seconds = 4, n = RATE * seconds, out: number[] = [];
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE, x = noise();
    a += (x - a) * (kind === 'water' ? .06 : kind === 'winter' ? .012 : .02);
    b += (x - b) * .004;
    const gust = .6 + .25 * Math.sin(TAU * t / 4) + .15 * Math.sin(TAU * t / 2);   // a whole number of cycles over 4 s: the loop closes by itself
    let v = (a * (kind === 'water' ? .55 : .4) + b * 2) * gust;
    if (kind === 'forest') v += (Math.sin(TAU * 5 * t) > .98 ? x * .06 : 0);       // a leaf now and then
    if (kind === 'water') v += sine(640 + 80 * Math.sin(TAU * t / 2), t) * Math.sin(TAU * 6 * t) * .006;
    out.push(v);
  }
  const cross = 1500;                                                              // the tail melts into the head for noise, which is not periodic
  for (let i = 0; i < cross; i++) { const m = i / cross; out[n - cross + i] = out[n - cross + i] * (1 - m) + out[i] * m; }
  out.splice(0, cross);
  const loop = fromSamples(out, 1, RATE);
  loop.loop = true;
  return loop;
}

const ALIAS = new Map<string, string>([['wood', 'place'], ['soft', 'erase'], ['point', 'coin'], ['throw', 'bow'], ['delivered', 'coin'], ['cheer', 'coin'], ['land', 'coin'],
  ['whoosh', 'bow'], ['jump', 'bow'], ['rain', 'splash'], ['reel', 'tick'], ['line', 'bow'], ['milestone', 'fanfare'], ['settlers', 'horn'], ['warn', 'notify'], ['urgent', 'alarm'], ['hoof', 'tick'], ['rustle', 'wind']]);

/** Plays an effect at `amount` (0..1); `pan` is -1..1. Unknown kinds are ignored. Pitch and volume change a little each time. */
export function sound(kind: string, amount: number = .6, pan: number = 0): void {
  if (muted || paused && kind !== 'click' && kind !== 'open' && kind !== 'close') return;
  if (!ready) build();
  const name = ALIAS.get(kind) ?? kind, list = bank.get(name);
  if (list === undefined) return;
  audioStats.voices++; audioStats.last = name;
  const s = list[Math.floor(rnd() * list.length)];
  s.voice(s.volume * (AMBIENT.has(name) ? settings.ambienceVolume : settings.sfxVolume) * Math.max(0, Math.min(1, amount)) * (.85 + rnd() * .3), .92 + rnd() * .16, Math.max(-1, Math.min(1, pan)), false);
}

const AMBIENT = new Set<string>(['bird', 'gull', 'cricket', 'owl', 'wind', 'buzz', 'crackle']);
const LEVEL = .22;
function level(): number { return muted || paused ? 0 : LEVEL * settings.ambienceVolume; }
/** Applies the ambience volume at once (the options screen calls it while the slider moves). */
export function refreshVolume(): void { if (ambience !== null) (ambience as Sound).volume = level(); }
export function setAmbience(kind: string): void {
  if (!ready) build();
  const key = kind === 'meadow' || kind === '' ? kind : kind;
  if (key === ambienceKind) return;
  if (ambience !== null) (ambience as Sound).stop();
  ambienceKind = key; audioStats.ambience = key;
  if (key === '') { ambience = null; return; }
  let loop = loops.get(key);
  if (loop === undefined) { const created = loopOf(key); loops.set(key, created); loop = created; }
  ambience = loop as Sound;
  (ambience as Sound).volume = level();
  (ambience as Sound).play();
}
export function toggleSound(): void {
  muted = !muted;
  if (ambience !== null) (ambience as Sound).volume = level();
}
export function pauseSound(isPaused: boolean): void {
  paused = isPaused;
  if (ambience !== null) (ambience as Sound).volume = level();
}

let until = 0;
/**
 * The living background, called every frame with the elapsed seconds: it picks the loop of the place (forest near trees, water by a lake, wind in winter)
 * and, at random moments, a bird by day, a cricket or an owl by night, a gust. `season` 0..3 (spring..winter), `night` 0..1, `trees` 0..1 share of forest.
 */
export function ambientTick(dt: number, season: number, night: number, trees: number): void {
  if (muted || paused) return;
  setAmbience(season === 3 ? 'winter' : trees > .25 ? 'forest' : 'meadow');
  until -= dt;
  if (until > 0) return;
  until = 1.2 + rnd() * 4.5 * (season === 3 ? 2 : 1);
  const pan = rnd() * 1.6 - .8;
  if (night > .6) sound(rnd() < .75 ? 'cricket' : 'owl', .5 + rnd() * .4, pan);
  else if (season === 3) { if (rnd() < .5) sound('wind', .6, pan); }
  else sound(rnd() < .12 ? 'wind' : rnd() < .1 ? 'gull' : 'bird', .4 + rnd() * .5, pan);
}
export function disposeAudio(): void {
  for (const list of bank.values()) for (const s of list) s.unload();
  for (const l of loops.values()) l.unload();
  bank.clear(); loops.clear(); ambience = null; ready = false; ambienceKind = '';
}
