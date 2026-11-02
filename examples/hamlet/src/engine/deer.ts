import { settings } from '../settings';
import { REFERENCE_AREA, TILE, DEER_GRAZE, DEER_WALK, DEER_FLEE, DEER_DEAD, DEER_GONE, DEER_REST, DEER_DRINK, DEER_ALERT, DEER_CHARGE, DEER_STALK, DEER_CHASE, DEER_EAT, DEER_HOWL, ST_SLEEP, ST_STALK as ST_STALK_HUNT, ROLE_HUNTER } from '../constants';
import { world, Deer, Building, random, neighbor, tileAt, tileX, tileY, tileI, tileJ, tileCount, spawnDeer, waterNeighbor, treesAround } from '../world/world';
import { SPECIES, Species, KIND_HOPPER, KIND_BOAR, KIND_WOLF, SP_DEER } from '../rules/species';
import { season } from '../rules/season';
import { isNight, dayFraction } from '../rules/needs';
import { sound } from '../audio';
import { isWalkable, fieldFrom, approachTile, pathTo, UNREACHABLE } from './path';
import { BI_HILLS } from '../gen/terrain';
import { losePerson } from './villagers';

// Wild animals: a small state machine per animal, the numbers of its species in rules/species.ts (kind: grazer, hopper, boar).
//   graze -> walk (to a spot of its home range by the time of day, to the water when thirsty, to its place in the herd when it strayed) -> graze ... a long rest every few moves, lying up all night;
//   a person or a burning ruin within `alert` makes it freeze (alert), within `fear` it runs (flee: the herd with it, toward cover and away from the threat, panic crosses the village); a cornered boar charges first.
// Moving is steering, not tile hopping: a heading that turns at a limited rate, a speed that ramps (walk, trot, run), a push away from herd mates, a slide along obstacles and a stuck timer that re-routes.
// Short moves are chosen tile by tile toward a goal; only a long way (to the herd leader, to the water) asks the heap pathfinder, a few times per tick at most.
// Wolves (kind wolf, only when the village asks for them): a pack follows its alpha; a hungry alpha picks a deer in sight and the pack creeps up (stalk), runs it down within a few tiles (chase), feeds
// on the carcass (eat) and lies up by day; the deer flee and the herd scatters. They keep out of the village unless they starve (the winter comes sooner), flee from fire and from hunters, and now and
// then follow a villager who is alone far from the houses at night: a fright (and, in the dangerous mode, a mauling).
// Once a day (dailyAnimals): ageing, death of old age, herds forming, breeding in season up to the cap of the area.
const SENSE_EVERY = 4;       // ticks between two looks around
const PLANS_PER_TICK = 2;    // heap searches the animals share each tick
const NEAR = 40;             // path cost an animal looks for the water or its herd
const ARRIVE = .5, STUCK = .8;
const HUNT_AT = 60, SIGHT = 18, CHARGE_AT = 6, GIVE_UP = 40;   // wolves: seconds without food before it hunts, how far it sees a deer, the distance it breaks into a run, seconds before it gives a hunt up
const BOLT_AT = 1.4;                                            // seconds a hunted animal notices its hunter before it bolts
const starveAt = (): number => season() === 3 ? 130 : 240;     // seconds without food before a wolf comes into the village
const DIRS: number[][] = [[1, 0], [.7071, .7071], [0, 1], [-.7071, .7071], [-1, 0], [-.7071, -.7071], [0, -1], [.7071, -.7071]];

const alive = (d: Deer): boolean => d.state !== DEER_GONE && d.state !== DEER_DEAD;
const dist = (ax: number, ay: number, bx: number, by: number): number => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
const root = (d: Deer): number => d.leader >= 0 ? d.leader : d.id;

// Who is who this tick: animals by id and herds by their leader's id (rebuilt at the start of the update, never searched linearly).
const byId = new Map<number, Deer>();
const herds = new Map<number, Deer[]>();
let wolves: Deer[] = [];
/** How many wolves live now (read by the ambience, which adds far howls at night). */
export function wolfCount(): number { return wolves.length; }
let plans = 0;
function index(): void {
  byId.clear(); herds.clear(); wolves = [];
  for (const d of world.deer) if (alive(d)) { byId.set(d.id, d); if (SPECIES[d.species].kind === KIND_WOLF) wolves.push(d); }
  for (const d of world.deer) {
    if (!alive(d)) continue;
    const r = root(d), list = herds.get(r);
    if (list === undefined) herds.set(r, [d]); else list.push(d);
  }
}
// The awake people by cell of CELL world units (a linked list per cell): an animal looks at the few people near it, not at the whole village.
const CELL = 16;
let cells = 0, cellHead: number[] = [], nextOf: number[] = [], burning: Building[] = [];
function indexPeople(): void {
  cells = Math.ceil(world.size * TILE / CELL) + 1;
  if (cellHead.length !== cells * cells) cellHead = Array.from({ length: cells * cells }, (): number => -1);
  else for (let c = 0; c < cellHead.length; c++) cellHead[c] = -1;
  while (nextOf.length < world.people.length) nextOf.push(-1);
  for (let k = 0; k < world.people.length; k++) {
    const p = world.people[k];
    if (p.state === ST_SLEEP) continue;
    const c = Math.floor((p.y + world.half) / CELL) * cells + Math.floor((p.x + world.half) / CELL);
    if (c < 0 || c >= cellHead.length) continue;
    nextOf[k] = cellHead[c]; cellHead[c] = k;
  }
  burning = [];
  for (const b of world.buildings) if (b.burn > 0) burning.push(b);
}
function leaderOf(d: Deer): Deer | null {
  if (d.leader < 0) return null;
  const o = byId.get(d.leader);
  return o === undefined ? null : o;
}

