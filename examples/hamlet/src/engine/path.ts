import { TERRAIN_GRASS, TERRAIN_WATER, ROAD_COST, WALK_SPEED, ROAD_SPEED, MOUNTAIN_LEVEL, SLOPE_COST, SLOPE_SPEED } from '../constants';
import { world, Mover, neighbor, tileAt, tileX, tileY, tileI, tileJ, isCliff } from '../world/world';

export const UNREACHABLE = 1e9;
export class Field { dist: number[] = []; prev: number[] = []; reached: number[] = []; count: number = 0; }

/** Grass, or water under a bridge (a road on water). */
export function isWalkable(t: number): boolean {
  return (world.terrain[t] === TERRAIN_GRASS || (world.terrain[t] === TERRAIN_WATER && world.road[t] !== 0)) && world.tree[t] === 0 && world.rock[t] === 0 && world.build[t] < 0 && world.height[t] < MOUNTAIN_LEVEL;
}
/** A step from a to the adjacent tile b crosses a cliff (never on water: a bridge has no cliff). */
function cliffStep(a: number, b: number): boolean { return world.terrain[a] === TERRAIN_GRASS && world.terrain[b] === TERRAIN_GRASS && isCliff(a, b); }
/** A step that climbs or descends a level. */
function climbs(a: number, b: number): boolean { return world.height[a] !== world.height[b] && world.terrain[a] === TERRAIN_GRASS && world.terrain[b] === TERRAIN_GRASS; }

// One search at a time, in buffers that live as long as the map: a search costs the tiles it reaches, never the size of the map, and allocates nothing.
// The Field it returns is the one shared object: use it (dist, approachTile, pathTo, `reached`) before the next search, never keep it.
const shared = new Field();
let cells = 0, done: number[] = [], via: number[] = [], heapK: number[] = [], heapT: number[] = [], heapN = 0;
function filled(n: number, v: number): number[] { const a: number[] = []; for (let k = 0; k < n; k++) a.push(v); return a; }
function prepare(): void {
  const n = world.size * world.size;
  if (n !== cells) {
    cells = n; done = filled(n, 0); via = filled(n, 0); heapK = filled(n * 4 + 8, 0); heapT = filled(n * 4 + 8, 0);
    shared.dist = filled(n, UNREACHABLE); shared.prev = filled(n, -1); shared.reached = filled(n, 0); shared.count = 0;
  }
  for (let k = 0; k < shared.count; k++) { const t = shared.reached[k]; shared.dist[t] = UNREACHABLE; shared.prev[t] = -1; done[t] = 0; via[t] = 0; }
  shared.count = 0; heapN = 0;
}
function heapPush(k: number, t: number): void {
  let c = heapN++;
  while (c > 0) {
    const q = (c - 1) >> 1;
    if (heapK[q] < k || (heapK[q] === k && heapT[q] < t)) break;
    heapK[c] = heapK[q]; heapT[c] = heapT[q]; c = q;
  }
  heapK[c] = k; heapT[c] = t;
}
/** Pops the cheapest entry (ties: the lowest tile, so paths do not depend on insertion order). */
function heapPop(): number {
  const top = heapT[0], k = heapK[--heapN], t = heapT[heapN];
  let c = 0;
  for (;;) {
    let m = 2 * c + 1;
    if (m >= heapN) break;
    if (m + 1 < heapN && (heapK[m + 1] < heapK[m] || (heapK[m + 1] === heapK[m] && heapT[m + 1] < heapT[m]))) m++;
    if (k < heapK[m] || (k === heapK[m] && t < heapT[m])) break;
    heapK[c] = heapK[m]; heapT[c] = heapT[m]; c = m;
  }
  heapK[c] = k; heapT[c] = t;
  return top;
}
const touch = (t: number): void => { shared.reached[shared.count++] = t; };

/** Cheapest walking cost from start to the tiles around it (roads are cheaper than grass), in the shared Field. `limit` stops the search at that cost (a wild animal looks a few tiles
 *  around, not the whole map). `escape`: a walker who is not working a source keeps to the road network: from where he stands he may cross open ground only for `escape` cost, until he first meets a road,
 *  and then stays on roads (a gatherer in his work radius, a stroll beside the house and an animal pass UNREACHABLE: free). `goal` ends the search once that tile, or for a blocked goal the first tile
 *  beside it, is settled (a trip to one place does not explore the map). `until(t, cost)` ends it at the first settled tile it accepts (the nearest shore, the nearest thing of a kind). A binary heap on (cost, tile): ties go to the lowest tile. */
