// Resource deposits scattered on a generated terrain by rule: near rocks, near water, near trees or anywhere. No game types: a rule is numbers and a placement word.
import { hash } from '../world/noise';
import { TerrainLayers } from './terrain';
import { MOUNTAIN_LEVEL } from '../constants';

export const NEAR_ANY = 0;
export const NEAR_ROCK = 1;
export const NEAR_WATER = 2;
export const NEAR_TREE = 3;
export class DepositRule {
  near: number = NEAR_ANY; density: number = 1;   // deposits per 100 tiles
  required: boolean = false;                       // at least one lies within `reach` of the gate, whatever the dice say
}

function nearby(l: TerrainLayers, t: number, near: number): boolean {
  if (near === NEAR_ANY) return true;
  const w = l.width, h = l.height, i = t % w, j = Math.floor(t / w);
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
    const a = i + di, b = j + dj;
    if (a < 0 || b < 0 || a >= w || b >= h) continue;
    const u = b * w + a;
    if (near === NEAR_ROCK ? l.rock[u] > 0 : near === NEAR_WATER ? l.water[u] > 0 : l.forest[u] > 0) return true;
  }
  return false;
}
/** A step between adjacent tiles a walker cannot make: onto mountain rock or over a cliff. */
function blockedStep(l: TerrainLayers, a: number, b: number): boolean { return l.level[b] >= MOUNTAIN_LEVEL || Math.abs(l.level[a] - l.level[b]) >= 2; }
/** Deposits crowd the mountains: a tile of level 5 and up is worth three times a lowland tile, a lowland tile a third (when the map has relief at all). */
function relief(l: TerrainLayers, t: number): number { return l.level[t] >= 5 ? 3 : 1 / 3; }
function free(l: TerrainLayers, taken: number[], t: number): boolean {
  return l.outside[t] === 0 && l.water[t] === 0 && l.forest[t] === 0 && l.rock[t] === 0 && taken[t] === 0;
}
function hasOpenSide(l: TerrainLayers, taken: number[], t: number): boolean {
  const w = l.width, h = l.height, i = t % w, j = Math.floor(t / w);
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const a = i + di, b = j + dj;
    if (a >= 0 && b >= 0 && a < w && b < h && free(l, taken, b * w + a)) return true;
  }
  return false;
}
/** The tiles a walker standing on `from` reaches (1, else 0) over tiles that are neither water, border, rock, tree, nor a deposit already placed. */
function walkable(l: TerrainLayers, placed: number[], from: number): number[] {
  const w = l.width, h = l.height, seen: number[] = Array.from({ length: w * h }, (): number => 0), queue: number[] = [from];
  seen[from] = 1;
  const step = (t: number, u: number): void => {
    if (seen[u] === 1 || blockedStep(l, t, u) || l.outside[u] === 1 || l.water[u] === 1 || l.rock[u] > 0 || l.forest[u] > 0 || placed[u] === 1) return;
    seen[u] = 1; queue.push(u);
  };
  while (queue.length > 0) {                                                       // the flood fill runs a few thousand times on a big map: no allocation in the loop
    const t = queue.pop() as number, i = t % w;
    if (i < w - 1) step(t, t + 1);
    if (i > 0) step(t, t - 1);
    if (t + w < w * h) step(t, t + w);
    if (t >= w) step(t, t - w);
  }
  return seen;
}
let stamps: number[] = [], stamp = 0;                              // scratch for reach(): `stamps[u] === stamp` means seen in the current fill, so none is allocated per fill
function reach(l: TerrainLayers, placed: number[], from: number): number {
  const w = l.width, n = w * l.height;
  if (stamps.length !== n) { stamps = Array.from({ length: n }, (): number => 0); stamp = 0; }
  stamp++;
  const queue: number[] = [from];
  let count = 1;
  stamps[from] = stamp;
  const step = (t: number, u: number): void => {
    if (stamps[u] === stamp || blockedStep(l, t, u) || l.outside[u] === 1 || l.water[u] === 1 || l.rock[u] > 0 || l.forest[u] > 0 || placed[u] === 1) return;
    stamps[u] = stamp; count++; queue.push(u);
  };
  while (queue.length > 0) {
    const t = queue.pop() as number, i = t % w;
    if (i < w - 1) step(t, t + 1);
    if (i > 0) step(t, t - 1);
    if (t + w < n) step(t, t + w);
    if (t >= w) step(t, t - w);
  }
  return count;
}
/** Is a walker on `seen` next to t? */
function touches(l: TerrainLayers, seen: number[], t: number): boolean {
  const w = l.width, h = l.height, i = t % w, j = Math.floor(t / w);
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const a = i + di, b = j + dj;
    if (a >= 0 && b >= 0 && a < w && b < h && seen[b * w + a] === 1) return true;
  }
  return false;
}
const RING_I: number[] = [0, 1, 1, 1, 0, -1, -1, -1], RING_J: number[] = [-1, -1, 0, 1, 1, 1, 0, -1];   // the eight neighbours, clockwise from the north
/**
 * True when blocking t cannot split the walkable ground around it: the open neighbours of the ring (counting the four straight ones) form one arc, so a walker who
 * went through t can go round it. A dead end or a corner is that case too. Most tiles of a map pass here, so the flood fills below run for the few that do not.
 */
