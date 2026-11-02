// Resource deposits scattered on a generated terrain by rule: near rocks, near water, near trees or anywhere. No game types: a rule is numbers and a placement word.
import { hash } from '../world/noise';
import { TerrainLayers, GEN_CLUSTERED } from './terrain';
import { falloff } from './clusters';
import { START_RADIUS, startNeed, startArea } from './start';
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
let lastAfter = -1;                                                       // the walkable count opens() measured with t placed (-1: it did not flood fill): a caller that places t keeps it as the next `before`
function opens(l: TerrainLayers, placed: number[], t: number, gate: number, memo: number[]): boolean {
  lastAfter = -1;
  if (aroundOpen(l, placed, t)) return true;
  const before = memo[0] >= 0 ? memo[0] : reach(l, placed, gate);       // memo: the count for the current `placed`, forgotten when a deposit lands
  memo[0] = before;
  placed[t] = 1;
  const after = reach(l, placed, gate);
  placed[t] = 0;
  lastAfter = after;
  return after >= before - 1;
}
/** A tile a patch may use: free, and below the mountain rock (a deposit stands where a gatherer can walk up to it). */
function fitTile(l: TerrainLayers, taken: number[], t: number): boolean { return free(l, taken, t) && l.level[t] < MOUNTAIN_LEVEL; }
const MEAN_PATCH = 5, START_KEEP = 8;
/** True when a deposit on t (inside the start area) would cut the walkable ground within the start radius by more than that tile: a wall of stones round the gate. */
function cutsStart(l: TerrainLayers, placed: number[], t: number, gate: number): boolean {
  if (Math.abs(t % l.width - gate % l.width) + Math.abs(Math.floor(t / l.width) - Math.floor(gate / l.width)) > START_RADIUS + 1) return false;
  const was = startReach(l, placed, gate);
  placed[t] = 1;
  const now = startReach(l, placed, gate);
  placed[t] = 0;
  return now < was - 1 || now < Math.ceil(startNeed(l, gate % l.width, Math.floor(gate / l.width)) * 1.3);   // not a wall, and the start area keeps its size
}
/** Bare ground of the gate's level a walker reaches within the start radius (placed deposits block): the size of the start area, without caring whether each tile is flat. */
function startReach(l: TerrainLayers, placed: number[], gate: number): number {
  const w = l.width, h = l.height, gi = gate % w, gj = Math.floor(gate / w), seen: number[] = Array.from({ length: w * h }, (): number => 0), queue: number[] = [gate];
  seen[gate] = 1;
  let count = 0;
  while (queue.length > 0) {
    const t = queue.pop() as number, i = t % w, j = Math.floor(t / w);
    count++;
    for (let d = 0; d < 4; d++) {
      const a = i + (d === 0 ? 1 : d === 1 ? -1 : 0), b = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (a < 0 || b < 0 || a >= w || b >= h || Math.abs(a - gi) + Math.abs(b - gj) > START_RADIUS) continue;
      const u = b * w + a;
      if (seen[u] === 1 || l.outside[u] === 1 || l.water[u] === 1 || l.forest[u] !== 0 || l.rock[u] !== 0 || placed[u] === 1 || l.level[u] !== l.level[gate]) continue;
      seen[u] = 1; queue.push(u);
    }
  }
  return count;
}     // deposits in an average patch
/** How well a tile suits the centre of a patch of this rule, 0..1: rock on the high ground, clay on the wet shore, berries at the edge of a grove. */
function habitat(l: TerrainLayers, t: number, near: number): number {
  if (!nearby(l, t, near)) return 0;
  if (near === NEAR_ROCK) return l.biome[t] === 4 || l.level[t] >= 3 ? 1 : .3;
  if (near === NEAR_WATER) return l.wet[t] === 2 ? 1 : l.wet[t] === 1 ? .8 : .4;
  if (near === NEAR_TREE) return l.forest[t] === 0 ? 1 : 0;
  return 1;
}
/**
 * Deposits in patches, after a Thomas cluster process: centres by dart throwing with a minimum separation (a Poisson-disk sample over the habitat), around each a gaussian-like cloud
 * of tiles; the centre is the richest and the amount falls toward the rim (`richness`, percent of the rule's amount), and patches far from the gate are richer.
 * `centres` is shared by the rules so patches of different kinds keep apart. A required rule gets its first patch within reach of the gate.
 */
