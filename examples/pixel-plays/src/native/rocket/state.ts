// Rocket launch rules: count down, then press Space while the sync needle is inside the green zone.
// World units: the rocket stands at the origin of the pad, z is the altitude of its foot.
export const COUNT_FROM = 5;         // seconds of countdown before the launch window opens
export const ZONE = .09;             // half width of the green zone on the 0..1 gauge
export const WINDOW = 9;             // seconds the window stays open
export const MISSES = 3;             // failed ignitions before the launch is scrubbed
export const IGNITION = 1.7;         // seconds the engines build up before the foot leaves the pad
export const NEEDLE_RATE = 4.2;      // rad/s of the sync needle; each miss makes it faster
export const OUT_OF_FRAME = 30;      // altitude at which the whole rocket and its flame have left the picture
export const OVER_AFTER = 1.4;       // seconds of smoke settling once it is gone

export const rocket = {
  phase: 'ready',
  time: 0,
  run: 0,
  clock: 0,
  count: COUNT_FROM,
  winT: 0,
  needle: .5,
  centre: .5,
  misses: 0,
  sync: 0,
  since: 0,
  thrust: 0,
  z: 0,
  speed: 0,
  goneAt: 0,
  flash: -10,
  best: 0,
  newBest: false,
  launched: false,
  message: '',
};

function jitter(run: number, i: number): number {
  const s = Math.sin(run * 12.9898 + i * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function startCount(): void {
  rocket.run++;
  rocket.phase = 'count';
  rocket.clock = 0; rocket.count = COUNT_FROM; rocket.winT = 0;
  rocket.centre = .3 + jitter(rocket.run, 1) * .4;
  rocket.needle = .5; rocket.misses = 0; rocket.sync = 0; rocket.since = 0; rocket.thrust = 0;
  rocket.z = 0; rocket.speed = 0; rocket.launched = false; rocket.newBest = false; rocket.message = '';
}

export function resetRocket(): void {
  rocket.phase = 'ready'; rocket.z = 0; rocket.speed = 0; rocket.thrust = 0; rocket.since = 0; rocket.misses = 0;
  rocket.sync = 0; rocket.launched = false; rocket.newBest = false; rocket.message = '';
}

/** Where the needle is, 0..1, `t` seconds into the window after `misses` failures. */
export function needleAt(t: number, misses: number): number {
  return .5 + .5 * Math.sin(t * NEEDLE_RATE * (1 + misses * .15));
}

/** Space: only meaningful while the window is open. True when the engines light. */
export function pressFire(): boolean {
  if (rocket.phase !== 'window') return false;
  const dev = Math.abs(rocket.needle - rocket.centre);
  if (dev <= ZONE) {
    rocket.sync = Math.round(100 - dev / ZONE * 60);
    rocket.phase = 'ignition'; rocket.since = 0; rocket.launched = true;
    if (rocket.best <= 0 || rocket.sync > rocket.best) { rocket.best = rocket.sync; rocket.newBest = true; }
    return true;
  }
  rocket.misses++;
  rocket.flash = rocket.time;
  rocket.message = dev < ZONE * 2 ? 'close' : 'far';
  if (rocket.misses >= MISSES) { rocket.phase = 'over'; rocket.message = 'scrub'; }
  return false;
}

export function advanceRocket(dt: number): void {
  rocket.time += dt;
  if (rocket.phase === 'count') {
    rocket.clock += dt;
    rocket.count = Math.max(0, Math.ceil(COUNT_FROM - rocket.clock));
    if (rocket.clock >= COUNT_FROM) { rocket.phase = 'window'; rocket.winT = 0; rocket.count = 0; }
  } else if (rocket.phase === 'window') {
    rocket.winT += dt;
    rocket.needle = needleAt(rocket.winT, rocket.misses);
    if (rocket.winT >= WINDOW) { rocket.phase = 'over'; rocket.message = 'scrub'; }
  } else if (rocket.phase === 'ignition') {
    rocket.since += dt;
    const k = Math.min(1, rocket.since / IGNITION);
    rocket.thrust = k * k * (3 - 2 * k);
    if (rocket.since >= IGNITION) { rocket.phase = 'flight'; rocket.speed = .4; }
  } else if (rocket.phase === 'flight') {
    rocket.since += dt;
    rocket.thrust = 1;
    rocket.speed += (2.4 + rocket.z * .07) * dt;
    rocket.z += rocket.speed * dt;
    if (rocket.z > OUT_OF_FRAME) { rocket.phase = 'gone'; rocket.goneAt = rocket.time; }
  } else if (rocket.phase === 'gone') {
    rocket.since += dt;
    rocket.thrust = Math.max(0, rocket.thrust - dt);
    if (rocket.time - rocket.goneAt > OVER_AFTER) rocket.phase = 'over';
  }
}