function aroundOpen(l: TerrainLayers, placed: number[], t: number): boolean {
  const w = l.width, h = l.height, i = t % w, j = Math.floor(t / w), open: boolean[] = [];
  let cliff = false;
  for (let k = 0; k < 8; k++) {
    const a = i + RING_I[k], b = j + RING_J[k];
    if (a < 0 || b < 0 || a >= w || b >= h) { open.push(false); continue; }
    const u = b * w + a;
    open.push(!(l.outside[u] === 1 || l.water[u] === 1 || l.rock[u] > 0 || l.forest[u] > 0 || placed[u] === 1 || l.level[u] >= MOUNTAIN_LEVEL));
    if (Math.abs(l.level[u] - l.level[t]) >= 2) cliff = true;
  }
  if (cliff) return false;                                                                       // a cliff cuts the ring in ways the arcs do not show: flood fill instead
  let start = -1;
  for (let k = 0; k < 8 && start < 0; k++) if (!open[k]) start = k;
  if (start < 0) return true;                                                                    // the whole ring is open
  let arcs = 0, straight = false, inRun = false;
  for (let n = 1; n <= 8; n++) {                                                                // walk the ring from a closed cell, so no run is cut in two
    const k = (start + n) % 8;
    if (open[k]) { inRun = true; if (k % 2 === 0) straight = true; }
    else if (inRun) { if (straight) arcs++; inRun = false; straight = false; }
  }
  return arcs <= 1;
}
/** Placing on t must not wall off part of the map from the gate: the walkable tiles reachable from it shrink by t alone. */
function opens(l: TerrainLayers, placed: number[], t: number, gate: number, memo: number[]): boolean {
  if (aroundOpen(l, placed, t)) return true;
  const before = memo[0] >= 0 ? memo[0] : reach(l, placed, gate);       // memo: the count for the current `placed`, forgotten when a deposit lands
  memo[0] = before;
  placed[t] = 1;
  const after = reach(l, placed, gate);
  placed[t] = 0;
  return after >= before - 1;
}
/**
 * One layer: 0 for none, k + 1 for a deposit of rule k. `keep` lists tiles that must stay empty (the entrance, the hall), `gate` the tile whose neighbourhood
 * a required deposit must reach: within `reachTiles` tiles (Manhattan). Rules that are not required may end up with none.
 */
export function placeDeposits(l: TerrainLayers, seed: number, rules: DepositRule[], keep: number[], gate: number, reachTiles: number): number[] {
  const hilly = l.hilly, memo: number[] = [-1];
  const n = l.width * l.height, out: number[] = Array.from({ length: n }, (): number => 0), taken: number[] = Array.from({ length: n }, (): number => 0), placed: number[] = Array.from({ length: n }, (): number => 0);
  for (const t of keep) taken[t] = 1;
  const gi = gate % l.width, gj = Math.floor(gate / l.width);
  const dist = (t: number): number => Math.abs(t % l.width - gi) + Math.abs(Math.floor(t / l.width) - gj);
  for (let k = 0; k < rules.length; k++) {
    const rule = rules[k];
    let near = 0;
    for (let t = 0; t < n; t++) {
      if (!free(l, taken, t) || !nearby(l, t, rule.near) || hash(t * 7 + k * 131 + seed, 977 + k) >= rule.density / 100 * (hilly ? relief(l, t) : 1) || !opens(l, placed, t, gate, memo)) continue;
      out[t] = k + 1; taken[t] = 1; placed[t] = 1; memo[0] = -1;
    }
    if (!rule.required) continue;
    const reached = walkable(l, placed, gate);                       // one counts only when a walker from the gate can stand beside it
    for (let t = 0; t < n; t++) if (out[t] === k + 1 && dist(t) <= reachTiles && touches(l, reached, t)) near++;
    if (near > 0) continue;
    for (let relax = 0; relax < 3 && near === 0; relax++) {          // none within reach: the nearest tile a walker from the gate can stand beside: near its kind of feature first, anywhere second, and last by felling a tree or clearing a rock
      const seen = walkable(l, placed, gate);
      let best = -1;
      for (let t = 0; t < n; t++) {
        if (taken[t] === 1 || l.outside[t] === 1 || l.water[t] === 1 || (best >= 0 && dist(t) >= dist(best)) || !touches(l, seen, t)) continue;
        if (relax < 2 ? !free(l, taken, t) || !hasOpenSide(l, taken, t) || (relax === 0 && !nearby(l, t, rule.near)) || !opens(l, placed, t, gate, memo) : l.forest[t] === 0 && l.rock[t] === 0) continue;
        best = t;
      }
      if (best >= 0 && (relax > 0 || dist(best) <= reachTiles)) {
        l.forest[best] = 0; l.rock[best] = 0;
        out[best] = k + 1; taken[best] = 1; placed[best] = 1; memo[0] = -1;
        if (dist(best) <= reachTiles) near++;
      }
    }
  }
  return out;
}
