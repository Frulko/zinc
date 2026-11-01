import { settings } from '../settings';
import { REFERENCE_AREA, DEER_GRAZE, DEER_WALK, DEER_FLEE, DEER_DEAD, DEER_GONE, DEER_REST, DEER_DRINK, DEER_ALERT, DEER_CHARGE, ST_SLEEP } from '../constants';
import { world, Deer, random, neighbor, tileAt, tileX, tileY, tileI, tileJ, tileCount, spawnDeer, waterNeighbor, treesAround } from '../world/world';
import { SPECIES, Species, KIND_HOPPER, KIND_BOAR } from '../rules/species';
import { season } from '../rules/season';
import { isNight, dayFraction } from '../rules/needs';
import { sound } from '../audio';
import { isWalkable, fieldFrom, approachTile, pathTo } from './path';

// Wild animals: a small state machine per animal, the numbers of its species in rules/species.ts (kind: grazer, hopper, boar).
//   graze -> walk (to a spot of its home range by the time of day, to the water when thirsty, to its place in the herd when it strayed) -> graze ... a long rest every few moves, lying up all night;
//   a person or a burning ruin within `alert` makes it freeze (alert), within `fear` it runs (flee: the herd with it, toward cover and away from the threat, panic crosses the village); a cornered boar charges first.
// Moving is steering, not tile hopping: a heading that turns at a limited rate, a speed that ramps (walk, trot, run), a push away from herd mates, a slide along obstacles and a stuck timer that re-routes.
// Short moves are chosen tile by tile toward a goal; only a long way (to the herd leader, to the water) asks the heap pathfinder, a few times per tick at most.
// Once a day (dailyAnimals): ageing, death of old age, herds forming, breeding in season up to the cap of the area.
const SENSE_EVERY = 4;       // ticks between two looks around
const PLANS_PER_TICK = 2;    // heap searches the animals share each tick
const NEAR = 40;             // path cost an animal looks for the water or its herd
const ARRIVE = .5, STUCK = .8;
const DIRS: number[][] = [[1, 0], [.7071, .7071], [0, 1], [-.7071, .7071], [-1, 0], [-.7071, -.7071], [0, -1], [.7071, -.7071]];

const alive = (d: Deer): boolean => d.state !== DEER_GONE && d.state !== DEER_DEAD;
const dist = (ax: number, ay: number, bx: number, by: number): number => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
const root = (d: Deer): number => d.leader >= 0 ? d.leader : d.id;