/** True when no building stands within r tiles of the tile (the animals keep out of the village unless they panic). */
function calm(t: number, r: number): boolean {
  const i = tileI(t), j = tileJ(t), n = world.size;
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const a = i + di, b = j + dj;
    if (a >= 0 && b >= 0 && a < n && b < n && world.build[b * n + a] >= 0) return false;
  }
  return true;
}
const cover = (t: number): number => Math.min(1, treesAround(t) / 4);

const shyOf = (d: Deer, sp: Species): number => sp.kind === KIND_WOLF && d.hunger > starveAt() ? 0 : sp.shy;
let byWolf = false;
/** Distance to the nearest awake person or burning ruin (and, for the others, a wolf); the animal remembers where it was (its threat). A wolf fears a hunter from farther, a fire much more, and less when it starves;
 *  a hunter creeping up is seen from less far. */
function nearestThreat(d: Deer): number {
  const sp = SPECIES[d.species], wolf = sp.kind === KIND_WOLF, starving = wolf && d.hunger > starveAt(), sharp = .8 + (d.id % 5) * .1;
  let best = 1e9, bestK = 1e9;
  byWolf = false;
  const reach = Math.ceil(sp.alert * 2 / .6 / CELL), cx = Math.floor((d.x + world.half) / CELL), cy = Math.floor((d.y + world.half) / CELL);   // beyond this nobody can matter (the scaling below is never under .6 and the calls compare with 2 x alert at most)
  for (let cj = Math.max(0, cy - reach); cj <= Math.min(cells - 1, cy + reach); cj++) for (let ci = Math.max(0, cx - reach); ci <= Math.min(cells - 1, cx + reach); ci++) {
    for (let k = cellHead[cj * cells + ci]; k >= 0; k = nextOf[k]) {
      const p = world.people[k];
      if (wolf && d.prey === -2 && p.role !== ROLE_HUNTER) continue;           // it is going for a villager alone: only a hunter turns it
      let g = dist(p.x, p.y, d.x, d.y);
      if (wolf) g *= p.role === ROLE_HUNTER ? .6 : starving ? 1.8 : 1;
      else if (d.hunted) g *= p.state === ST_STALK_HUNT ? 1.3 * sharp : sharp;           // the hunter's crouch hides him
      if (g < best || (g === best && k < bestK)) { best = g; bestK = k; d.threatX = p.x; d.threatY = p.y; }
    }
  }
  for (const b of burning) {
    const t = b.j * world.size + b.i, g = dist(tileX(t), tileY(t), d.x, d.y) * (wolf ? .3 : .35);   // a fire scares from farther than a person
    if (g < best) { best = g; d.threatX = tileX(t); d.threatY = tileY(t); }
  }
  if (!wolf) for (const w of wolves) {
    const g = dist(w.x, w.y, d.x, d.y) * (w.state === DEER_CHASE ? .5 : w.state === DEER_STALK ? 1.4 : 1.1);
    if (g < best) { best = g; d.threatX = w.x; d.threatY = w.y; byWolf = true; }
  }
  return best;
}

/** Turns the heading toward a direction by at most rate * dt (a rotation by a small step, no trigonometry: the simulation stays exact). */
function turnToward(d: Deer, dx: number, dy: number, rate: number, dt: number): void {
  const l = Math.sqrt(dx * dx + dy * dy);
  if (l < 1e-6) return;
  dx /= l; dy /= l;
  const cross = d.hx * dy - d.hy * dx, dot = d.hx * dx + d.hy * dy, cap = rate * dt;
  if (dot > 0 && Math.abs(cross) < .002) { d.hx = dx; d.hy = dy; }
  else {
    const step = dot < 0 ? cap : Math.min(Math.abs(cross), cap), sgn = cross > 0 ? 1 : cross < 0 ? -1 : (d.id % 2 === 0 ? 1 : -1);
    const nx = d.hx - d.hy * sgn * step, ny = d.hy + d.hx * sgn * step, nl = Math.sqrt(nx * nx + ny * ny);
    d.hx = nx / nl; d.hy = ny / nl;
  }
  d.yaw = Math.atan2(d.hy, d.hx);
}

