import { HOUSE, COVER_DAYS, ST_ROAM } from '../constants';
import { world, Person, Building, Alert, neighbor, tileIndex, tileAt, tileI, tileJ } from '../world/world';
import { economy } from '../world/economy';
import { isWalkable, planPath } from './path';
import { edgeTiles } from './network';
import { feed } from '../rules/housing';
import { marketStocked } from './transport';

// Services reach houses two ways: a walker leaves its building and roams the roads (every house beside its route is covered), or a building covers every
// house within its radius. Either way the house keeps a counter of days (Building.cover[service]) that decays once a day: covered = counter > 0.

const isHouse = (id: number): boolean => id >= 0 && world.buildings[id].alive && world.buildings[id].type === HOUSE;
/** The distributor of a market hands a house what the market holds of the goods it lacks. */
function handOut(market: Building, house: Building): void {
  feed(house, (k: number, n: number): number => { const got = Math.min(n, market.stock[k] - market.reserved[k]); if (got < 1) return 0; market.stock[k] -= got; return got; });
}
/** Covers the houses within `economy.sim.walkerReach` tiles of a tile (the road a walker is on): their counter goes back to COVER_DAYS and decays by a day each day. */
export function coverAround(t: number, service: number, market: Building | null = null): void {
  const reach = economy.sim.walkerReach, ci = tileI(t), cj = tileJ(t);
  for (let dj = -reach; dj <= reach; dj++) for (let di = -reach; di <= reach; di++) {
    const i = ci + di, j = cj + dj;
    if (i < 0 || j < 0 || i >= world.size || j >= world.size) continue;
    const id = world.build[j * world.size + i];
    if (!isHouse(id)) continue;
    world.buildings[id].cover[service] = COVER_DAYS;
    if (market !== null) handOut(market, world.buildings[id]);
  }
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
  for (const v of edgeTiles(b)) if (world.road[v] && isWalkable(v)) return v;
  return -1;
}
/** The round of a roamer over the road tiles, with no dice: it goes straight on where the road does, and at a junction takes the way the building's own turn counter points at (the counter rotates, so
 *  successive walkers of one building cover different streets); it turns back only at a dead end. Same ticks, same round. */
function roamFrom(site: Building, start: number, steps: number): number[] {
  const out: number[] = [];
  let at = start, from = -1, heading = -1;
  for (let k = 0; k < steps; k++) {
    const dirs: number[] = [];
    for (let d = 0; d < 4; d++) { const v = neighbor(at, d); if (v >= 0 && world.road[v] && isWalkable(v) && v !== from) dirs.push(d); }
    let dir = -1;
    if (dirs.length === 0) { if (from < 0) break; for (let d = 0; d < 4; d++) if (neighbor(at, d) === from) dir = d; }
    else if (dirs.length === 1) dir = dirs[0];
    else {
      site.turn++;
      const straight = heading >= 0 && dirs.indexOf(heading) >= 0;
      if (straight && site.turn % 3 !== 0) dir = heading;
      else { const others = dirs.filter((d: number): boolean => d !== heading || !straight); dir = others[site.turn % others.length]; }
    }
    if (dir < 0) break;
    const next = neighbor(at, dir);
    out.push(next); from = at; at = next; heading = dir;
  }
  return out;
}
/** The walker of a service building sets out: to the road beside the building, then a random round. False when there is no road. */
export function startRoam(p: Person, site: Building): boolean {
  const road = roadBeside(site), def = economy.buildings[site.type];
  if (road < 0 || def.service === null || !planPath(p, road)) return false;
  p.path = p.path.concat(roamFrom(site, road, def.service.range));
  p.target = -1; p.state = ST_ROAM;
  return true;
}
/** Each tile a walker enters covers the houses beside it. */
export function roamTick(p: Person, site: Building): void {
  const here = tileAt(p.x, p.y);
  if (here < 0 || here === p.target) return;
  p.target = here;
  const def = economy.buildings[site.type], sd = def.service;
  if (def.market && !marketStocked(site)) return;      // a market with nothing to hand out covers nothing
  if (sd !== null && world.road[here]) coverAround(here, sd.service, def.market ? site : null);
}
/** The distance on one axis between the nearest tiles of two spans [a, a + aw) and [b, b + bw): the plain difference for two single tiles, 0 when they overlap. */
export function spanGap(a: number, aw: number, b: number, bw: number): number { return b >= a + aw ? b - (a + aw - 1) : a >= b + bw ? a - (b + bw - 1) : 0; }
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
      const dx = spanGap(h.i, h.w, s.i, s.w), dy = spanGap(h.j, h.h, s.j, s.h);      // from the nearest edge of the footprints
      if (dx * dx + dy * dy <= r * r) h.cover[def.service.service] = COVER_DAYS;
    }
  }
}
