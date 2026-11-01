import { HOUSE, COVER_DAYS, ST_ROAM } from '../constants';
import { world, Person, Building, Alert, random, neighbor, tileIndex, tileAt, tileI, tileJ } from '../world/world';
import { economy } from '../world/economy';
import { isWalkable, planPath } from './path';

// Services reach houses two ways: a walker leaves its building and roams the roads (every house beside its route is covered), or a building covers every
// house within its radius. Either way the house keeps a counter of days (Building.cover[service]) that decays once a day: covered = counter > 0.

const isHouse = (id: number): boolean => id >= 0 && world.buildings[id].alive && world.buildings[id].type === HOUSE;
/** Covers the houses on the four sides of a tile (the road a walker is on). */
export function coverAround(t: number, service: number): void {
  for (let d = 0; d < 4; d++) { const v = neighbor(t, d); if (v >= 0 && isHouse(world.build[v])) world.buildings[world.build[v]].cover[service] = COVER_DAYS; }
  const kind = economy.services[service].risk;
  if (kind !== '') guard(t, kind);
}
function alertOf(kind: string, text: string, tile: number): Alert { const a = new Alert(); a.kind = kind; a.text = text; a.tile = tile; return a; }
/** A safety walker is at tile t: every building within two tiles gets its counter of that kind reset (a fire walker also puts out a burning ruin). */
function guard(t: number, kind: string): void {
  const ci = tileI(t), cj = tileJ(t);
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
    const i = ci + di, j = cj + dj;
    if (i < 0 || j < 0 || i >= world.size || j >= world.size) continue;
    const id = world.build[tileIndex(i, j)];
    if (id < 0 || !world.buildings[id].alive) continue;
    const b = world.buildings[id];
    if (kind === 'fire') {
      b.fire = 0;
      if (b.burn > 0) { b.burn = 0; world.alerts.push(alertOf('out', 'Les pompiers ont maîtrisé l’incendie : le feu ne se propagera pas.', tileIndex(b.i, b.j))); }
    } else if (kind === 'collapse') b.damage = 0;
    else if (kind === 'crime') b.crime = 0;
  }
}

/** A road tile next to the building (the walker's first step), or -1. */
function roadBeside(b: Building): number {
  for (let d = 0; d < 4; d++) { const v = neighbor(tileIndex(b.i, b.j), d); if (v >= 0 && world.road[v] && isWalkable(v)) return v; }
  return -1;
}
/** A random walk over the road tiles: never straight back unless it is a dead end. Uses the world's generator, so the same ticks walk the same round. */
function roamFrom(start: number, steps: number): number[] {
  const out: number[] = [];
  let at = start, from = -1;
  for (let k = 0; k < steps; k++) {
    const options: number[] = [];
    for (let d = 0; d < 4; d++) { const v = neighbor(at, d); if (v >= 0 && world.road[v] && isWalkable(v) && v !== from) options.push(v); }
    if (options.length === 0 && from >= 0) options.push(from);
    if (options.length === 0) break;
    const next = options[Math.floor(random() * options.length)];
    out.push(next); from = at; at = next;
  }
  return out;
}
/** The walker of a service building sets out: to the road beside the building, then a random round. False when there is no road. */
export function startRoam(p: Person, site: Building): boolean {
  const road = roadBeside(site), def = economy.buildings[site.type];
  if (road < 0 || def.service === null || !planPath(p, road)) return false;
  p.path = p.path.concat(roamFrom(road, def.service.range));
  p.target = -1; p.state = ST_ROAM;
  return true;
}
/** Each tile a walker enters covers the houses beside it. */
export function roamTick(p: Person, site: Building): void {
  const here = tileAt(p.x, p.y);
  if (here < 0 || here === p.target) return;
  p.target = here;
  const sd = economy.buildings[site.type].service;
  if (sd !== null && world.road[here]) coverAround(here, sd.service);
}
/** The daily slice for services: counters decay by a day, then buildings with a radius cover the houses within it. */
export function dailyServices(): void {
  for (const b of world.buildings) if (b.alive && b.type === HOUSE) for (let k = 0; k < b.cover.length; k++) if (b.cover[k] > 0) b.cover[k]--;
  for (const s of world.buildings) {
    if (!s.alive) continue;
    const def = economy.buildings[s.type];
    if (def.service === null || def.service.walker || (def.workers > 0 && s.workers === 0)) continue;
    const r = def.service.radius;
    for (const h of world.buildings) {
      if (!h.alive || h.type !== HOUSE) continue;
      const dx = h.i - s.i, dy = h.j - s.j;
      if (dx * dx + dy * dy <= r * r) h.cover[def.service.service] = COVER_DAYS;
    }
  }
}