/** A tile nearby the animal can stand on, when the one it is on was built over or grew a tree. */
function evict(d: Deer, here: number): void {
  for (let r = 1; r <= 4; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const a = tileI(here) + di, b = tileJ(here) + dj;
    if (a < 0 || b < 0 || a >= world.size || b >= world.size) continue;
    const t = b * world.size + a;
    if (isWalkable(t)) { d.x = tileX(t); d.y = tileY(t); d.path = []; d.step = 0; return; }
  }
}

/**
 * One step of moving along d.path at the speed it asks for. True once the path is finished, or given up (blocked for STUCK seconds, or a new obstacle on it).
 * The heading follows the next waypoint (and leans toward the one after), is pushed off herd mates, turns at the species' rate; the speed ramps and drops
 * in a turn. A step into a blocked tile slides along the free axis.
 */
function steer(d: Deer, sp: Species, dt: number, goal: number): boolean {
  if (d.step >= d.path.length) return true;
  const t = d.path[d.step];
  if (!isWalkable(t)) { d.path = []; d.step = 0; d.speed = 0; return true; }
  let dx = tileX(t) - d.x, dy = tileY(t) - d.y;
  const gap = Math.sqrt(dx * dx + dy * dy);
  if (gap < ARRIVE) { d.step++; if (d.step >= d.path.length) { d.speed = 0; return true; } return false; }
  dx /= gap; dy /= gap;
  if (d.step + 1 < d.path.length && gap < 1.2) {                              // cut the corner toward the next waypoint
    const u = d.path[d.step + 1], ex = tileX(u) - d.x, ey = tileY(u) - d.y, el = Math.sqrt(ex * ex + ey * ey), k = (1.2 - gap) / 1.2;
    dx += ex / el * k; dy += ey / el * k;
  }
  const mates = herds.get(root(d));
  if (mates !== undefined && mates.length > 1) for (const o of mates) {      // push off herd mates that are too close
    if (o === d) continue;
    const g = dist(o.x, o.y, d.x, d.y);
    if (g < 1.8 && g > .01) { dx += (d.x - o.x) / g * (1.8 - g) * .8; dy += (d.y - o.y) / g * (1.8 - g) * .8; }
  }
  turnToward(d, dx, dy, goal >= sp.flee ? sp.turn * 2.5 : sp.turn, dt);       // a startled animal wheels round
  const dl = Math.max(.001, Math.sqrt(dx * dx + dy * dy)), align = Math.max(.25, (d.hx * dx + d.hy * dy) / dl);
  let want = goal * align;
  if (sp.kind === KIND_HOPPER) want = goal * ((d.phase % 6.2832) < 3.1416 ? 1.9 : .1);       // a hop and a pause
  const da = sp.accel * dt * (goal >= sp.flee ? 3 : 1);                  // a startled animal is up to speed at once
  d.speed = d.speed < want ? Math.min(want, d.speed + da) : Math.max(want, d.speed - da * 1.6);
  const len = d.speed * dt, nx = d.x + d.hx * len, ny = d.y + d.hy * len, here = tileAt(d.x, d.y);
  const free = (x: number, y: number): boolean => { const q = tileAt(x, y); return q === here || (q >= 0 && isWalkable(q)); };
  if (free(nx, ny)) { d.x = nx; d.y = ny; d.stuck = 0; }
  else if (free(nx, d.y)) { d.x = nx; d.stuck += dt * .5; }
  else if (free(d.x, ny)) { d.y = ny; d.stuck += dt * .5; }
  else { d.speed = 0; d.stuck += dt; }
  d.phase += sp.kind === KIND_HOPPER ? (d.speed > 0 || d.phase % 6.2832 > 3.1416 ? dt * 9 : 0) : len * 3.2;
  if (d.stuck > STUCK) { d.stuck = 0; d.path = []; d.step = 0; d.speed = 0; return true; }
  return false;
}

/** A path of up to n tiles, each the free neighbour that gets closer to (tx, ty); `panic` crosses the village, otherwise the tiles near buildings are kept out of. */
function pathToward(d: Deer, sp: Species, tx: number, ty: number, n: number, panic: boolean): boolean {
  let here = tileAt(d.x, d.y);
  if (here < 0) return false;
  const path: number[] = [], inside = !calm(here, shyOf(d, sp));
  let cur = dist(tileX(here), tileY(here), tx, ty);
  for (let k = 0; k < n; k++) {
    let best = -1, bestD = cur - .01;
    for (let dir = 0; dir < 4; dir++) {
      const v = neighbor(here, dir);
      if (v < 0 || !isWalkable(v) || path.indexOf(v) >= 0) continue;
      const g = dist(tileX(v), tileY(v), tx, ty);
      if (g < bestD && (panic || inside || calm(v, shyOf(d, sp)))) { bestD = g; best = v; }
    }
    if (best < 0) break;
    path.push(best); here = best; cur = bestD;
  }
  d.path = path; d.step = 0;
  return path.length > 0;
}
/** The heap pathfinder, for a long way: a few tiles around only, and a few searches per tick for all the animals together. */
function planNear(d: Deer, goal: number): boolean {
  if (plans >= PLANS_PER_TICK) return false;
  const from = tileAt(d.x, d.y);
  if (from < 0) return false;
  plans++;
  const field = fieldFrom(from, NEAR, UNREACHABLE, goal), target = approachTile(field, goal);      // towards the goal (A*): it stops there, it does not explore the whole radius
  if (target < 0) return false;
  d.path = pathTo(field, target); d.step = 0;
  return d.path.length > 0;
}
/** Goes to a point: tile by tile when it is close or the way is open, with the pathfinder when the greedy walk is stopped by trees or a building. */
function goTo(d: Deer, sp: Species, tx: number, ty: number, panic: boolean): boolean {
  const far = dist(d.x, d.y, tx, ty);
  if (far < 1) return false;
  if (pathToward(d, sp, tx, ty, 12, panic) && (d.path.length >= 3 || far < 5)) return true;
  const t = tileAt(tx, ty);
  return t >= 0 && far > 5 && planNear(d, t);
}

