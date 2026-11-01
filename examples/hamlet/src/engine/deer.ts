import { settings } from '../settings';
import { REFERENCE_AREA, DEER_GRAZE, DEER_WALK, DEER_FLEE, DEER_DEAD, DEER_GONE, DEER_REST, DEER_DRINK, DEER_ALERT, ST_SLEEP } from '../constants';
import { world, Deer, random, neighbor, tileAt, tileX, tileY, tileI, tileCount, spawnDeer, waterNeighbor } from '../world/world';
import { SPECIES, Species } from '../rules/species';
import { season } from '../rules/season';
import { isNight } from '../rules/needs';
import { isWalkable, walk, fieldFrom, pathTo, planPath } from './path';

// Wild animals: a small state machine per animal, the numbers of its species in rules/species.ts.
//   graze -> walk (a short hop, to the water when thirsty, toward the herd leader when it strayed) -> graze ... a long rest every few moves, lying up all night;
//   a person within `alert` makes it freeze (alert), within `fear` it runs (flee, the herd with it); a hunter's quarry stands still until the shot, dead or running.
// Once a day (dailyAnimals): ageing, death of old age, herds forming, breeding in season up to the cap of the area.
const SENSE_EVERY = 4;       // ticks between two looks around

const alive = (d: Deer): boolean => d.state !== DEER_GONE && d.state !== DEER_DEAD;
const dist = (ax: number, ay: number, bx: number, by: number): number => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));

/** Distance to the nearest awake person; the deer remembers where it was (its threat). */
function nearestPerson(d: Deer): number {
  let best = 1e9;
  for (const p of world.people) {
    if (p.state === ST_SLEEP) continue;
    const g = dist(p.x, p.y, d.x, d.y);
    if (g < best) { best = g; d.threatX = p.x; d.threatY = p.y; }
  }
  return best;
}
/** One short hop to a random free neighbouring tile. */
function hop(d: Deer): boolean {
  const here = tileAt(d.x, d.y);
  if (here < 0) return false;
  const first = Math.floor(random() * 4);
  for (let k = 0; k < 4; k++) {
    const v = neighbor(here, (first + k) % 4);
    if (v >= 0 && isWalkable(v)) { d.path = [v]; d.step = 0; return true; }
  }
  return false;
}
/** A path of up to n tiles, each the free neighbour farthest from the threat. */
function away(d: Deer, n: number): boolean {
  let here = tileAt(d.x, d.y);
  if (here < 0) return false;
  const path: number[] = [];
  for (let k = 0; k < n; k++) {
    let best = -1, bestD = -1;
    for (let dir = 0; dir < 4; dir++) {
      const v = neighbor(here, dir);
      if (v < 0 || !isWalkable(v) || path.indexOf(v) >= 0) continue;
      const g = dist(tileX(v), tileY(v), d.threatX, d.threatY);
      if (g > bestD) { bestD = g; best = v; }
    }
    if (best < 0) break;
    path.push(best); here = best;
  }
  d.path = path; d.step = 0;
  return path.length > 0;
}
const root = (d: Deer): number => d.leader >= 0 ? d.leader : d.id;
function leaderOf(d: Deer): Deer | null {
  if (d.leader < 0) return null;
  for (const o of world.deer) if (o.id === d.leader && alive(o)) return o;
  return null;
}
function startFlee(d: Deer, sp: Species): void {
  d.state = DEER_FLEE; d.timer = 3 + random() * 2; d.errand = 0; d.path = []; d.step = 0;
  d.yaw = Math.atan2(d.y - d.threatY, d.x - d.threatX);
  away(d, 3);
  for (const o of world.deer) {                                            // the herd runs with it
    if (o === d || !alive(o) || o.state === DEER_FLEE || root(o) !== root(d) || dist(o.x, o.y, d.x, d.y) > sp.alert * 1.5) continue;
    o.threatX = d.threatX; o.threatY = d.threatY; o.state = DEER_FLEE; o.timer = 3 + random() * 2; o.errand = 0; o.path = []; o.step = 0; away(o, 3);
  }
}
function goDrink(d: Deer, sp: Species): boolean {
  const from = tileAt(d.x, d.y);
  if (from < 0) return false;
  const field = fieldFrom(from);
  let best = -1, bestCost = 40;
  for (let t = 0; t < field.dist.length; t++) if (field.dist[t] < bestCost && isWalkable(t) && waterNeighbor(t) >= 0) { bestCost = field.dist[t]; best = t; }
  if (best < 0) { d.thirst = sp.drinkEvery / 2; return false; }            // no shore within reach: try again later
  d.path = pathTo(field, best); d.step = 0; d.errand = 1; d.state = DEER_WALK;
  return true;
}
/** What a grazing animal does next. */
function decide(d: Deer, sp: Species): void {
  if (isNight()) { d.state = DEER_REST; d.timer = 3; d.path = []; d.step = 0; return; }
  if (d.thirst > sp.drinkEvery && world.hasWater && goDrink(d, sp)) return;
  if (d.moves >= sp.restEvery) { d.moves = 0; d.state = DEER_REST; d.timer = 5 + random() * 6; return; }
  const lead = leaderOf(d);
  if (lead !== null && dist(d.x, d.y, lead.x, lead.y) > sp.herdGap && planPath(d, tileAt(lead.x, lead.y))) { d.state = DEER_WALK; return; }
  if (hop(d)) d.state = DEER_WALK; else d.timer = 2;
}
function arrive(d: Deer): void {
  if (d.errand === 1) {
    d.errand = 0; d.thirst = 0; d.state = DEER_DRINK; d.timer = 3 + random() * 2;
    const w = waterNeighbor(tileAt(d.x, d.y));
    if (w >= 0) d.yaw = Math.atan2(tileY(w) - d.y, tileX(w) - d.x);
    return;
  }
  d.moves++; d.state = DEER_GRAZE; d.timer = 2 + random() * 5;
}

