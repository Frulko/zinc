// Sound hooks. Zinc has no audio module or plugin yet (targets/capabilities.json lists `audio`, nothing implements
// it), so play() only records the cue. Each cue carries the recipe of the synthesized sound it stands for, to be
// generated at startup once an audio output exists: a square wave swept from f0 to f1 Hz, or white noise, with a
// linear decay over `ms`. No samples, nothing copied. To wire it up, fill `output` with a function that queues PCM.
export class Recipe {
  constructor(public noise: boolean, public f0: number, public f1: number, public ms: number, public volume: number) {}
}

export const SFX_FLIPPER: i32 = 0, SFX_BUMPER: i32 = 1, SFX_SLING: i32 = 2, SFX_TARGET: i32 = 3, SFX_ROLLOVER: i32 = 4,
  SFX_SPINNER: i32 = 5, SFX_RAMP: i32 = 6, SFX_HOLE: i32 = 7, SFX_LAUNCH: i32 = 8, SFX_DRAIN: i32 = 9, SFX_TILT: i32 = 10,
  SFX_MISSION: i32 = 11, SFX_RANK: i32 = 12, SFX_MULTIBALL: i32 = 13, SFX_NUDGE: i32 = 14, SFX_EXTRA: i32 = 15;

export const RECIPES: Recipe[] = [
  new Recipe(true, 0, 0, 40, 0.5),        // flipper: a short noise thump
  new Recipe(false, 880, 440, 90, 0.7),   // bumper: a falling square blip
  new Recipe(false, 660, 330, 60, 0.6),   // slingshot
  new Recipe(false, 520, 520, 70, 0.6),   // drop target
  new Recipe(false, 1320, 1320, 40, 0.4), // rollover
  new Recipe(false, 1760, 1760, 15, 0.3), // spinner tick
  new Recipe(false, 440, 1760, 400, 0.6), // ramp: rising sweep
  new Recipe(false, 220, 55, 500, 0.7),   // wormhole: falling sweep
  new Recipe(true, 0, 0, 180, 0.6),       // launch
  new Recipe(false, 330, 110, 600, 0.6),  // drain
  new Recipe(true, 0, 0, 800, 0.8),       // tilt
  new Recipe(false, 523, 1046, 350, 0.7), // mission complete
  new Recipe(false, 392, 1568, 700, 0.8), // rank up
  new Recipe(false, 262, 2093, 900, 0.8), // multiball
  new Recipe(true, 0, 0, 60, 0.4),        // nudge
  new Recipe(false, 784, 1568, 500, 0.8), // extra ball
];

let enabled: boolean = true;
/** The audio back end, when there is one: called with the cue and its recipe. */
export let output: ((id: i32, r: Recipe) => void) | null = null;
/** Cues played so far (the demo and tests can look at them). */
export let played: i32 = 0;

export function setSound(on: boolean): void { enabled = on; }

export function play(id: i32): void {
  if (!enabled) return;
  played++;
  const o = output;
  if (o !== null) o(id, RECIPES[id]);
}
