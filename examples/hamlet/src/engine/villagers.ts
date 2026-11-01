import {
  HOUSE, ROLE_FISHER, ST_TO_SHORE, ST_FISH, FISH_SECONDS, FISH_CATCH_CHANCE, ROLE_SETTLER, ROLE_RESIDENT, ROLE_LUMBERJACK, ROLE_HUNTER,
  ST_IDLE, ST_STROLL, ST_GO_WORK, ST_SEEK, ST_TO_TREE, ST_CHOP, ST_TO_SITE, ST_STALK, ST_AIM, ST_SHOT, ST_TO_BODY, ST_PICK, ST_WALK_IN,
  CHOP_SECONDS, AIM_SECONDS, ARROW_SECONDS, SHOOT_RANGE, HIT_CHANCE, PICK_SECONDS, WORK_RADIUS, SETTLER_INTERVAL,
  DEER_GRAZE, DEER_WALK, DEER_FLEE, DEER_DEAD, DEER_GONE, WALK_SPEED,
} from '../constants';
import { Housing } from '../world/economy';
import { world, Person, Building, random, tileAt, tileX, tileY, tileIndex, tileI, tileJ, neighbor, waterNeighbor } from '../world/world';
import { fieldFrom, approachTile, pathTo, planPath, walk, isWalkable, isMoving, UNREACHABLE } from './path';
import { sound } from '../pixel';
import { settings } from '../settings';
import { economy } from '../world/economy';
import { add } from '../rules/stock';

const gap = (ax: number, ay: number, bx: number, by: number): number => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
const buildingTile = (b: Building): number => tileIndex(b.i, b.j);
const tileOf = (p: Person): number => tileAt(p.x, p.y);
const faceTile = (p: Person, t: number): void => { p.yaw = Math.atan2(tileY(t) - p.y, tileX(t) - p.x); };
function isNear(p: Person, t: number): boolean {
  const here = tileOf(p);
  return here >= 0 && Math.abs(tileI(here) - tileI(t)) + Math.abs(tileJ(here) - tileJ(t)) <= 1;
}

export function newPerson(role: number, home: number, t: number): Person {
  const p = new Person();
  p.x = tileX(t); p.y = tileY(t); p.yaw = random() * 6.28; p.phase = random() * 6;
  p.role = role; p.home = home; p.timer = random() * 3; p.hair = Math.floor(random() * 4);
  return p;
}

// ---- who is connected to the entrance by road ----
let reachRevision = -1;
let reached: number[] = [];
function roadReach(): number[] {
  if (reachRevision === world.revision) return reached;
  reached = Array.from({ length: world.road.length }, (): number => 0);
  const queue: number[] = [world.gate];
  reached[world.gate] = 1;
  while (queue.length > 0) {
    const t = queue.pop() as number;
    for (let d = 0; d < 4; d++) {
      const v = neighbor(t, d);
      if (v >= 0 && world.road[v] && !reached[v]) { reached[v] = 1; queue.push(v); }
    }
  }
  reachRevision = world.revision;
  return reached;
}
/** A building is connected when a road tile next to it leads back to the entrance. */
export function isConnected(b: Building): boolean {
  const reach = roadReach();
  for (let d = 0; d < 4; d++) { const v = neighbor(buildingTile(b), d); if (v >= 0 && reach[v]) return true; }
  return false;
}