function patches(l: TerrainLayers, seed: number, rule: DepositRule, k: number, out: number[], taken: number[], placed: number[], gate: number, reachTiles: number, centres: number[], richness: number[], memo: number[]): void {
  const w = l.width, h = l.height, n = w * h, gi = gate % w, gj = Math.floor(gate / w), hilly = l.hilly;
  const fit = (lay: TerrainLayers, tk: number[], t: number): boolean => fitTile(lay, tk, t) && Math.abs(t % w - gi) + Math.abs(Math.floor(t / w) - gj) > Math.min(START_KEEP, Math.floor(w / 3));      // the gate's surroundings stay bare: a patch there walls the start in
  let mass = 0;
  for (let t = 0; t < n; t += 1) if (fit(l, taken, t) && habitat(l, t, rule.near) > 0) mass += hilly ? relief(l, t) : 1;
  const want = Math.max(rule.required ? 1 : 0, Math.round(rule.density / 100 * mass / MEAN_PATCH * (hilly ? 1 : 1)));
  if (want === 0) return;
  const sepSame = Math.max(6, Math.floor(Math.sqrt(n / want) * .6)), sepAny = 4, mine: number[] = [];
  const apart = (t: number): boolean => {
    const i = t % w, j = Math.floor(t / w);
    for (let c = 0; c < centres.length; c++) {
      const dx = i - centres[c] % w, dy = j - Math.floor(centres[c] / w), d = dx * dx + dy * dy;
      if (d < sepAny * sepAny || (mine.indexOf(centres[c]) >= 0 && d < sepSame * sepSame)) return false;
    }
    return true;
  };
  const take = (t: number): void => { centres.push(t); mine.push(t); };
  if (rule.required) {                                                       // the first patch lies in reach of the gate
    for (let a = 0; a < 200 && mine.length === 0; a++) {
      const i = gi + Math.floor((hash(a * 3 + seed, 11 + k) - .5) * 2 * (reachTiles - 3)), j = gj + Math.floor((hash(a * 5 + seed, 13 + k) - .5) * 2 * (reachTiles - 3));
      if (i < 1 || j < 1 || i >= w - 1 || j >= h - 1) continue;
      const t = j * w + i;
      const away = Math.abs(i - gi) + Math.abs(j - gj);
      if (away <= reachTiles - 3 && away > Math.min(START_KEEP, Math.floor(w / 3)) && fit(l, taken, t) && habitat(l, t, rule.near) >= .6 && apart(t)) take(t);
    }
  }
  for (let a = 0; a < want * 80 && mine.length < want; a++) {
    const t = Math.floor(hash(a * 7 + seed, 977 + k * 131) * n);
    if (!fit(l, taken, t)) continue;
    const s = habitat(l, t, rule.near) * (hilly ? relief(l, t) / 3 : 1);
    if (s <= 0 || hash(a + seed * 3, 31 + k) >= s || !apart(t)) continue;
    take(t);
  }
  for (const c of mine) {
    const ci = c % w, cj = Math.floor(c / w), size = Math.round(MEAN_PATCH * (.6 + hash(c + seed, 71 + k) * .9)), R = Math.max(2, Math.ceil(Math.sqrt(size * 1.6)));
    const far = 1 + Math.min(1, (Math.abs(ci - gi) + Math.abs(cj - gj)) / w) * .6;       // the further from the gate, the richer
    let got = 0;
    for (let r2 = 0; r2 <= R * R && got < size; r2++) {                                  // ring by ring from the centre: the nearest tiles first
      for (let dj = -R; dj <= R && got < size; dj++) for (let di = -R; di <= R && got < size; di++) {
        if (di * di + dj * dj !== r2) continue;
        const i = ci + di, j = cj + dj;
        if (i < 1 || j < 1 || i >= w - 1 || j >= h - 1) continue;
        const t = j * w + i;
        if (!fit(l, taken, t) || (r2 > 0 && hash(t * 3 + seed, 59 + k) > .35 + .65 * falloff(r2, R)) || !opens(l, placed, t, gate, memo)) continue;
        if (cutsStart(l, placed, t, gate)) continue;
        out[t] = k + 1; taken[t] = 1; placed[t] = 1; memo[0] = lastAfter; got++;
        richness[t] = Math.round(100 * (.4 + .8 * falloff(r2, R)) * far);
      }
    }
  }
}
/**
 * The last guard of the start area: when the deposits left it smaller than wanted, the deposits inside the start radius go, the furthest from the gate first, except the nearest of each
 * required kind (its reach guarantee stays). The layers' rock is borrowed for the count and given back.
 */