/** Where to run from the threat: of eight directions the one that leads away from it, toward the edge of the trees. False when it is cornered. */
function pickEscape(d: Deer, sp: Species): boolean {
  const al = Math.max(.01, dist(d.x, d.y, d.threatX, d.threatY)), ax = (d.x - d.threatX) / al, ay = (d.y - d.threatY) / al;
  const want = sp.kind === KIND_HOPPER ? 3 : 1.5;
  let best = -1e9;
  for (let k = 0; k < 8; k++) {
    for (let r = 10; r >= 3; r -= 3.5) {
      const px = d.x + DIRS[k][0] * r, py = d.y + DIRS[k][1] * r, t = tileAt(px, py);
      if (t < 0 || !isWalkable(t)) continue;
      const score = (DIRS[k][0] * ax + DIRS[k][1] * ay) * 3 + cover(t) * want + r * .05 + ((d.id + k) % 3) * .05;
      if (score > best) { best = score; d.tx = px; d.ty = py; }
      break;
    }
  }
  return best > -.5;                                                       // every way leads toward the threat: cornered
}
function runFrom(o: Deer, sp: Species, tx: number, ty: number, spread: number = 1): void {
  o.state = DEER_FLEE; o.timer = 3 + random() * 2; o.errand = 0;
  const j = ((o.id % 5) - 2) * 1.2 * spread;                                        // each one its own line to the same cover
  if (!pathToward(o, sp, tx + j, ty - j, 12, true)) { o.path = []; o.step = 0; }
}
function startFlee(d: Deer, sp: Species, scatter: boolean = false): void {
  d.errand = 0; d.path = []; d.step = 0; d.prey = -1;
  const cornered = !pickEscape(d, sp) || !pathToward(d, sp, d.tx, d.ty, 12, true) || d.path.length < 2;
  if (cornered && sp.kind === KIND_BOAR && dist(d.x, d.y, d.threatX, d.threatY) < sp.fear) {   // nowhere to go: the boar turns on the person
    d.state = DEER_CHARGE; d.timer = 1.1; d.path = []; d.step = 0; return;
  }
  d.state = DEER_FLEE; d.timer = 3 + random() * 2;
  sound(sp.kind === KIND_HOPPER ? 'rustle' : 'hoof', .3);
  const mates = herds.get(root(d));
  if (mates === undefined) return;
  for (const o of mates) {                                                 // the herd runs with it, to the same cover
    if (o === d || o.state === DEER_FLEE || dist(o.x, o.y, d.x, d.y) > sp.alert * 1.5) continue;
    o.threatX = d.threatX; o.threatY = d.threatY; o.path = []; o.step = 0; runFrom(o, sp, d.tx, d.ty, scatter ? 4 : 1);   // a wolf scatters the herd: each its own way
  }
}