export const ESCAPE = 14;    // how far over open ground a walker may go to reach a road (a gatherer's work radius): beyond it he is lost off the network
export function fieldFrom(start: number, limit: number = UNREACHABLE, escape: number = UNREACHABLE, goal: number = -1, until: ((t: number, cost: number) => boolean) | null = null): Field {
  prepare();
  const dist = shared.dist, prev = shared.prev, size = world.size, ground = world.terrain, road = world.road, tree = world.tree, rock = world.rock, build = world.build, hgt = world.height;
  const goalOpen = goal >= 0 && isWalkable(goal);
  const gi = goal >= 0 ? goal % size : 0, gj = goal >= 0 ? Math.floor(goal / size) : 0;
  const scale = goal >= 0 ? ROAD_COST * 1.002 : 0;      // A*: with a goal, the cost so far plus the cheapest rest of the way (a road tile per step), a hair over so that ties lean toward the goal
  const near = (t: number): boolean => { const di = (t % size) - gi, dj = Math.floor(t / size) - gj; return goal >= 0 && ((di === 0 && (dj === 1 || dj === -1)) || (dj === 0 && (di === 1 || di === -1))); };
  const si = start % size, sj = Math.floor(start / size);
  dist[start] = 0; touch(start); via[start] = road[start] !== 0 ? 1 : 0; heapPush(scale * (Math.abs(si - gi) + Math.abs(sj - gj)), start);
  while (heapN > 0) {
    const u = heapPop();
    if (done[u]) continue;
    done[u] = 1;
    if (goal >= 0 && (u === goal || (!goalOpen && near(u)))) break;
    if (until !== null && until(u, dist[u])) break;                 // the first tile settled that the caller wants: the cheapest, the lowest tile on a tie
    const ui = u % size, uj = (u - ui) / size, du = dist[u], onRoad = via[u] === 1;
    for (let d = 0; d < 4; d++) {
      let vi = ui, vj = uj;
      if (d === 0) vi++; else if (d === 1) vi--; else if (d === 2) vj++; else vj--;
      if (vi < 0 || vj < 0 || vi >= size || vj >= size) continue;
      const v = vj * size + vi, g = ground[v];
      if (!((g === TERRAIN_GRASS || (g === TERRAIN_WATER && road[v] !== 0)) && tree[v] === 0 && rock[v] === 0 && build[v] < 0 && hgt[v] < MOUNTAIN_LEVEL)) continue;
      if (g === TERRAIN_GRASS && ground[u] === TERRAIN_GRASS && hgt[u] !== hgt[v] && isCliff(u, v)) continue;
      const isRoad = road[v] !== 0;
      if (!isRoad && escape < UNREACHABLE && (onRoad || du + 1 > escape)) continue;
      const cost = du + (isRoad ? ROAD_COST : 1) * (climbs(u, v) ? SLOPE_COST : 1);
      if (cost < dist[v] && cost <= limit) {
        if (dist[v] === UNREACHABLE) touch(v);
        dist[v] = cost; prev[v] = u; via[v] = isRoad || onRoad ? 1 : 0; heapPush(cost + scale * (Math.abs(vi - gi) + Math.abs(vj - gj)), v);
      }
    }
  }
  return shared;
}