function trimStart(l: TerrainLayers, out: number[], rules: DepositRule[], gate: number): void {
  const w = l.width, n = w * l.height, gi = gate % w, gj = Math.floor(gate / w), want = startNeed(l, gi, gj);
  const inside: number[] = [], dist = (t: number): number => Math.abs(t % w - gi) + Math.abs(Math.floor(t / w) - gj);
  for (let t = 0; t < n; t++) if (out[t] > 0 && dist(t) <= START_RADIUS + 1) inside.push(t);
  if (inside.length === 0) return;
  const save = l.rock.slice();
  const measure = (): number => { for (let t = 0; t < n; t++) if (out[t] > 0) l.rock[t] = 1; const a = startArea(l, gi, gj); for (let t = 0; t < n; t++) l.rock[t] = save[t]; return a; };
  const keep: number[] = [];
  for (let k = 0; k < rules.length; k++) if (rules[k].required) { let best = -1; for (const t of inside) if (out[t] === k + 1 && (best < 0 || dist(t) < dist(best))) best = t; if (best >= 0) keep.push(best); }
  inside.sort((a: number, b: number): number => dist(b) - dist(a));
  for (const t of inside) {
    if (measure() >= want + Math.ceil(want * .3)) return;
    if (keep.indexOf(t) < 0) out[t] = 0;
  }
}
/**
 * One layer: 0 for none, k + 1 for a deposit of rule k. `keep` lists tiles that must stay empty (the entrance, the hall), `gate` the tile whose neighbourhood
 * a required deposit must reach: within `reachTiles` tiles (Manhattan). Rules that are not required may end up with none.
 */
export function placeDeposits(l: TerrainLayers, seed: number, rules: DepositRule[], keep: number[], gate: number, reachTiles: number, style: number = 0, richness: number[] = []): number[] {
  const hilly = l.hilly, memo: number[] = [-1], centres: number[] = [], keepAway = Math.min(START_KEEP, Math.floor(l.width / 3));   // even the fallback deposit of a required kind stays off the start area
  const n = l.width * l.height, out: number[] = Array.from({ length: n }, (): number => 0), taken: number[] = Array.from({ length: n }, (): number => 0), placed: number[] = Array.from({ length: n }, (): number => 0);
  for (const t of keep) taken[t] = 1;
  const gi = gate % l.width, gj = Math.floor(gate / l.width);
  const dist = (t: number): number => Math.abs(t % l.width - gi) + Math.abs(Math.floor(t / l.width) - gj);
  for (let k = 0; k < rules.length; k++) {
    const rule = rules[k];
    let near = 0;
    if (style === GEN_CLUSTERED) patches(l, seed, rule, k, out, taken, placed, gate, reachTiles, centres, richness, memo);
    else for (let t = 0; t < n; t++) {
      if (!free(l, taken, t) || !nearby(l, t, rule.near) || hash(t * 7 + k * 131 + seed, 977 + k) >= rule.density / 100 * (hilly ? relief(l, t) : 1) || !opens(l, placed, t, gate, memo) || cutsStart(l, placed, t, gate) || dist(t) <= keepAway) continue;
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
        if (taken[t] === 1 || l.outside[t] === 1 || l.water[t] === 1 || (best >= 0 && dist(t) >= dist(best)) || dist(t) <= keepAway || !touches(l, seen, t)) continue;
        if (relax < 2 ? !free(l, taken, t) || !hasOpenSide(l, taken, t) || (relax === 0 && !nearby(l, t, rule.near)) || !opens(l, placed, t, gate, memo) || cutsStart(l, placed, t, gate) : l.forest[t] === 0 && l.rock[t] === 0) continue;
        best = t;
      }
      if (best >= 0 && (relax > 0 || dist(best) <= reachTiles)) {
        l.forest[best] = 0; l.rock[best] = 0;
        out[best] = k + 1; taken[best] = 1; placed[best] = 1; memo[0] = -1;
        if (dist(best) <= reachTiles) near++;
      }
    }
  }
  trimStart(l, out, rules, gate);
  return out;
}