let shoreFor: number[] = [], shoreMask: number[] = [];
/** 1 for a tile with water beside it (built once per generated map: the water never changes, the search tests it for every tile it settles). */
function shore(t: number): number {
  if (shoreFor !== world.terrain) {
    shoreFor = world.terrain; shoreMask = [];
    for (let u = 0; u < world.terrain.length; u++) shoreMask.push(waterNeighbor(u) >= 0 ? 1 : 0);
  }
  return shoreMask[t];
}
let failedFor: number[] = [], failedUntil: number[] = [];
const NO_SHORE_TICKS = 32 * 60;     // a search that found no shore within reach is not repeated for the animals of the same 4x4 tiles for a minute (the herd asks one after the other, each explored the whole radius)
function goDrink(d: Deer, sp: Species): boolean {
  const from = tileAt(d.x, d.y);
  if (from < 0) return false;
  if (failedFor !== world.terrain) { failedFor = world.terrain; const c = (world.size + 3) >> 2; failedUntil = []; for (let k = 0; k < c * c; k++) failedUntil.push(0); }
  const cell = (Math.floor(from / world.size) >> 2) * ((world.size + 3) >> 2) + ((from % world.size) >> 2);
  if (failedUntil[cell] > world.tick) { d.thirst = sp.drinkEvery / 2; return false; }
  if (plans >= PLANS_PER_TICK) { d.timer = .5; return true; }              // the searches of this tick are taken: ask again in a moment
  plans++;
  let best = -1;
  const field = fieldFrom(from, NEAR, UNREACHABLE, -1, (t: number, cost: number): boolean => { if (cost < NEAR && shore(t) === 1 && isWalkable(t)) { best = t; return true; } return false; });   // the nearest shore: the search stops at the first one it settles (it explored the whole radius, then scanned it)
  if (best < 0) { d.thirst = sp.drinkEvery / 2; failedUntil[cell] = world.tick + NO_SHORE_TICKS; return false; }            // no shore within reach: try again later
  d.path = pathTo(field, best); d.step = 0; d.errand = 1; d.state = DEER_WALK;
  return true;
}
/** One short move around its home range, picked among a few spots by what the time of day and season ask: the edge of the trees by day, the open at dawn and dusk and in winter. */
function wander(d: Deer, sp: Species): boolean {
  const here = tileAt(d.x, d.y);
  if (here < 0) return false;
  if (d.home < 0) d.home = here;
  const hx = tileX(d.home), hy = tileY(d.home), f = dayFraction(), open = f < .12 || f > .55, w = sp.cover * (season() === 3 ? -.4 : open ? -.5 : 1);
  const spread = Math.min(10, sp.homeR + 2), inside = !calm(here, shyOf(d, sp));
  let best = -1e9, bx = 0, by = 0;
  for (let c = 0; c < 5; c++) {
    const px = d.x + (random() * 2 - 1) * spread, py = d.y + (random() * 2 - 1) * spread, t = tileAt(px, py);
    if (t < 0 || !isWalkable(t) || (!inside && !calm(t, shyOf(d, sp)))) continue;
    const away = dist(px, py, hx, hy) / (sp.homeR * 2), score = -away * (away > 1 ? 4 : 1) + w * treesAround(t) / 6 + random() * .3 - (season() === 3 && world.biome[t] === BI_HILLS ? 2 : 0);   // in winter the high ground is left
    if (score > best) { best = score; bx = px; by = py; }
  }
  return best > -1e9 && pathToward(d, sp, bx, by, 8, false);
}
/** Its place in the herd: behind the leader and to one side, a different one for each member. */
function formation(d: Deer, lead: Deer): number[] {
  const back = 2.5 + (d.id % 3) * 1.5, side = ((d.id % 5) - 2) * 1.4;
  return [lead.x - lead.hx * back - lead.hy * side, lead.y - lead.hy * back + lead.hx * side];
}
/** What a grazing animal does next. */
function decide(d: Deer, sp: Species): void {
  if (sp.kind === KIND_WOLF && wolfDecide(d, sp)) return;
  if (isNight() && sp.kind !== KIND_WOLF) { d.state = DEER_REST; d.timer = 3; d.path = []; d.step = 0; return; }
  if (d.thirst > sp.drinkEvery && world.hasWater) { if (goDrink(d, sp)) return; }
  if (sp.kind === KIND_HOPPER && season() === 3 && d.home >= 0) {            // in winter a rabbit keeps to its burrow (the view draws it at its home tile) and comes out now and then
    const hx = tileX(d.home), hy = tileY(d.home);
    if (dist(d.x, d.y, hx, hy) > 1.2) { if (goTo(d, sp, hx, hy, false)) { d.state = DEER_WALK; d.errand = 5; return; } }
    else if (++d.moves % 3 !== 0) { d.state = DEER_REST; d.timer = 10; d.path = []; d.step = 0; return; }
  }
  if (d.moves >= sp.restEvery) { d.moves = 0; d.state = DEER_REST; d.timer = 5 + random() * 6; return; }
  const lead = leaderOf(d);
  if (lead !== null) {
    const away = dist(d.x, d.y, lead.x, lead.y);
    if (away > sp.herdGap) {
      const spot = formation(d, lead);
      if (goTo(d, sp, spot[0], spot[1], false)) { d.state = DEER_WALK; d.errand = 2; return; }
      if (plans >= PLANS_PER_TICK) { d.timer = .5; return; }
    } else if (lead.state !== DEER_WALK) { d.moves++; d.timer = 2 + random() * 4; return; }   // the herd grazes: it grazes with it
    else { const spot = formation(d, lead); if (goTo(d, sp, spot[0], spot[1], false)) { d.state = DEER_WALK; return; } }
  }
  if (wander(d, sp)) d.state = DEER_WALK; else d.timer = 2;
}
function arrive(d: Deer): void {
  if (d.errand === 5) { d.errand = 0; d.state = DEER_REST; d.timer = 10; return; }                            // a rabbit in its burrow
  if (d.errand === 4) { d.errand = 0; d.state = DEER_EAT; d.timer = 5 + random() * 3; d.hunger = 0; return; }   // the pack at the carcass
  if (d.errand === 1) {
    d.errand = 0; d.thirst = 0; d.state = DEER_DRINK; d.timer = 3 + random() * 2;
    const w = waterNeighbor(tileAt(d.x, d.y));
    if (w >= 0) { d.tx = tileX(w); d.ty = tileY(w); }
    return;
  }
  d.errand = 0; d.moves++; d.state = DEER_GRAZE; d.timer = 2 + random() * 5;
}

