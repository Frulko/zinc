import { project, plot, rgb } from '../pixel';
import { world, tileX, tileY } from '../world/world';
import { economy } from '../world/economy';
import { sound } from '../audio';

// A burning ruin (a building of the risks rule's `ruin` type with Building.burn above 0): flame tongues rising and flickering over the tile, and a column of smoke that
// leans downwind. View only: no state, nothing saved or hashed; every flame and puff is a pure function of the time and its number, so the sim stays deterministic.
const FLAMES = 18, PUFFS = 10, REACH = 1.2;
const FLAME: u32[] = [rgb(255, 238, 150), rgb(255, 190, 64), rgb(238, 112, 40), rgb(184, 56, 32)];
let nextCrackle = 0;
const burning = (b: { alive: boolean; type: number; burn: number }): boolean => b.alive && b.burn > 0 && b.type === economy.risk.ruin;
const fract = (v: number): number => v - Math.floor(v);

/** Calls `add(sx, sy, left, up, right, down)` with the screen rectangle each fire needs redrawn (`scale` = pixels per unit): the flames and the smoke above them. */
export function fireDirty(add: (sx: number, sy: number, l: number, u: number, r: number, d: number) => void, scale: number): void {
  for (const b of world.buildings) {
    if (!burning(b)) continue;
    const t = b.j * world.size + b.i, a = project(tileX(t), tileY(t), 0);
    add(a.sx, a.sy, 2.4 * scale, 7.2 * scale, 3 * scale, 1.4 * scale);
  }
}
/** Draws the flames and smoke of every burning ruin and, at intervals, a crackle. */
export function drawFire(time: number): void {
  let any = false;
  for (const b of world.buildings) {
    if (!burning(b)) continue;
    any = true;
    const t = b.j * world.size + b.i, x = tileX(t), y = tileY(t), seed = b.i * 3.1 + b.j * 1.7;
    for (let k = 0; k < FLAMES; k++) {                                   // each tongue climbs, thins and starts again; its colour cools with height
      const age = fract(time * (1.3 + (k % 4) * .17) + k * .37 + seed), px = x + (fract(k * .618 + seed) - .5) * REACH * 1.5, py = y + (fract(k * .382 + .2 + seed) - .5) * REACH * 1.2;
      const z = .12 + age * (1.0 + (k % 3) * .3), sway = Math.sin(time * 9 + k * 2.1) * .08 * (1 - age), c = FLAME[Math.min(3, Math.floor(age * 4))];
      for (let w = 0; w < 3; w++) for (let h = 0; h < 5 - Math.floor(age * 3); h++) plot(px + sway + (w - 1) * .05 * (1 - age), py, z + h * .05, c);
    }
    for (let k = 0; k < PUFFS; k++) {                                    // smoke: dark puffs that rise slowly, widen and drift
      const age = fract(time * .3 + k / PUFFS + seed * .1), z = .8 + age * 3.2, shade = Math.floor(70 + age * 70), c = rgb(shade, shade, shade + 6), r = .06 + age * .09;
      const px = x + age * .9 + Math.sin(k * 3.7 + time) * .12, py = y - age * .3 + (fract(k * .7) - .5) * .5;
      for (let a = -1; a <= 1; a++) for (let h = -1; h <= 1; h++) if (a * a + h * h < 3) plot(px + a * r, py, z + h * r, c);
    }
  }
  if (any && time >= nextCrackle) { nextCrackle = time + 1.2; sound('crackle', .6); }
}