// Who is who this tick: animals by id and herds by their leader's id (rebuilt at the start of the update, never searched linearly).
const byId = new Map<number, Deer>();
const herds = new Map<number, Deer[]>();
let plans = 0;
function index(): void {
  byId.clear(); herds.clear();
  for (const d of world.deer) if (alive(d)) byId.set(d.id, d);
  for (const d of world.deer) {
    if (!alive(d)) continue;
    const r = root(d), list = herds.get(r);
    if (list === undefined) herds.set(r, [d]); else list.push(d);
  }
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

/** Distance to the nearest awake person or burning ruin; the animal remembers where it was (its threat). */
function nearestThreat(d: Deer): number {
  let best = 1e9;
  for (const p of world.people) {
    if (p.state === ST_SLEEP) continue;
    const g = dist(p.x, p.y, d.x, d.y);
    if (g < best) { best = g; d.threatX = p.x; d.threatY = p.y; }
  }
  for (const b of world.buildings) {
    if (b.burn <= 0) continue;
    const t = b.j * world.size + b.i, g = dist(tileX(t), tileY(t), d.x, d.y) * .35;   // a fire scares from farther than a person
    if (g < best) { best = g; d.threatX = tileX(t); d.threatY = tileY(t); }
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
  const path: number[] = [], inside = !calm(here, sp.shy);
  let cur = dist(tileX(here), tileY(here), tx, ty);
  for (let k = 0; k < n; k++) {
    let best = -1, bestD = cur - .01;
    for (let dir = 0; dir < 4; dir++) {
      const v = neighbor(here, dir);
      if (v < 0 || !isWalkable(v) || path.indexOf(v) >= 0) continue;
      const g = dist(tileX(v), tileY(v), tx, ty);
      if (g < bestD && (panic || inside || calm(v, sp.shy))) { bestD = g; best = v; }
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
  const field = fieldFrom(from, NEAR), target = approachTile(field, goal);
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
function runFrom(o: Deer, sp: Species, tx: number, ty: number): void {
  o.state = DEER_FLEE; o.timer = 3 + random() * 2; o.errand = 0;
  const j = ((o.id % 5) - 2) * 1.2;                                        // each one its own line to the same cover
  if (!pathToward(o, sp, tx + j, ty - j, 12, true)) { o.path = []; o.step = 0; }
}
function startFlee(d: Deer, sp: Species): void {
  d.errand = 0; d.path = []; d.step = 0;
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
    o.threatX = d.threatX; o.threatY = d.threatY; o.path = []; o.step = 0; runFrom(o, sp, d.tx, d.ty);
  }
}

function goDrink(d: Deer, sp: Species): boolean {
  const from = tileAt(d.x, d.y);
  if (from < 0) return false;
  if (plans >= PLANS_PER_TICK) { d.timer = .5; return true; }              // the searches of this tick are taken: ask again in a moment
  plans++;
  const field = fieldFrom(from, NEAR);
  let best = -1, bestCost = NEAR;
  for (let t = 0; t < field.dist.length; t++) if (field.dist[t] < bestCost && isWalkable(t) && waterNeighbor(t) >= 0) { bestCost = field.dist[t]; best = t; }
  if (best < 0) { d.thirst = sp.drinkEvery / 2; return false; }            // no shore within reach: try again later
  d.path = pathTo(field, best); d.step = 0; d.errand = 1; d.state = DEER_WALK;
  return true;
}
/** One short move around its home range, picked among a few spots by what the time of day and season ask: the edge of the trees by day, the open at dawn and dusk and in winter. */
function wander(d: Deer, sp: Species): boolean {
  const here = tileAt(d.x, d.y);
  if (here < 0) return false;
  if (d.home < 0) d.home = here;
  const hx = tileX(d.home), hy = tileY(d.home), f = dayFraction(), open = f < .12 || f > .55, w = sp.cover * (season() === 3 ? -.4 : open ? -.5 : 1);
  const spread = Math.min(10, sp.homeR + 2), inside = !calm(here, sp.shy);
  let best = -1e9, bx = 0, by = 0;
  for (let c = 0; c < 5; c++) {
    const px = d.x + (random() * 2 - 1) * spread, py = d.y + (random() * 2 - 1) * spread, t = tileAt(px, py);
    if (t < 0 || !isWalkable(t) || (!inside && !calm(t, sp.shy))) continue;
    const away = dist(px, py, hx, hy) / (sp.homeR * 2), score = -away * (away > 1 ? 4 : 1) + w * treesAround(t) / 6 + random() * .3;
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
  if (isNight()) { d.state = DEER_REST; d.timer = 3; d.path = []; d.step = 0; return; }
  if (d.thirst > sp.drinkEvery && world.hasWater) { if (goDrink(d, sp)) return; }
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
  if (d.errand === 1) {
    d.errand = 0; d.thirst = 0; d.state = DEER_DRINK; d.timer = 3 + random() * 2;
    const w = waterNeighbor(tileAt(d.x, d.y));
    if (w >= 0) { d.tx = tileX(w); d.ty = tileY(w); }
    return;
  }
  d.errand = 0; d.moves++; d.state = DEER_GRAZE; d.timer = 2 + random() * 5;
}

function update(d: Deer, dt: number): void {
  const sp = SPECIES[d.species], st = d.state;
  d.thirst += dt;
  const at = tileAt(d.x, d.y);
  if (at >= 0 && !isWalkable(at)) evict(d, at);                          // built over, or a tree grew on it
  if ((world.tick + d.id) % SENSE_EVERY === 0 && st !== DEER_FLEE && st !== DEER_CHARGE) {
    const g = nearestThreat(d);
    if (g < sp.fear && !d.hunted) { startFlee(d, sp); return; }
    if (g < sp.alert) {
      if (d.state !== DEER_ALERT) { d.state = DEER_ALERT; d.path = []; d.step = 0; d.errand = 0; d.speed = 0; }
      d.timer = d.hunted ? 1 : 1.5;
    }
  }
  if (d.state === DEER_GRAZE) { d.speed = 0; d.timer -= dt; if (d.timer <= 0) decide(d, sp); }
  else if (d.state === DEER_WALK) { if (steer(d, sp, dt, sp.walk * (d.errand === 0 ? 1 : sp.trot))) arrive(d); }
  else if (d.state === DEER_ALERT) {
    d.speed = 0; d.timer -= dt; turnToward(d, d.threatX - d.x, d.threatY - d.y, sp.turn, dt);
    if (d.timer <= 0) { d.state = DEER_GRAZE; d.timer = 1; }
  }
  else if (d.state === DEER_REST) { d.speed = 0; if (!isNight()) { d.timer -= dt; if (d.timer <= 0) { d.state = DEER_GRAZE; d.timer = 1; } } }
  else if (d.state === DEER_DRINK) {
    d.speed = 0; d.timer -= dt; turnToward(d, d.tx - d.x, d.ty - d.y, sp.turn, dt);
    if (d.timer <= 0) { d.state = DEER_GRAZE; d.timer = 2; }
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
  index(); plans = 0;
  const n = world.deer.length;
  let count = 0;
  for (let k = 0; k < n; k++) {
    const d = world.deer[(k + world.tick) % n];                           // the shared searches go round: nobody is always first
    if (d.state === DEER_GONE) continue;
    if (d.species === 0) count++;
    if (d.state !== DEER_DEAD) update(d, dt);
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
    if (d.leader >= 0 && leaderOf(d) === null) d.leader = -1;               // the leader is gone: lead, or join another herd
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