function update(d: Deer, dt: number): void {
  const sp = SPECIES[d.species];
  d.thirst += dt;
  if ((world.tick + d.id) % SENSE_EVERY === 0 && d.state !== DEER_FLEE) {
    const g = nearestPerson(d);
    if (g < sp.fear && !d.hunted) { startFlee(d, sp); return; }
    if (g < sp.alert) {
      if (d.state !== DEER_ALERT) { d.state = DEER_ALERT; d.path = []; d.step = 0; d.errand = 0; d.yaw = Math.atan2(d.threatY - d.y, d.threatX - d.x); }
      d.timer = d.hunted ? 1 : 1.5;
    }
  }
  if (d.state === DEER_GRAZE) { d.timer -= dt; if (d.timer <= 0) decide(d, sp); }
  else if (d.state === DEER_WALK) { if (walk(d, dt, sp.walk)) arrive(d); }
  else if (d.state === DEER_ALERT) { d.timer -= dt; if (d.timer <= 0) { d.state = DEER_GRAZE; d.timer = 1; } }
  else if (d.state === DEER_REST) { if (!isNight()) { d.timer -= dt; if (d.timer <= 0) { d.state = DEER_GRAZE; d.timer = 1; } } }
  else if (d.state === DEER_DRINK) { d.timer -= dt; if (d.timer <= 0) { d.state = DEER_GRAZE; d.timer = 2; } }
  else if (d.state === DEER_FLEE) {
    d.timer -= dt;
    if (walk(d, dt, sp.flee)) {
      if (d.timer <= 0) { d.state = DEER_ALERT; d.timer = 1.5; }
      else { if (nearestPerson(d) > sp.alert * 2) d.timer = Math.min(d.timer, 1); if (!away(d, 3)) hop(d); }
    }
  }
}

export function updateDeer(dt: number): void {
  let count = 0;
  for (const d of world.deer) {
    if (d.state === DEER_GONE) continue;
    count++;
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
  const n = world.deer.length;
  let count = 0;
  for (let k = 0; k < n; k++) {
    const d = world.deer[k];
    if (!alive(d)) continue;
    const sp = SPECIES[d.species];
    d.age++; if (d.cooldown > 0) d.cooldown--;
    if (!d.hunted && d.age >= sp.lifeDays && random() < .2 + (d.age - sp.lifeDays) * .04) { d.state = DEER_GONE; continue; }   // a quarter more of life at most, in practice
    count++;
    if (d.leader >= 0 && leaderOf(d) === null) d.leader = -1;               // the leader is gone: lead, or join another herd
    if (d.leader < 0) {
      let best = -1, bestD = 10;
      for (const o of world.deer) if (alive(o) && o.id < d.id && o.species === d.species && o.leader < 0 && dist(o.x, o.y, d.x, d.y) < bestD) { bestD = dist(o.x, o.y, d.x, d.y); best = o.id; }
      d.leader = best;
    }
  }
  for (let k = 0; k < n; k++) {
    const d = world.deer[k], sp = SPECIES[d.species];
    if (!alive(d) || d.stag || d.age < sp.adultDays || d.cooldown > 0 || count >= Math.max(2, Math.round(sp.perArea * tileCount() / REFERENCE_AREA))) continue;
    if (sp.breedSeasons.indexOf(season()) < 0 || random() >= sp.breedChance) continue;
    let mate = false;
    for (const o of world.deer) if (alive(o) && o.stag && o.species === d.species && o.age >= sp.adultDays && dist(o.x, o.y, d.x, d.y) < 14) mate = true;
    const here = tileAt(d.x, d.y);
    if (!mate || here < 0) continue;
    let spot = isWalkable(here) ? here : -1;
    for (let dir = 0; dir < 4; dir++) { const v = neighbor(here, dir); if (v >= 0 && isWalkable(v)) { spot = v; break; } }
    if (spot < 0) continue;
    const fawn = spawnDeer(spot);
    fawn.species = d.species; fawn.age = 0; fawn.stag = random() < .5; fawn.leader = root(d); fawn.thirst = 0;
    d.cooldown = sp.cooldownDays; count++;
  }
}
