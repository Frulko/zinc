// Pit stop rules: brake onto the box, let the crew work, release the car on the green light.
// World units: the car heads along +x, the lane is y in [-4.4, 4.4], the box centre is x = 0.
export interface Corner { x: number; y: number; side: number; }
export interface Stage { stage: number; k: number; }
/** Wheel 0 front near, 1 front far, 2 rear near, 3 rear far ("near" is the side the camera sees). */
export const CORNERS: Corner[] = [
  { x: 2.8, y: 1.45, side: 1 }, { x: 2.8, y: -1.45, side: -1 },
  { x: -2.5, y: 1.5, side: 1 }, { x: -2.5, y: -1.5, side: -1 },
];
export const ENTRY_X = -30;
export const MARK_X = 0;
export const ENTRY_SPEED = 16;
export const BRAKE = 8;          // full braking, units/s^2: 16 u/s needs 16 units
export const ACCEL = 21;
export const EXIT_X = 30;
/** Seconds of each stage of a wheel change: gun off, wheel off, wheel on, gun on. Slower than the real 2 s on purpose: every gesture must be readable. */
export const STAGE_TIME: number[] = [.55, .45, .45, .55];
export const JACK_UP = .5;
export const DONE_HOLD = .45;      // hands up, board rising, before the light turns green
export const DROP = .3;            // jacks down
export const PERFECT = 1.1;        // stopping within this of the mark costs nothing
export const PENALTY_RATE = .3;    // seconds per unit beyond it

export const pit = {
  phase: 'ready',
  time: 0,
  run: 0,
  x: ENTRY_X,
  speed: 0,
  brake: false,
  pressure: 0,
  lift: 0,
  service: 0,
  readyAt: 0,
  greenAt: 0,
  goAt: 0,
  launchAt: 0,
  offset: 0,
  offset0: 0,
  measured: false,
  stopX: 0,
  penalty: 0,
  falseStarts: 0,
  reaction: 0,
  result: 0,
  best: 0,
  newBest: false,
  stoppedAt: 0,
  brakedAt: -10,
  delays: [0, 0, 0, 0] as number[],
  message: '',
};

function jitter(run: number, i: number): number {
  const s = Math.sin(run * 12.9898 + i * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function startRun(): void {
  pit.run++;
  pit.phase = 'approach';
  pit.x = ENTRY_X; pit.speed = ENTRY_SPEED; pit.brake = false; pit.pressure = 0; pit.lift = 0;
  pit.service = 0; pit.penalty = 0; pit.falseStarts = 0; pit.reaction = 0; pit.result = 0; pit.newBest = false;
  pit.offset = 0; pit.offset0 = 0; pit.measured = false; pit.stopX = 0; pit.message = '';
  let slowest = 0;
  for (let i = 0; i < 4; i++) { pit.delays[i] = jitter(pit.run, i) * .3; slowest = Math.max(slowest, pit.delays[i]); }
  pit.readyAt = JACK_UP + slowest + STAGE_TIME[0] + STAGE_TIME[1] + STAGE_TIME[2] + STAGE_TIME[3];
  pit.greenAt = pit.readyAt + DONE_HOLD;
}

export function resetPit(): void {
  pit.phase = 'ready'; pit.x = ENTRY_X; pit.speed = 0; pit.lift = 0; pit.service = 0; pit.brake = false; pit.message = '';
  pit.penalty = 0; pit.result = 0; pit.newBest = false;
}

/** Where a wheel change stands at `t` seconds after the stop: stage 0 waiting, 1 gun off, 2 wheel off, 3 wheel on, 4 gun on, 5 done. */
export function stageOf(i: number, t: number): Stage {
  let s = t - JACK_UP - pit.delays[i];
  if (s < 0) return { stage: 0, k: 0 };
  for (let st = 0; st < 4; st++) {
    if (s < STAGE_TIME[st]) return { stage: st + 1, k: s / STAGE_TIME[st] };
    s -= STAGE_TIME[st];
  }
  return { stage: 5, k: 1 };
}

export function setBrake(on: boolean): void {
  if (pit.phase !== 'approach') return;
  if (on && !pit.brake) pit.brakedAt = pit.time;
  pit.brake = on;
}

/** The driver goes: only on the green light. Too early costs a second and the car stays put. */
export function pressGo(): boolean {
  if (pit.phase !== 'service' && pit.phase !== 'release') return false;
  if (pit.phase === 'service') {
    if (pit.service < pit.readyAt - .1) { pit.penalty += 1; pit.falseStarts++; pit.message = 'early'; }
    return false;
  }
  pit.phase = 'launch';
  pit.reaction = pit.service - pit.greenAt;
  pit.goAt = pit.service;
  pit.launchAt = pit.time;
  return true;
}

function finish(): void {
  pit.phase = 'over';
  pit.result = pit.goAt + pit.penalty;
  if (pit.best <= 0 || pit.result < pit.best) { pit.best = pit.result; pit.newBest = true; }
}

export function advancePit(dt: number): void {
  pit.time += dt;
  if (pit.phase === 'approach') {
    // The pedal builds up while held and eases off when released: the driver can feather it to land on the mark.
    pit.pressure = pit.brake ? Math.min(1, pit.pressure + dt * 5) : Math.max(0, pit.pressure - dt * 7);
    let decel = .35 + pit.pressure * BRAKE;
    // The driver's touch near the box: slow enough, he lands on the mark; stopped short, he creeps up to it.
    const gap = MARK_X - pit.x;
    if (pit.speed < 6 && gap > .06 && gap < 8) decel = Math.max(decel, Math.min(14, pit.speed * pit.speed / (2 * gap)));
    pit.speed = Math.max(0, pit.speed - decel * dt);
    // Past the front jack he stands on the brakes.
    if (pit.x > 4.2 && pit.speed > 0) pit.speed = Math.max(0, pit.speed - 40 * dt);
    pit.x += pit.speed * dt;
    if (pit.x > 9) { pit.x = 9; pit.speed = 0; }
    if (pit.speed < .3 && !pit.measured && pit.x > ENTRY_X + 2) { pit.measured = true; pit.offset0 = pit.x - MARK_X; }
    if (pit.speed < .3 && pit.x < MARK_X - .06 && pit.x > MARK_X - 8 && pit.measured) pit.speed = 1.2;
    if (Math.abs(pit.x - MARK_X) < .08 && pit.speed < 2 && pit.measured) { pit.x = MARK_X; pit.speed = 0; }
    if (pit.speed <= 0 && pit.x > ENTRY_X + 2) {
      pit.phase = 'service'; pit.service = 0; pit.stoppedAt = pit.time; pit.stopX = pit.x;
      pit.offset = pit.x - MARK_X;
      pit.penalty += Math.min(2.5, Math.max(0, Math.abs(pit.offset0) - PERFECT) * PENALTY_RATE);
      pit.brake = false; pit.pressure = 0;
    }
  } else if (pit.phase === 'service' || pit.phase === 'release') {
    pit.service += dt;
    pit.lift = Math.min(1, Math.max(0, (pit.service - .05) / (JACK_UP - .1)));
    if (pit.phase === 'service' && pit.service >= pit.greenAt) pit.phase = 'release';
    if (pit.phase === 'release' && pit.service - pit.greenAt > 4) pressGo();
  } else if (pit.phase === 'launch') {
    const since = pit.time - pit.launchAt;
    pit.lift = Math.max(0, 1 - since / DROP);
    if (since > DROP * .8) {
      pit.speed += ACCEL * dt;
      pit.x += pit.speed * dt;
    }
    if (pit.x > EXIT_X) finish();
  }
}