// ---- arrivals and jobs ----
function releaseClaims(p: Person): void {
  if (p.role === ROLE_LUMBERJACK && p.target >= 0 && (p.state === ST_TO_TREE || p.state === ST_CHOP)) world.claimed[p.target] = 0;
  if (p.role === ROLE_FISHER && p.target >= 0 && (p.state === ST_TO_SHORE || p.state === ST_FISH)) world.claimed[p.target] = 0;
  if (p.role === ROLE_HUNTER && p.target >= 0 && p.state >= ST_STALK && p.state <= ST_PICK && p.state !== ST_TO_SITE) world.deer[p.target].hunted = false;
  p.target = -1;
}
export function population(): number {
  let n = 0;
  for (const b of world.buildings) if (b.alive && b.type === HOUSE) n += b.residents;
  return n;
}
function updateSettlers(dt: number): void {
  world.waitingForFood = false;
  for (const b of world.buildings) {
    if (!b.alive || b.type !== HOUSE) continue;
    const housing = economy.buildings[HOUSE].housing as Housing;
    if (b.residents >= housing.capacity || !isConnected(b)) continue;
    b.timer -= dt;
    if (b.timer > 0) continue;
    const needsFood = population() >= housing.free;
    let food = -1;
    for (const k of housing.eats) if (food < 0 && world.stock[k] >= 1) food = k;
    if (needsFood && food < 0) { world.waitingForFood = true; b.timer = 1; continue; }
    const settler = newPerson(ROLE_SETTLER, world.buildings.indexOf(b), world.gate);
    settler.state = ST_WALK_IN;
    if (!planPath(settler, buildingTile(b))) { b.timer = 2; continue; }
    if (needsFood) world.stock[food] -= 1;
    b.residents++; b.timer = SETTLER_INTERVAL; world.people.push(settler); world.saveDirty = true;
  }
}
export function createResident(houseId: number): void {
  const house = world.buildings[houseId];
  const t = buildingTile(house);
  let spot = t;
  for (let d = 0; d < 4; d++) { const v = neighbor(t, d); if (v >= 0 && isWalkable(v)) { spot = v; break; } }
  const p = newPerson(ROLE_RESIDENT, houseId, spot);
  p.state = ST_IDLE;
  world.people.push(p);
}
function assignJobs(): void {
  for (let id = 0; id < world.buildings.length; id++) {
    const site = world.buildings[id];
    if (!site.alive || site.type === HOUSE) continue;
    const def = economy.buildings[site.type];
    while (site.workers < def.workers) {
      let best: Person | null = null, bestDist = 1e9;
      for (const p of world.people) {
        if (p.role !== ROLE_RESIDENT || p.job >= 0 || (p.state !== ST_IDLE && p.state !== ST_STROLL)) continue;
        const d = gap(p.x, p.y, tileX(buildingTile(site)), tileY(buildingTile(site)));
        if (d < bestDist) { bestDist = d; best = p; }
      }
      if (best === null) break;
      best.role = def.roleId;
      best.job = id; site.workers++; best.state = ST_GO_WORK;
      if (!planPath(best, buildingTile(site))) best.timer = 0;
    }
  }
}

/** A workplace was torn down: its workers go back to idling at home. */
export function releaseWorkers(siteId: number): void {
  for (const p of world.people) {
    if (p.job !== siteId) continue;
    releaseClaims(p);
    p.job = -1; p.role = ROLE_RESIDENT; p.carry = 0; p.state = ST_IDLE; p.path = []; p.step = 0; p.timer = 1;
  }
  world.buildings[siteId].workers = 0;
}
/** A house was torn down: its inhabitants leave. */
export function removeResidents(houseId: number): void {
  const kept: Person[] = [];
  for (const p of world.people) {
    if (p.home !== houseId) { kept.push(p); continue; }
    releaseClaims(p);
    if (p.job >= 0) world.buildings[p.job].workers--;
  }
  world.people = kept;
}

