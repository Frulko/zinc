// The check's state, no drawing: the cross to tap, the taps since the map was last applied (where each was meant, where the finger
// landed and lifted), and what they say: how far off the screen is, the affine map that corrects it, how far off it leaves them, and the
// confidence in that map. A finger scatters its taps (8 to 10 px on the ESP32-2432S022): the map is known to the scatter left once it is
// applied, times sqrt(3 / taps) (the standard error of a least-squares fit of three coefficients an axis), so each round makes it surer.
import * as device from 'zinc:device';
import { SCREEN_H, SCREEN_W, SURE_PX, TARGET_X, TARGET_Y } from './constants';
import { AffineMap, affine, compose, distance, fitAffine, spread } from './core/fit';

export class Tap {
  target: i32; meantX: i32; meantY: i32; firstX: i32; firstY: i32; lastX: i32; lastY: i32; moved: i32; frames: i32;
  constructor(target: i32, firstX: i32, firstY: i32, lastX: i32, lastY: i32, moved: i32, frames: i32) {
    this.target = target; this.meantX = TARGET_X[target]; this.meantY = TARGET_Y[target];
    this.firstX = firstX; this.firstY = firstY; this.lastX = lastX; this.lastY = lastY; this.moved = moved; this.frames = frames;
  }
}

export class Report {
  taps: i32 = 0;
  rounds: i32 = 0;
  meanError: number = 0; maxError: number = 0;   // pixels from each cross to where the finger lifted
  map: AffineMap = new AffineMap();              // the map that fits every tap since the last apply
  meanFitted: number = 0; maxFitted: number = 0; // the same, once the taps go through the map
  known: number = 0;                             // the map is known to this many pixels
  confidence: number = 0;                        // 0..1, 1 when the map is known exactly, 0 at SURE_PX
  moved: number = -1;                            // pixels the last round moved the map at the screen's corners (-1: one round only)
  meanX: number[] = []; meanY: number[] = [];    // where the finger lifted on average, cross by cross
}

export class CheckState {
  target: i32 = 0;           // the cross shown
  round: i32 = 1;            // since the last apply
  measuring: boolean = true; // the crosses, or the round's report
  applied: i32 = 0;          // maps applied so far
  taps: Tap[] = [];
  // the finger now: down for `frames` frames, where it landed, where it is, how far it went from there
  down: boolean = false;
  firstX: i32 = 0; firstY: i32 = 0; lastX: i32 = 0; lastY: i32 = 0; moved: i32 = 0; frames: i32 = 0;
}
export const state = new CheckState();

/** The pointer of a frame while the crosses are shown; the tap that a lift ends, else null. */
export function track(down: boolean, x: i32, y: i32): Tap | null {
  let tap: Tap | null = null;
  if (down && !state.down) { state.firstX = x; state.firstY = y; state.moved = 0; state.frames = 0; }
  if (down) {
    state.lastX = x; state.lastY = y; state.frames++;
    state.moved = Math.max(state.moved, Math.abs(x - state.firstX) + Math.abs(y - state.firstY));
  }
  if (!down && state.down) {
    tap = new Tap(state.target, state.firstX, state.firstY, state.lastX, state.lastY, state.moved, state.frames);
    state.taps.push(tap);
    state.target++;
    if (state.target === TARGET_X.length) { state.target = 0; state.measuring = false; }
  }
  state.down = down;
  return tap;
}

function fitTaps(count: i32): AffineMap {
  const rawX: number[] = [], rawY: number[] = [], meantX: number[] = [], meantY: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = state.taps[i];
    rawX.push(t.lastX); rawY.push(t.lastY); meantX.push(t.meantX); meantY.push(t.meantY);
  }
  return fitAffine(rawX, rawY, meantX, meantY);
}

/** What the taps since the last apply say (where the finger lifted: what a click takes). */
export function report(): Report {
  const r = new Report();
  r.taps = state.taps.length;
  r.rounds = Math.floor(r.taps / TARGET_X.length);
  r.map = fitTaps(r.taps);
  const sumX: number[] = [], sumY: number[] = [], count: number[] = [];
  let squares = 0;
  for (let i = 0; i < TARGET_X.length; i++) { sumX.push(0); sumY.push(0); count.push(0); }
  for (let i = 0; i < r.taps; i++) {
    const t = state.taps[i];
    const off = distance(t.lastX, t.lastY, t.meantX, t.meantY);
    const fitted = distance(r.map.x(t.lastX, t.lastY), r.map.y(t.lastX, t.lastY), t.meantX, t.meantY);
    r.meanError += off / r.taps; r.maxError = Math.max(r.maxError, off);
    r.meanFitted += fitted / r.taps; r.maxFitted = Math.max(r.maxFitted, fitted);
    squares += fitted * fitted;
    sumX[t.target] += t.lastX; sumY[t.target] += t.lastY; count[t.target]++;
  }
  for (let i = 0; i < TARGET_X.length; i++) { r.meanX.push(sumX[i] / Math.max(1, count[i])); r.meanY.push(sumY[i] / Math.max(1, count[i])); }
  r.known = r.taps > 3 ? Math.sqrt(squares / (r.taps - 3)) * Math.sqrt(3 / r.taps) : SURE_PX;   // the scatter left, unbiased
  r.confidence = Math.max(0, 1 - r.known / SURE_PX);
  if (r.rounds >= 2) r.moved = spread(r.map, fitTaps(r.taps - TARGET_X.length), SCREEN_W, SCREEN_H);
  return r;
}

/** Another round of crosses, the taps kept. */
export function nextRound(): void { state.round++; state.measuring = true; }

/** Hands the fitted map to the touch (on top of the one it has, through which the taps were measured) and starts measuring again; false
 *  where the system owns the touch (the computer: the map is only shown). */
export function applyMap(map: AffineMap): boolean {
  const done = device.setTouchMap(compose(map, affine(device.touchMap())).coefficients());
  if (done) { state.applied++; state.taps = []; state.round = 1; }
  state.measuring = true;
  return done;
}

/** Forgets the taps; with `identity`, the touch's map too (the controller's own pixels again). */
export function reset(identity: boolean): void {
  if (identity) device.setTouchMap([1, 0, 0, 0, 1, 0]);
  state.taps = []; state.round = 1; state.target = 0; state.measuring = true;
}
