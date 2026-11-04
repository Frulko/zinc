import { Sound, tone, fromSamples } from 'zinc:audio';

export let muted = false;
let initialized = false;
let ambience: Sound | null = null;
let ambienceKind = '';
const sounds = new Map<string, Sound>();
const waterLoops = new Map<string, Sound>();

function makeTone(name: string, hz: number, seconds: number, level: number, noise: boolean = false): void {
  const sound = tone(hz, seconds, noise ? 'noise' : 'triangle');
  sound.volume = level;
  sounds.set(name, sound);
}

export function ensureAudio(): void {
  if (initialized) return;
  initialized = true;
  makeTone('wood', 190, .09, .09);
  makeTone('throw', 330, .13, .035);
  makeTone('splash', 120, .35, .09, true);
  makeTone('soft', 170, .16, .025, true);
  makeTone('point', 660, .25, .05);
  makeTone('bird', 1400, .12, .014);
  makeTone('reel', 320, .04, .025);
  makeTone('line', 280, .10, .045);
  makeTone('fish', 880, .22, .045);
  makeTone('gun', 1900, .07, .03);
  makeTone('thud', 105, .14, .1);
  makeTone('roar', 90, .9, .06, true);
  makeTone('screech', 900, .4, .022, true);
  makeTone('beep', 1180, .12, .04);
  makeTone('chime', 520, .5, .035);
  makeTone('rumble', 62, 1.8, .09, true);
}

export function sound(kind: string, amount: number = .6): void {
  if (muted) return;
  ensureAudio();
  let name = 'wood';
  if (kind === 'splash' || kind === 'rain' || kind === 'thunder') name = 'splash';
  else if (kind === 'whoosh' || kind === 'jump' || kind === 'throw') name = 'throw';
  else if (kind === 'point' || kind === 'cheer' || kind === 'land' || kind === 'delivered') name = 'point';
  else if (kind === 'gull' || kind === 'bird') name = 'bird';
  else if (kind === 'reel' || kind === 'line' || kind === 'fish' || kind === 'gun' || kind === 'thud' || kind === 'roar' || kind === 'screech' || kind === 'beep' || kind === 'chime' || kind === 'rumble') name = kind;
  else if (kind === 'soft' || kind === 'cat') name = 'soft';
  const effect = sounds.get(name);
  if (effect !== undefined) (effect as Sound).voice((effect as Sound).volume * Math.max(0, Math.min(1, amount)), 1, 0, false);
}

/** The pit lane (a murmur of engines and crowd) and deep space (a low hum with a slow swell). */
function makeDrone(kind: string): Sound {
  const rate: i32 = 24000;
  const samples: number[] = [];
  const space = kind === 'space';
  let state: u32 = 51213, low = 0;
  for (let i = 0; i < rate * 4; i++) {
    state = (Math.imul(state as i32, 1664525) + 1013904223) as u32;
    const noise = state / 4294967296 * 2 - 1;
    low += (noise - low) * (space ? .006 : .06);
    const time = i / rate;
    const swell = .7 + .3 * Math.sin(time * Math.PI * 2 / 4);
    const hum = space ? Math.sin(time * 2 * Math.PI * 55) * .05 + Math.sin(time * 2 * Math.PI * 82.5) * .025 : Math.sin(time * 2 * Math.PI * 110) * .01;
    samples.push((low * (space ? 1.6 : .45) + hum) * swell);
  }
  // Blend the tail into the head so the native loop has no hard discontinuity.
  const cross: i32 = 1200;
  for (let i = 0; i < cross; i++) {
    const mix = i / cross;
    samples[samples.length - cross + i] = samples[samples.length - cross + i] * (1 - mix) + samples[i] * mix;
  }
  samples.splice(0, cross);
  const result = fromSamples(samples, 1, rate);
  result.loop = true;
  result.volume = muted ? 0 : .24;
  return result;
}

function makeWater(kind: string): Sound {
  const rate: i32 = 24000;
  const samples: number[] = [];
  let state: u32 = 84293, low = 0;
  const river = kind.startsWith('river');
  const winter = kind.includes('winter');
  for (let i = 0; i < rate * 3; i++) {
    state = (Math.imul(state as i32, 1664525) + 1013904223) as u32;
    const noise = state / 4294967296 * 2 - 1;
    const filter=kind.includes('spring')?.08:kind.includes('autumn')?.035:winter?.018:river?.055:.025;
    low += (noise - low) * filter;
    const time = i / rate;
    const swell = .65 + .15 * Math.sin(time * Math.PI * 2 / 3) + .1 * Math.sin(time * Math.PI * 4 / 3);
    const trickle = Math.sin(time * 2 * Math.PI * (kind.includes('summer')?730:610)) * Math.sin(time * 2 * Math.PI * 7) * .004;
    samples.push(low * swell * (river ? .5 : .3) + (winter ? 0 : trickle));
  }
  // Blend the tail into the head so the native loop has no hard discontinuity.
  const cross: i32 = 1200;
  for (let i = 0; i < cross; i++) {
    const mix = i / cross;
    samples[samples.length - cross + i] = samples[samples.length - cross + i] * (1 - mix) + samples[i] * mix;
  }
  samples.splice(0, cross);
  const result = fromSamples(samples, 1, rate);
  result.loop = true;
  result.volume = muted ? 0 : .24;
  return result;
}

export function setAmbience(kind: string): void {
  ensureAudio();
  if (kind === ambienceKind) return;
  if (ambience !== null) (ambience as Sound).stop();
  ambienceKind = kind;
  if (kind === '') { ambience = null; return; }
  let loop = waterLoops.get(kind);
  if (loop === undefined) {
    const created = kind === 'pit' || kind === 'space' ? makeDrone(kind) : makeWater(kind);
    waterLoops.set(kind, created);
    loop = created;
  }
  ambience = loop as Sound;
  (ambience as Sound).volume = muted ? 0 : .24;
  (ambience as Sound).play();
}

export function toggleSound(): void {
  muted = !muted;
  if (ambience !== null) (ambience as Sound).volume = muted ? 0 : .24;
  if (muted) for (const effect of sounds.values()) effect.stop();
}
export function pauseSound(paused: boolean): void {
  if (ambience !== null) (ambience as Sound).volume = paused || muted ? 0 : .24;
}
export function disposeAudio(): void {
  for (const effect of sounds.values()) effect.unload();
  for (const loop of waterLoops.values()) loop.unload();
  sounds.clear(); waterLoops.clear(); ambience = null; initialized = false; ambienceKind = '';
}
export function setMotion(kind: string, level: number): void {
  if (level <= 0) { if (ambienceKind === kind) setAmbience(''); return; }
  setAmbience(kind);
  if (ambience !== null) (ambience as Sound).volume = muted ? 0 : Math.min(.12, level * .06);
}
export function audioRain(level: number): void { setMotion('rain', level); }