// ---- distance fields: many walkers that share a goal (every cart asking for the nearest store, every settler from the gate) read one cached spread instead of each searching the map ----
/** The cost from a goal to every road tile joined to it (a Dijkstra over roads, the same step costs as fieldFrom), kept by (goal tile, world.netRev). The goal is a road tile, or the road tiles beside a building. */
export class Spread { goal: number = -1; rev: number = -1; used: number = 0; dist: number[] = []; reached: number[] = []; count: number = 0; }
export const SPREAD_SLOTS = 12;                      // the fields kept (least recently used out): a few stores and the gate; more candidates than slots search the old way
const spreads: Spread[] = [];
let spreadClock = 0;
function fillSpread(sp: Spread, goal: number): void {
  const n = world.size * world.size;
  if (sp.dist.length !== n) { sp.dist = filled(n, UNREACHABLE); sp.reached = filled(n, 0); sp.count = 0; }
  for (let k = 0; k < sp.count; k++) sp.dist[sp.reached[k]] = UNREACHABLE;
  sp.count = 0; heapN = 0;
  const dist = sp.dist, road = world.road;
  const seed = (t: number): void => { if (t >= 0 && road[t] !== 0 && isWalkable(t) && dist[t] === UNREACHABLE) { dist[t] = 0; sp.reached[sp.count++] = t; heapPush(0, t); } };
  seed(goal);
  if (sp.count === 0) for (let d = 0; d < 4; d++) seed(neighbor(goal, d));
  while (heapN > 0) {
    if (heapK[0] > dist[heapT[0]]) { heapPop(); continue; }      // a stale entry: the tile was reached cheaper since
    const u = heapPop();
    for (let d = 0; d < 4; d++) {
      const v = neighbor(u, d);
      if (v < 0 || road[v] === 0 || !isWalkable(v) || cliffStep(u, v)) continue;
      const cost = dist[u] + ROAD_COST * (climbs(u, v) ? SLOPE_COST : 1);
      if (cost < dist[v]) { if (dist[v] === UNREACHABLE) sp.reached[sp.count++] = v; dist[v] = cost; heapPush(cost, v); }
    }
  }
}
/** The cached spread of a goal, built when missing or when the roads or buildings changed since; null when no road touches the goal. */
export function roadSpread(goal: number): Spread | null {
  let hit = -1, old = 0;
  for (let k = 0; k < spreads.length; k++) { if (spreads[k].goal === goal) hit = k; if (spreads[k].used < spreads[old].used) old = k; }
  if (hit < 0) {
    if (spreads.length < SPREAD_SLOTS) { spreads.push(new Spread()); hit = spreads.length - 1; } else hit = old;
    spreads[hit].goal = goal; spreads[hit].rev = -1;
  }
  const sp = spreads[hit];
  sp.used = ++spreadClock;
  if (sp.rev !== world.netRev || sp.dist.length !== world.size * world.size) { fillSpread(sp, goal); sp.rev = world.netRev; debt += sp.count; }
  return sp.count > 0 ? sp : null;
}
/** The road tiles from `from` (excluded) down the spread to its goal: at each tile the neighbour with the lowest cost, ties to the lowest tile. */
function descend(sp: Spread, from: number): number[] {
  const out: number[] = [];
  let u = from;
  while (sp.dist[u] > 0) {
    let best = -1, bd = UNREACHABLE;
    for (let d = 0; d < 4; d++) {
      const v = neighbor(u, d);
      if (v < 0 || world.road[v] === 0 || sp.dist[v] > bd || sp.dist[v] >= sp.dist[u] || cliffStep(u, v) || !isWalkable(v)) continue;
      if (best < 0 || sp.dist[v] < bd || (sp.dist[v] === bd && v < best)) { bd = sp.dist[v]; best = v; }
    }
    if (best < 0) break;
    out.push(best); u = best;
  }
  return out;
}
/** planPath for a walker standing on a road, going to a goal on the road network: reads the goal's cached spread. Other cases take planPath. False when no road leads there. */
export function planRoad(m: Mover, goal: number): boolean {
  const from = tileAt(m.x, m.y);
  if (from < 0 || world.road[from] === 0) return planPath(m, goal);
  const sp = roadSpread(goal);
  if (sp === null) return planPath(m, goal);
  if (sp.dist[from] >= UNREACHABLE) return false;
  m.path = descend(sp, from); m.step = 0;
  return true;
}
/** A walker standing on the road tile `hub` (the gate) goes to a goal: the path is the reverse of the descent from the goal's door, so every walker from the hub shares the hub's one spread. */
export function planFromHub(m: Mover, hub: number, goal: number): boolean {
  const sp = world.road[hub] !== 0 ? roadSpread(hub) : null;
  if (sp === null || tileAt(m.x, m.y) !== hub) return planPath(m, goal);
  let end = -1;
  const pick = (t: number): void => { if (t >= 0 && world.road[t] !== 0 && sp.dist[t] < UNREACHABLE && (end < 0 || sp.dist[t] < sp.dist[end] || (sp.dist[t] === sp.dist[end] && t < end))) end = t; };
  if (world.road[goal] !== 0 && isWalkable(goal)) pick(goal); else for (let d = 0; d < 4; d++) pick(neighbor(goal, d));
  if (end < 0) return false;
  const down = descend(sp, end);                // end ... hub (inclusive)
  const path: number[] = [];
  for (let k = down.length - 2; k >= 0; k--) path.push(down[k]);
  if (end !== hub) path.push(end);
  m.path = path; m.step = 0;
  return true;
}