/** A wolf begins to creep up on a deer, the pack with it. */
function startStalk(d: Deer, prey: number): void {
  d.prey = prey; d.state = DEER_STALK; d.errand = 0; d.path = []; d.step = 0; d.timer = GIVE_UP;
  const mates = herds.get(root(d));
  if (mates === undefined || d.leader >= 0) return;
  for (const o of mates) if (o !== d && o.state !== DEER_FLEE && o.state !== DEER_STALK && o.state !== DEER_CHASE && o.state !== DEER_EAT) { o.prey = prey; o.state = DEER_STALK; o.errand = 0; o.path = []; o.step = 0; o.timer = GIVE_UP; }
}
function nearestPrey(d: Deer): Deer | null {
  let best: Deer | null = null, bd = SIGHT;
  for (const o of world.deer) {
    if (o.species !== SP_DEER || !alive(o) || o.hunted) continue;
    const g = dist(o.x, o.y, d.x, d.y);
    if (g < bd) { bd = g; best = o; }
  }
  return best;
}
/** What a wolf does instead of grazing: follow the pack's hunt, hunt when hungry, howl at night. True when it took the decision. */
function wolfDecide(d: Deer, sp: Species): boolean {
  const lead = leaderOf(d);
  if (lead !== null) {
    if ((lead.state === DEER_STALK || lead.state === DEER_CHASE) && byId.has(lead.prey)) { startStalk(d, lead.prey); return true; }
    return false;
  }
  if (d.hunger > HUNT_AT) {
    const q = nearestPrey(d);
    if (q !== null) { startStalk(d, q.id); return true; }
  }
  if (isNight() && random() < .06) { d.state = DEER_HOWL; d.timer = 2.6; d.path = []; d.step = 0; d.speed = 0; d.tx = d.x + d.hx * 4; d.ty = d.y + d.hy * 4; sound('howl', .6); return true; }
  return false;
}
/** Looks around, every few ticks: the village's first warning, a villager alone in the night. True when the wolf has done something that ends its step. */
function wolfSense(d: Deer, sp: Species): boolean {
  if (d.leader >= 0) return false;
  if (d.prey === -2) d.prey = -1;
  const here = tileAt(d.x, d.y);
  if (!d.noted && here >= 0 && !calm(here, 7)) { d.noted = true; world.news.push('Des loups rôdent près du hameau.'); }
  if (!isNight() || d.hunger < HUNT_AT * .5 || d.state === DEER_EAT || d.state === DEER_CHASE) return false;
  for (const p of world.people) {
    if (p.state === ST_SLEEP) continue;
    const g = dist(p.x, p.y, d.x, d.y), t = tileAt(p.x, p.y);
    if (g > sp.alert * 1.3 || t < 0 || !calm(t, 4)) continue;
    let alone = true;
    for (const o of world.people) if (o !== p && o.state !== ST_SLEEP && dist(o.x, o.y, p.x, p.y) < 8) alone = false;
    if (!alone) continue;
    if (world.params.wolves === 2 && d.hunger > HUNT_AT) {                    // the dangerous mode: they go for him, and a wolf that reaches him maims him
      if (g < 2.2) { losePerson(p); world.news.push('Un habitant a été attaqué par les loups, loin des maisons.'); d.cooldown = 1; d.hunger = 0; return false; }
      d.state = DEER_WALK; d.errand = 0; d.timer = 1; d.prey = -2; goTo(d, sp, p.x, p.y, true);
      return true;
    }
    if (d.cooldown <= 0) { d.cooldown = 1; p.mood = Math.max(0, p.mood - 6); world.news.push('Des loups ont suivi un habitant isolé dans la nuit.'); }
    return false;
  }
  return false;
}
function endHunt(d: Deer, failed: boolean): void {
  d.prey = -1; d.state = DEER_GRAZE; d.timer = 2 + random() * 2; d.path = []; d.step = 0; d.speed = 0;
  if (failed) d.hunger = HUNT_AT * .4;                                     // tired: it tries again later
}
/** The kill: the deer falls, the pack goes to feed. */
function kill(d: Deer, q: Deer): void {
  q.state = DEER_DEAD; q.errand = 9; q.timer = 0; q.path = []; q.step = 0; q.speed = 0; q.hunted = false;
  const mates = herds.get(root(d));
  if (mates === undefined) return;
  for (const o of mates) {
    o.prey = -1; o.tx = q.x; o.ty = q.y; o.errand = 0;
    if (o === d || dist(o.x, o.y, q.x, q.y) < 2.5 || !goTo(o, SPECIES[o.species], q.x, q.y, true)) { o.state = DEER_EAT; o.timer = 5 + random() * 3; o.hunger = 0; o.path = []; o.step = 0; o.speed = 0; }
    else { o.state = DEER_WALK; o.errand = 4; }
  }
}
/** Stalking: a slow, low approach along the way to the prey; within a few tiles (or when it bolts) the wolf runs it down and catches it if it touches it before the chase times out. */
function wolfHunt(d: Deer, sp: Species, dt: number): void {
  const q = byId.get(d.prey);
  d.timer -= dt;
  if (q === undefined || !alive(q) || d.timer <= 0) { endHunt(d, q !== undefined && alive(q)); return; }
  const g = dist(d.x, d.y, q.x, q.y), panic = d.hunger > starveAt();
  if (d.state === DEER_STALK && (g < CHARGE_AT || q.state === DEER_FLEE)) { d.state = DEER_CHASE; d.timer = 6; d.path = []; d.step = 0; }
  if (d.step >= d.path.length || (world.tick + d.id) % 16 === 0) {
    if (!goTo(d, sp, q.x, q.y, panic) && d.path.length === 0 && g > 1.3) { endHunt(d, true); return; }
  }
  steer(d, sp, dt, d.state === DEER_CHASE ? sp.flee : sp.walk * .7);
  if (d.state === DEER_CHASE && g < 1.3 && random() < .08) kill(d, q);
}

