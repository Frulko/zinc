// Resource deposits scattered on a generated terrain by rule: near rocks, near water, near trees or anywhere. No game types: a rule is numbers and a placement word.
import { hash } from '../world/noise';
import { TerrainLayers } from './terrain';

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
  while (queue.length > 0) {
    const t = queue.pop() as number, i = t % w, j = Math.floor(t / w);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= w || b >= h) continue;
      const u = b * w + a;
      if (seen[u] === 1 || l.outside[u] === 1 || l.water[u] === 1 || l.rock[u] > 0 || l.forest[u] > 0 || placed[u] === 1) continue;
      seen[u] = 1; queue.push(u);
    }
  }
  return seen;
}
function reach(l: TerrainLayers, placed: number[], from: number): number {
  let count = 0;
  for (const v of walkable(l, placed, from)) count += v;
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
/** Placing on t must not wall off part of the map from the gate: the walkable tiles reachable from it shrink by t alone. */
function opens(l: TerrainLayers, placed: number[], t: number, gate: number): boolean {
  const before = reach(l, placed, gate);
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
  const n = l.width * l.height, out: number[] = Array.from({ length: n }, (): number => 0), taken: number[] = Array.from({ length: n }, (): number => 0), placed: number[] = Array.from({ length: n }, (): number => 0);
  for (const t of keep) taken[t] = 1;
  const gi = gate % l.width, gj = Math.floor(gate / l.width);
  const dist = (t: number): number => Math.abs(t % l.width - gi) + Math.abs(Math.floor(t / l.width) - gj);
  for (let k = 0; k < rules.length; k++) {
    const rule = rules[k];
    let near = 0;
    for (let t = 0; t < n; t++) {
      if (!free(l, taken, t) || !nearby(l, t, rule.near) || hash(t * 7 + k * 131 + seed, 977 + k) >= rule.density / 100 || !opens(l, placed, t, gate)) continue;
      out[t] = k + 1; taken[t] = 1; placed[t] = 1;
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
        if (relax < 2 ? !free(l, taken, t) || !hasOpenSide(l, taken, t) || (relax === 0 && !nearby(l, t, rule.near)) || !opens(l, placed, t, gate) : l.forest[t] === 0 && l.rock[t] === 0) continue;
        best = t;
      }
      if (best >= 0 && (relax > 0 || dist(best) <= reachTiles)) {
        l.forest[best] = 0; l.rock[best] = 0;
        out[best] = k + 1; taken[best] = 1; placed[best] = 1;
        if (dist(best) <= reachTiles) near++;
      }
    }
  }
  return out;
}