// ---- the daily life of one person ----
function nearestTree(p: Person): boolean {
  const field = fieldFrom(tileOf(p));
  let best = -1, bestCost = WORK_RADIUS;
  for (let t = 0; t < world.tree.length; t++) {
    if (world.tree[t] === 0 || world.claimed[t]) continue;
    const ap = approachTile(field, t);
    if (ap >= 0 && field.dist[ap] < bestCost) { bestCost = field.dist[ap]; best = t; }
  }
  if (best < 0) return false;
  p.path = pathTo(field, approachTile(field, best)); p.step = 0;
  world.claimed[best] = 1; p.target = best; p.state = ST_TO_TREE;
  return true;
}
/** The nearest free shore tile (walkable, next to the pond): where a fisher stands. */
function nearestShore(p: Person): boolean {
  const field = fieldFrom(tileOf(p));
  let best = -1, bestCost = WORK_RADIUS;
  for (let t = 0; t < world.tree.length; t++) {
    if (world.claimed[t] || !isWalkable(t) || waterNeighbor(t) < 0 || field.dist[t] >= bestCost) continue;
    bestCost = field.dist[t]; best = t;
  }
  if (best < 0) return false;
  p.path = pathTo(field, best); p.step = 0;
  world.claimed[best] = 1; p.target = best; p.state = ST_TO_SHORE;
  return true;
}
function nearestGame(p: Person): boolean {
  const field = fieldFrom(tileOf(p));
  let best = -1, bestCost = WORK_RADIUS, bestBody = false;
  for (let k = 0; k < world.deer.length; k++) {
    const d = world.deer[k];
    if (d.hunted || d.state === DEER_GONE) continue;
    const t = tileAt(d.x, d.y);
    if (t < 0) continue;
    const ap = approachTile(field, t);
    if (ap < 0) continue;
    const body = d.state === DEER_DEAD, cost = field.dist[ap] - (body ? 6 : 0);   // a carcass already on the ground comes first
    if (cost < bestCost) { bestCost = cost; best = k; bestBody = body; }
  }
  if (best < 0) return false;
  const deer = world.deer[best];
  if (!planPath(p, tileAt(deer.x, deer.y))) return false;
  deer.hunted = true; p.target = best; p.state = bestBody ? ST_TO_BODY : ST_STALK; p.timer = .9;
  return true;
}
function deliver(p: Person): void {
  add(economy.buildings[world.buildings[p.job].type].outputs);
  p.carry = 0; world.saveDirty = true;
  sound('point', .3);
}
function goDeliver(p: Person): void {
  p.state = ST_TO_SITE;
  if (!planPath(p, buildingTile(world.buildings[p.job]))) { p.carry = 0; p.state = ST_SEEK; p.timer = 1; }
}