function update(d: Deer, dt: number): void {
  const sp = SPECIES[d.species], st = d.state;
  d.thirst += dt; if (sp.kind === KIND_WOLF) d.hunger += dt;
  const at = tileAt(d.x, d.y);
  if (at >= 0 && !isWalkable(at)) evict(d, at);                          // built over, or a tree grew on it
  if ((world.tick + d.id) % SENSE_EVERY === 0 && st !== DEER_FLEE && st !== DEER_CHARGE) {
    const g = nearestThreat(d);
    if (d.hunted) {                                                         // it notices a hunter after a while (sooner when he is close, later when he creeps), and bolts
      if (g < sp.alert) d.aware += dt * SENSE_EVERY * (1 + (sp.alert - g) / sp.alert * 2); else d.aware = Math.max(0, d.aware - dt * SENSE_EVERY * .5);
      if (d.aware > BOLT_AT) { d.hunted = false; d.aware = 0; startFlee(d, sp); return; }
    } else if (g < sp.fear) { startFlee(d, sp, byWolf); return; }
    if (g < sp.alert) {
      if (d.state !== DEER_ALERT && d.state !== DEER_CHASE && d.state !== DEER_STALK) { d.state = DEER_ALERT; d.path = []; d.step = 0; d.errand = 0; d.speed = 0; }
      d.timer = d.hunted ? 1 : 1.5;
    }
    if (sp.kind === KIND_WOLF && wolfSense(d, sp)) return;
  }
  if (d.state === DEER_GRAZE) { d.speed = 0; d.timer -= dt; if (d.timer <= 0) decide(d, sp); }
  else if (d.state === DEER_WALK) { if (steer(d, sp, dt, sp.walk * (d.errand === 0 ? 1 : sp.trot))) arrive(d); }
  else if (d.state === DEER_ALERT) {
    d.speed = 0; d.timer -= dt; turnToward(d, d.threatX - d.x, d.threatY - d.y, sp.turn, dt);
    if (d.timer <= 0) { d.state = DEER_GRAZE; d.timer = 1; }
  }
  else if (d.state === DEER_REST) { d.speed = 0; if (!isNight() || sp.kind === KIND_WOLF) { d.timer -= dt; if (d.timer <= 0) { d.state = DEER_GRAZE; d.timer = 1; } } }
  else if (d.state === DEER_DRINK) {
    d.speed = 0; d.timer -= dt; turnToward(d, d.tx - d.x, d.ty - d.y, sp.turn, dt);
    if (d.timer <= 0) { d.state = DEER_GRAZE; d.timer = 2; }
  }
  else if (d.state === DEER_STALK || d.state === DEER_CHASE) wolfHunt(d, sp, dt);
  else if (d.state === DEER_EAT || d.state === DEER_HOWL) {
    d.speed = 0; d.timer -= dt; turnToward(d, d.tx - d.x, d.ty - d.y, sp.turn, dt);
    if (d.state === DEER_EAT) d.hunger = 0;
    if (d.timer <= 0) { d.state = DEER_GRAZE; d.timer = 3; }
  }
  else if (d.state === DEER_CHARGE) {
    d.timer -= dt;
    if (d.path.length === 0) pathToward(d, sp, d.threatX, d.threatY, 3, true);
    steer(d, sp, dt, sp.flee);
    if (d.timer <= 0) { d.state = DEER_FLEE; d.timer = 3; d.path = []; d.step = 0; pickEscape(d, sp); pathToward(d, sp, d.tx, d.ty, 12, true); }
  }
  else if (d.state === DEER_FLEE) {
    d.timer -= dt;
    if (steer(d, sp, dt, sp.flee)) {
      if (d.timer <= 0) { d.state = DEER_ALERT; d.timer = 1.5; d.speed = 0; }
      else {
        if (nearestThreat(d) > sp.alert * 2) d.timer = Math.min(d.timer, 1);
        if (!pickEscape(d, sp) || !pathToward(d, sp, d.tx, d.ty, 12, true)) { d.path = []; d.step = 0; d.timer = Math.min(d.timer, .5); }
      }
    }
  }
}