/** The tile to walk to for reaching goal: the goal itself, or its cheapest walkable neighbour when it is blocked (a tree, a building). */
export function approachTile(field: Field, goal: number): number {
  if (isWalkable(goal)) return field.dist[goal] < UNREACHABLE ? goal : -1;
  let best = -1, bestCost = UNREACHABLE;
  for (let d = 0; d < 4; d++) {
    const v = neighbor(goal, d);
    if (v >= 0 && field.dist[v] < bestCost) { bestCost = field.dist[v]; best = v; }
  }
  return best;
}

export function pathTo(field: Field, target: number): number[] {
  const out: number[] = [];
  let t = target;
  while (field.prev[t] >= 0) { out.push(t); t = field.prev[t]; }
  out.reverse();
  return out;
}

function roadBeside(t: number): boolean { for (let d = 0; d < 4; d++) { const v = neighbor(t, d); if (v >= 0 && world.road[v] !== 0) return true; } return world.road[t] !== 0; }
/** Sends a mover to a tile (or next to it when it is blocked), on the roads (see fieldFrom). False when there is no way. */
export function planPath(m: Mover, goal: number, escape: number = ESCAPE, limit: number = UNREACHABLE): boolean {
  const from = tileAt(m.x, m.y);
  if (from < 0) return false;
  let field = fieldFrom(from, limit, escape, goal);
  debt += shared.count;
  let target = approachTile(field, goal);
  if (target < 0 && escape < UNREACHABLE && !roadBeside(goal)) { field = fieldFrom(from, limit, UNREACHABLE, goal); debt += shared.count; target = approachTile(field, goal); }   // a building with no road at its door (the well) is walked up to over the ground
  if (target < 0) return false;
  m.path = pathTo(field, target);
  m.step = 0;
  return true;
}

// The search budget: a big village asks for many searches, and a goal nobody can reach explores the whole network (20 000 tiles at size 256: 35 ms). Each tile a walker's search looks at is
// owed; PATH_TILES_PER_TICK are paid off every tick, and while more than one tick's budget is owed the optional searches (a stroll, a visit, a porter looking for a load: pathBusy) wait; a trip that must be planned always is. The average cost per tick is bounded and a hitch is never more than one search;
// a village whose searches fit one budget (a 24-tile one: never above ~100 tiles owed) is never held back: the bot's village asks 995 times and waits 0.
const PATH_TILES_PER_TICK = 6000;
let debt = 0;
export function payPathDebt(): void { debt = Math.max(0, debt - PATH_TILES_PER_TICK); }
/** True while the walkers' searches of the last ticks are still owed: a caller that is about to start a big one (a porter looking for a load) waits for the next tick instead. */
export function pathBusy(): boolean { return debt > PATH_TILES_PER_TICK; }
/** Books the tiles the last search looked at (planPath does it itself; the transport searches call it). */
export function owePath(): void { debt += shared.count; }
export function isMoving(m: Mover): boolean { return m.step < m.path.length; }

/** Advances along the path; true once it is finished (or blocked by a new obstacle). */
export function walk(m: Mover, dt: number, speed: number): boolean {
  if (m.step >= m.path.length) return true;
  const t = m.path[m.step];
  if (!isWalkable(t)) { m.path = []; m.step = 0; return true; }
  const here = tileAt(m.x, m.y);
  if (here >= 0 && here !== t && cliffStep(here, t)) { m.path = []; m.step = 0; return true; }
  const pace = speed * (here >= 0 && world.road[here] ? ROAD_SPEED : 1) * (here >= 0 && here !== t && climbs(here, t) ? SLOPE_SPEED : 1);
  const dx = tileX(t) - m.x, dy = tileY(t) - m.y, dist = Math.sqrt(dx * dx + dy * dy), len = pace * dt;
  m.phase += len * 3.2;
  if (dist <= len) { m.x = tileX(t); m.y = tileY(t); m.step++; return m.step >= m.path.length; }
  m.x += dx / dist * len; m.y += dy / dist * len;
  m.yaw = Math.atan2(dy, dx);
  return false;
}
export const PERSON_SPEED = WALK_SPEED;
