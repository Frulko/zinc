import { TERRAIN_GRASS, TERRAIN_WATER, ROAD_COST } from '../constants';
import { world, tileIndex, tileI, tileJ, neighbor, recount } from '../world/world';
import { economy } from '../world/economy';
import { canPay, pay, give, take } from './stock';

/** The tiles a road drag would lay, as Caesar III draws them: `tiles` is the walk from start to end (cut at the first obstacle, which is its last tile and `blocked`),
 *  `fresh` the ones that still have to be built (an existing road is skipped and costs nothing), `built` how many of them the stock pays for (the first ones, a bridge whole or not at all). */
export class RoadPlan { tiles: number[] = []; fresh: number[] = []; blocked: number = -1; built: number = 0; cost: number[] = []; }

/** A road on water is a bridge: no flag to save, the terrain says it. */
export function isBridge(t: number): boolean { return world.road[t] !== 0 && world.terrain[t] === TERRAIN_WATER; }
/** The longest bridge, in tiles. */
export const BRIDGE_MAX = 3;
const water = (t: number): boolean => world.terrain[t] === TERRAIN_WATER;
/** A tile a road may take: bare ground, a tree (cleared on build) or, when `wet`, water. A rock, a building or the border never. */
function roadable(t: number, wet: boolean): boolean {
  if (world.rock[t] !== 0 || world.build[t] >= 0) return false;
  return world.terrain[t] === TERRAIN_GRASS || (wet && water(t));
}

/** A dense block of road, 2 x 2 or more, is a paved plaza: the tile is road (not bridge) and sits in a 2 x 2 square of road. Pure, from the road grid. */
export function isPlaza(t: number): boolean {
  if (world.road[t] === 0 || water(t)) return false;
  const i = tileI(t), j = tileJ(t), n = world.size;
  const r = (a: number, b: number): boolean => a >= 0 && b >= 0 && a < n && b < n && world.road[b * n + a] !== 0 && !water(b * n + a);
  for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 0; di++) if (r(i + di, j + dj) && r(i + di + 1, j + dj) && r(i + di, j + dj + 1) && r(i + di + 1, j + dj + 1)) return true;
  return false;
}

/** What laying these (new) tiles costs: the rounded-up total of dirt, bridge and tree clearing, per resource. */
export function costOf(tiles: number[]): number[] {
  const c = economy.roads, sum = economy.resources.map((): number => 0);
  for (const t of tiles) for (let k = 0; k < sum.length; k++) sum[k] += c.dirt[k] + (water(t) ? c.bridge[k] : 0) + (world.tree[t] > 0 ? c.clear[k] : 0);
  return sum.map((v: number): number => Math.ceil(v - 1e-9));
}
/** What a demolished stretch of road gives back: the refund share of its cost, rounded down. */
export function refundOf(tiles: number[]): number[] {
  return economy.resources.map((_r, k: number): number => Math.floor(sumDirt(tiles, k) * economy.roads.refund / 100 + 1e-9));
}
function sumDirt(tiles: number[], k: number): number {
  const c = economy.roads; let s = 0;
  for (const t of tiles) s += c.dirt[k] + (water(t) ? c.bridge[k] : 0);
  return s;
}

/** Lays the tiles, paying their cost (the caller checked the stock): trees on them are cleared and bring their wood. Returns the tiles laid. */
export function buildRoad(tiles: number[]): number {
  const fresh = tiles.filter((t: number): boolean => world.road[t] === 0);
  if (fresh.length === 0) return 0;
  pay(costOf(fresh));
  let trees = 0;
  for (const t of fresh) { if (world.tree[t] > 0) { trees++; world.tree[t] = 0; world.claimed[t] = 0; } world.road[t] = 1; world.deco[t] = 0; }
  for (let k = 0; k < economy.resources.length; k++) if (economy.roads.yield[k] > 0 && trees > 0) give(k, Math.floor(economy.roads.yield[k] * trees));
  recount(); world.revision++; world.netRev++; world.saveDirty = true;
  return fresh.length;
}
/** Demolishes road tiles (never the gate), refunding the share of their cost. Returns the tiles removed. */
export function demolishRoad(tiles: number[]): number {
  const gone = tiles.filter((t: number): boolean => world.road[t] !== 0 && t !== world.gate);
  if (gone.length === 0) return 0;
  const back = refundOf(gone);
  for (const t of gone) world.road[t] = 0;
  for (let k = 0; k < back.length; k++) if (back[k] > 0) give(k, back[k]);
  recount(); world.revision++; world.netRev++; world.saveDirty = true;
  return gone.length;
}
/** Takes back a refund (an undone demolition). */
export function unrefund(tiles: number[]): void { const b = refundOf(tiles); for (let k = 0; k < b.length; k++) if (b[k] > 0) take(k, b[k]); }

/** The L-shaped walk from a to b: along the longer side first, the corner under the cursor; `flip` takes the other side first. Pure. */
export function linePath(a: number, b: number, flip: boolean): number[] {
  const ai = tileI(a), aj = tileJ(a), bi = tileI(b), bj = tileJ(b);
  const iFirst = (Math.abs(bi - ai) >= Math.abs(bj - aj)) !== flip;
  const out: number[] = [a];
  let i = ai, j = aj;
  const stepI = (): void => { while (i !== bi) { i += bi > i ? 1 : -1; out.push(tileIndex(i, j)); } };
  const stepJ = (): void => { while (j !== bj) { j += bj > j ? 1 : -1; out.push(tileIndex(i, j)); } };
  if (iFirst) { stepI(); stepJ(); } else { stepJ(); stepI(); }
  return out;
}