export function updateDeer(dt: number): void {
  index(); indexPeople(); plans = 0;
  const n = world.deer.length;
  let count = 0;
  for (let k = 0; k < n; k++) {
    const d = world.deer[(k + world.tick) % n];                           // the shared searches go round: nobody is always first
    if (d.state === DEER_GONE) continue;
    if (d.species === 0) count++;
    if (d.state !== DEER_DEAD) update(d, dt);
    else { d.timer += dt; if (d.errand === 9 && d.timer > 25) d.state = DEER_GONE; }   // the time since it fell (the view's collapse); a wolf's kill is eaten away
  }
  world.deerTimer -= dt;
  if (world.unlimited && count < Math.round(settings.deerMin * tileCount() / REFERENCE_AREA) && world.deerTimer <= 0) {
    world.deerTimer = settings.deerRespawn;
    for (let tries = 0; tries < 30; tries++) {
      const t = Math.floor(random() * tileCount());
      if (world.terrain[t] === 0 && isWalkable(t) && world.road[t] === 0 && (tileI(t) >= world.size - 3 || tileI(t) <= 1)) { spawnDeer(t); break; }
    }
  }
}

/** A new home on lower ground: the nearest walkable tile within eight that is not hills. */
function lowerHome(d: Deer): void {
  const i0 = tileI(d.home), j0 = tileJ(d.home), n = world.size;
  for (let r = 1; r <= 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
    const a = i0 + di, b = j0 + dj;
    if (a < 0 || b < 0 || a >= n || b >= n) continue;
    const t = b * n + a;
    if (world.biome[t] !== BI_HILLS && isWalkable(t)) { d.home = t; return; }
  }
}
/** The slice of the animals that runs once a day: ageing and death of old age, herds forming, breeding in season below the cap of the area. */
export function dailyAnimals(): void {
  index();
  const n = world.deer.length, counts: number[] = SPECIES.map((_s: Species): number => 0), sizes = new Map<number, number>();
  for (let k = 0; k < n; k++) {
    const d = world.deer[k];
    if (!alive(d)) continue;
    const sp = SPECIES[d.species];
    d.age++; if (d.cooldown > 0) d.cooldown--;
    if (!d.hunted && d.age >= sp.lifeDays && random() < .2 + (d.age - sp.lifeDays) * .04) { d.state = DEER_GONE; continue; }   // a quarter more of life at most, in practice
    counts[d.species]++;
    if (d.leader >= 0 && leaderOf(d) === null) d.leader = -1;
    if (season() === 3 && d.home >= 0 && world.biome[d.home] === BI_HILLS) lowerHome(d);                  // winter: the home range comes down from the hills
    if (sp.kind === KIND_WOLF) { d.stag = d.leader < 0; if (d.cooldown > 0) d.cooldown--; }   // the one that leads is the alpha               // the leader is gone: lead, or join another herd
  }
  for (const d of world.deer) if (alive(d) && d.leader >= 0) sizes.set(d.leader, (sizes.get(d.leader) ?? 1) + 1);
  for (let k = 0; k < n; k++) {
    const d = world.deer[k];
    if (!alive(d) || d.leader >= 0) continue;
    let best = -1, bestD = 10;
    for (const o of world.deer) {
      if (!alive(o) || o.id >= d.id || o.species !== d.species || o.leader >= 0 || (sizes.get(o.id) ?? 1) >= SPECIES[d.species].group) continue;
      const g = dist(o.x, o.y, d.x, d.y);
      if (g < bestD) { bestD = g; best = o.id; }
    }
    if (best >= 0) { d.leader = best; sizes.set(best, (sizes.get(best) ?? 1) + 1); }
  }
  for (let k = 0; k < n; k++) {
    const d = world.deer[k], sp = SPECIES[d.species];
    if (!alive(d) || d.stag || d.age < sp.adultDays || d.cooldown > 0 || counts[d.species] >= Math.max(2, Math.round(sp.perArea * tileCount() / REFERENCE_AREA))) continue;
    if (sp.breedSeasons.indexOf(season()) < 0 || random() >= sp.breedChance) continue;
    let mate = false;
    for (const o of world.deer) if (alive(o) && o.stag && o.species === d.species && o.age >= sp.adultDays && dist(o.x, o.y, d.x, d.y) < 14) mate = true;
    const here = tileAt(d.x, d.y);
    if (!mate || here < 0) continue;
    let spot = isWalkable(here) ? here : -1;
    for (let dir = 0; dir < 4; dir++) { const v = neighbor(here, dir); if (v >= 0 && isWalkable(v)) { spot = v; break; } }
    if (spot < 0) continue;
    const fawn = spawnDeer(spot, d.species);
    fawn.age = 0; fawn.stag = random() < .5; fawn.leader = root(d); fawn.thirst = 0;
    d.cooldown = sp.cooldownDays; counts[d.species]++;
  }
}
