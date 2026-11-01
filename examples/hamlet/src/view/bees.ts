import { project, plot, sphere, rgb } from '../pixel';
import { world, tileX, tileY } from '../world/world';
import { economy } from '../world/economy';
import { resting } from '../rules/meadow';
import { sound } from '../audio';

// The bees of the hives (buildings with a `bloom` in economy.json): a few dots loop in the air round each working hive, and a buzz plays now and then.
// View only: no state, nothing saved or hashed; each bee is a pure function of the time, so the sim stays deterministic.
const BEES = 6, REACH = 1.7, HEIGHT = .9;
let nextBuzz = 0;
const active = (type: number): boolean => economy.buildings[type].bloom !== null && !resting(economy.buildings[type]);

/** Where bee `k` of a hive at (x, y) flies at `time`: a lazy loop that drifts, with a quick wobble (a different phase and size per bee). */
function beeAt(x: number, y: number, k: number, time: number, out: number[]): void {
  const a = time * (.9 + k * .13) + k * 1.9, wide = REACH * (.55 + .45 * Math.sin(time * .31 + k));
  out[0] = x + Math.cos(a) * wide + Math.sin(time * 9 + k) * .05;
  out[1] = y + Math.sin(a * 1.3) * wide * .7;
  out[2] = HEIGHT + .35 * Math.sin(a * .8 + k) + Math.sin(time * 11 + k * 2) * .04;
}
/** Calls `add(sx, sy, left, up, right, down)` with the screen rectangle each working hive's bees need redrawn (`scale` = pixels per unit). */
export function beesDirty(add: (sx: number, sy: number, l: number, u: number, r: number, d: number) => void, scale: number): void {
  for (const b of world.buildings) {
    if (!b.alive || b.workers === 0 || !active(b.type)) continue;
    const t = b.j * world.size + b.i, a = project(tileX(t), tileY(t), HEIGHT);
    add(a.sx, a.sy, REACH * 1.3 * scale, REACH * 1.2 * scale, REACH * 1.3 * scale, REACH * .9 * scale);
  }
}
/** Draws the bees of every working hive and, at intervals, the buzz of the nearest ones. */
export function drawBees(time: number): void {
  const at: number[] = [0, 0, 0];
  let any = false;
  for (const b of world.buildings) {
    if (!b.alive || b.workers === 0 || !active(b.type)) continue;
    any = true;
    const t = b.j * world.size + b.i, x = tileX(t), y = tileY(t);
    for (let k = 0; k < BEES; k++) {
      beeAt(x, y, k, time + b.i * .7, at);
      sphere(at[0], at[1], at[2], .06, [236, 186, 48], 'solid'); plot(at[0] - .08, at[1] + .04, at[2] + .08, rgb(250, 250, 240)); plot(at[0] + .08, at[1] - .04, at[2] + .08, rgb(250, 250, 240));
    }
  }
  if (any && time >= nextBuzz) { nextBuzz = time + 1.5; sound('buzz', .5); }
}