/** The index of the first tile that stops the walk: a rock, a building, the border, a bridge over three tiles long or one that ends in water. -1 when none. */
function firstStop(path: number[]): number {
  for (let k = 0; k < path.length; k++) {
    const t = path[k];
    if (!roadable(t, true)) return k;
    if (water(t)) {
      let e = k; while (e < path.length && water(path[e])) e++;
      if (e === path.length || e - k > BRIDGE_MAX) return k;
      k = e - 1;
    }
  }
  return -1;
}

/** A shortest walk from a to b for a road: grass 1, an existing road ROAD_COST, a tree 2.5, a bridge tile 3.2; a bridge is at most BRIDGE_MAX tiles (the state is the run of water so far).
 *  Heap-free Dijkstra on a bucket-less scan: the map is small and the plan is cached by the caller. Returns [] when there is none. */
function route(a: number, b: number): number[] {
  const n = world.size * world.size, S = BRIDGE_MAX + 1, INF = 1e9;
  if (!roadable(a, false) && world.road[a] === 0) return [];
  const dist = Array.from({ length: n * S }, (): number => INF), prev = Array.from({ length: n * S }, (): number => -1);
  const hk: number[] = [], hs: number[] = [];
  const push = (k: number, s: number): void => {
    hk.push(k); hs.push(s);
    let c = hk.length - 1;
    while (c > 0) { const q = (c - 1) >> 1; if (hk[q] < hk[c] || (hk[q] === hk[c] && hs[q] <= hs[c])) break; const tk = hk[c], ts = hs[c]; hk[c] = hk[q]; hs[c] = hs[q]; hk[q] = tk; hs[q] = ts; c = q; }
  };
  dist[a * S] = 0; push(0, a * S);
  let goal = -1;
  while (hk.length > 0) {
    const k0 = hk[0], s0 = hs[0], last = hk.length - 1;
    hk[0] = hk[last]; hs[0] = hs[last]; hk.pop(); hs.pop();
    let c = 0;
    for (;;) {
      const l = 2 * c + 1, r = l + 1; let m = c;
      if (l < hk.length && (hk[l] < hk[m] || (hk[l] === hk[m] && hs[l] < hs[m]))) m = l;
      if (r < hk.length && (hk[r] < hk[m] || (hk[r] === hk[m] && hs[r] < hs[m]))) m = r;
      if (m === c) break;
      const tk = hk[c], ts = hs[c]; hk[c] = hk[m]; hs[c] = hs[m]; hk[m] = tk; hs[m] = ts; c = m;
    }
    if (k0 > dist[s0]) continue;
    const u = Math.floor(s0 / S), run = s0 % S;
    if (u === b && run === 0) { goal = s0; break; }
    for (let d = 0; d < 4; d++) {
      const v = neighbor(u, d);
      if (v < 0 || !roadable(v, true)) continue;
      const wet = water(v), nrun = wet ? run + 1 : 0;
      if (nrun > BRIDGE_MAX) continue;
      const step = wet ? 3.2 : world.road[v] !== 0 ? ROAD_COST : world.tree[v] > 0 ? 2.5 : 1;
      const s = v * S + nrun, cost = k0 + step;
      if (cost < dist[s]) { dist[s] = cost; prev[s] = s0; push(cost, s); }
    }
  }
  if (goal < 0) return [];
  const out: number[] = [];
  for (let s = goal; s >= 0; s = prev[s]) out.push(Math.floor(s / S));
  return out.reverse();
}

/** The plan for a drag from a to b. `routed`: when the L is blocked, or a bridge or a detour is cheaper, take the shortest walk (existing roads preferred, trees cleared, water bridged up to three tiles).
 *  The plan is capped by the stock: `built` is how many of the new tiles are paid for, `cost` what they cost. */
export function planRoad(a: number, b: number, flip: boolean, routed: boolean): RoadPlan {
  let path = linePath(a, b, flip);
  if (routed && firstStop(path) >= 0 && a !== b) { const r = route(a, b); if (r.length > 0) path = r; }
  const plan = new RoadPlan(), stop = firstStop(path);
  for (let k = 0; k < path.length; k++) {
    const t = path[k];
    plan.tiles.push(t);
    if (k === stop) { plan.blocked = t; break; }
    if (world.road[t] === 0) plan.fresh.push(t);
  }
  plan.built = affordable(plan.fresh);
  plan.cost = costOf(plan.fresh.slice(0, plan.built));
  return plan;
}
/** How many of the first new tiles the stock pays for. A prefix that stops inside a bridge falls back to the land before it. */
export function affordable(fresh: number[]): number {
  let k = fresh.length;
  while (k > 0 && !canPay(costOf(fresh.slice(0, k)))) k--;
  while (k > 0 && k < fresh.length && water(fresh[k - 1]) && water(fresh[k])) k--;
  while (k > 0 && k < fresh.length && water(fresh[k - 1])) k--;
  return k;
}