function updateWorker(p: Person, dt: number): void {
  const site = world.buildings[p.job];
  const speed = WALK_SPEED * settings.walkSpeed;
  switch (p.state) {
    case ST_GO_WORK:
      if (walk(p, dt, speed)) { p.state = ST_SEEK; p.timer = 0; }
      break;
    case ST_SEEK:
      p.timer -= dt;
      if (p.timer > 0) break;
      const found = p.role === ROLE_LUMBERJACK ? nearestTree(p) : p.role === ROLE_FISHER ? nearestShore(p) : nearestGame(p);
      if (!found) p.timer = 2;
      break;
    case ST_TO_TREE:
      if (!walk(p, dt, speed)) break;
      if (world.tree[p.target] === 0 || !isNear(p, p.target)) { releaseClaims(p); p.state = ST_SEEK; p.timer = 0; break; }
      faceTile(p, p.target); p.state = ST_CHOP; p.timer = CHOP_SECONDS;
      break;
    case ST_CHOP: {
      const before = Math.floor(p.phase * 1.6);
      p.phase += dt * 6.2;
      if (Math.floor(p.phase * 1.6) !== before && p.phase * 1.6 > 0) sound('wood', .5);
      p.timer -= dt;
      if (p.timer > 0) break;
      world.tree[p.target] = 0; world.claimed[p.target] = 0; world.felledCount++;
      world.revision++; world.saveDirty = true;
      sound('splash', .25);
      p.target = -1; p.carry = 1; goDeliver(p);
      break;
    }
    case ST_TO_SHORE: {
      if (!walk(p, dt, speed)) break;
      const water = waterNeighbor(p.target);
      if (water < 0 || tileOf(p) !== p.target) { releaseClaims(p); p.state = ST_SEEK; p.timer = 0; break; }
      faceTile(p, water); p.state = ST_FISH; p.timer = FISH_SECONDS; p.phase = 0;
      break;
    }
    case ST_FISH:
      p.phase += dt;
      p.timer -= dt;
      if (p.timer > 0) break;
      if (random() < FISH_CATCH_CHANCE) {
        world.claimed[p.target] = 0; p.target = -1; p.carry = 3;
        sound('splash', .3);
        goDeliver(p);
      } else p.timer = FISH_SECONDS * .6;     // nothing bit: the line goes back in
      break;
    case ST_STALK: {
      const deer = world.deer[p.target];
      if (deer.state === DEER_DEAD || deer.state === DEER_GONE) { releaseClaims(p); p.state = ST_SEEK; p.timer = 0; break; }
      if (gap(deer.x, deer.y, p.x, p.y) <= SHOOT_RANGE) {
        p.path = []; p.step = 0; p.state = ST_AIM; p.timer = AIM_SECONDS;
        p.yaw = Math.atan2(deer.y - p.y, deer.x - p.x);
        break;
      }
      p.timer -= dt;
      if (walk(p, dt, speed) || p.timer <= 0) { p.timer = .9; if (!planPath(p, tileAt(deer.x, deer.y))) { releaseClaims(p); p.state = ST_SEEK; p.timer = 1; } }
      break;
    }
    case ST_AIM: {
      const deer = world.deer[p.target];
      p.yaw = Math.atan2(deer.y - p.y, deer.x - p.x);
      if (gap(deer.x, deer.y, p.x, p.y) > SHOOT_RANGE + 1.5) { p.state = ST_STALK; p.timer = 0; break; }
      p.timer -= dt;
      if (p.timer > 0) break;
      p.shotX = deer.x; p.shotY = deer.y; p.state = ST_SHOT; p.timer = ARROW_SECONDS;
      sound('throw', .4);
      break;
    }
    case ST_SHOT: {
      p.timer -= dt;
      if (p.timer > 0) break;
      const deer = world.deer[p.target];
      if (random() < HIT_CHANCE) {
        deer.state = DEER_DEAD; deer.path = []; deer.step = 0;
        sound('soft', .5);
        p.state = ST_TO_BODY;
        if (!planPath(p, tileAt(deer.x, deer.y))) { deer.hunted = false; p.state = ST_SEEK; p.timer = 1; }
      } else {
        deer.state = DEER_FLEE; deer.timer = 4; deer.path = []; deer.step = 0; deer.hunted = false;
        p.target = -1; p.state = ST_SEEK; p.timer = 1;
      }
      break;
    }
    case ST_TO_BODY: {
      if (!walk(p, dt, speed)) break;
      const deer = world.deer[p.target];
      if (deer.state !== DEER_DEAD || !isNear(p, tileAt(deer.x, deer.y))) { deer.hunted = false; p.target = -1; p.state = ST_SEEK; p.timer = 0; break; }
      p.yaw = Math.atan2(deer.y - p.y, deer.x - p.x); p.state = ST_PICK; p.timer = PICK_SECONDS;
      break;
    }
    case ST_PICK:
      p.timer -= dt;
      if (p.timer > 0) break;
      world.deer[p.target].state = DEER_GONE; world.deer[p.target].hunted = false;
      p.target = -1; p.carry = 2; goDeliver(p);
      break;
    case ST_TO_SITE:
      if (!walk(p, dt, speed)) break;
      if (isNear(p, buildingTile(site))) deliver(p); else p.carry = 0;
      p.state = ST_SEEK; p.timer = .3;
      break;
    default:
      p.state = ST_SEEK;
  }
}

function updatePerson(p: Person, dt: number): void {
  if (p.role === ROLE_SETTLER) {
    if (walk(p, dt, WALK_SPEED * settings.walkSpeed)) { p.role = ROLE_RESIDENT; p.state = ST_IDLE; p.timer = 1 + random() * 3; }
  } else if (p.role === ROLE_RESIDENT) {
    if (p.state === ST_STROLL) {
      if (walk(p, dt, WALK_SPEED * settings.walkSpeed * .6)) { p.state = ST_IDLE; p.timer = 2 + random() * 5; }
      return;
    }
    p.timer -= dt;
    if (p.timer > 0) return;
    const home = world.buildings[p.home];
    const t = tileIndex(Math.max(0, Math.min(11, home.i + Math.floor(random() * 5) - 2)), Math.max(0, Math.min(11, home.j + Math.floor(random() * 5) - 2)));
    if (isWalkable(t) && planPath(p, t)) p.state = ST_STROLL; else p.timer = 1 + random() * 2;
  } else updateWorker(p, dt);
}
export function updatePeople(dt: number): void {
  updateSettlers(dt);
  for (const p of world.people) updatePerson(p, dt);
}
export { assignJobs };
