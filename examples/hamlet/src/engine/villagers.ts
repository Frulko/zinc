import {
  HOUSE, ST_TO_SHORE, ST_FISH, ROLE_SETTLER, ROLE_RESIDENT, ROLE_PEDDLER,
  ST_IDLE, ST_STROLL, ST_GO_WORK, ST_SEEK, ST_TO_TREE, ST_CHOP, ST_TO_SITE, ST_STALK, ST_AIM, ST_SHOT, ST_TO_BODY, ST_PICK, ST_WALK_IN, ST_WORK, ST_FETCH, ST_BRING,
  ST_ROAM, ST_ROAM_BACK, ROAM_REST, ST_TO_LODE, ST_MINE, ROCK_DEPOSIT, BS_IDLE, BS_WORKING, BS_FULL, BS_ISOLATED, AIM_SECONDS, ARROW_SECONDS, SHOOT_RANGE, STALK_CROUCH, WORK_RADIUS, SETTLER_INTERVAL,
  DEER_DEAD, DEER_FLEE, DEER_GONE, WALK_SPEED,
} from '../constants';
import { Housing, BuildingDef, Harvest } from '../world/economy';
import { world, recount, Person, Building, random, tileAt, tileX, tileY, tileIndex, tileI, tileJ, neighbor, waterNeighbor } from '../world/world';
import { fieldFrom, approachTile, pathTo, planPath, walk, isWalkable, isMoving, UNREACHABLE } from './path';
import { sound } from '../audio';
import { emitFx, FX_LEAVES, FX_FELL, FX_CHIPS, FX_SPLASH, LODE_FX, CHIP_SPARK, CHIP_CHAFF, CHIP_SAWDUST, CHIP_FLOUR, CHIP_DUST } from '../world/fx';
import { settings } from '../settings';
import { economy } from '../world/economy';
import { take } from '../rules/stock';
import { resting, workScale } from '../rules/meadow';
import { BLOW_ANGLE, TAU, harvestFor, sourceOf, cycleSeconds, succeeds, depletes, rollUnits, swingRate } from '../rules/harvest';
import { rankOf } from '../rules/labour';
import { capacityOf } from '../rules/housing';
import { startRoam, roamTick } from './services';
import { routine, freeTime } from './routine';
import { arrivalFactor, workPace } from '../rules/needs';
import { findLoad, haulOut, fetchInput, hasRoomFor, readyBatch, exportsOk, pickUp, putDown, cancelTransport } from './transport';

const gap = (ax: number, ay: number, bx: number, by: number): number => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
const buildingTile = (b: Building): number => tileIndex(b.i, b.j);
const tileOf = (p: Person): number => tileAt(p.x, p.y);
const faceTile = (p: Person, t: number): void => { p.yaw = Math.atan2(tileY(t) - p.y, tileX(t) - p.x); };
function isNear(p: Person, t: number): boolean {
  const here = tileOf(p);
  return here >= 0 && Math.abs(tileI(here) - tileI(t)) + Math.abs(tileJ(here) - tileJ(t)) <= 1;
}

/** True when the swing of a worker passed its moment of impact (the axe is down) between two phases: sounds and effects are made on the blow itself. */
const struck = (before: number, after: number): boolean => Math.floor((after * BLOW_ANGLE - Math.PI) / TAU) !== Math.floor((before * BLOW_ANGLE - Math.PI) / TAU);
/** What a workshop throws up at each blow: the building's id, its particles and sound (a farm cuts, a sawmill saws, a forge strikes sparks, a mill dusts flour). */
function workBlow(p: Person, site: Building): void {
  const id = defOf(site).id;   // n: the heading, the view moves the effect in front of the worker
  if (id === 'farm') { emitFx(FX_CHIPS, p.x, p.y, 6, p.yaw, CHIP_CHAFF); sound('whoosh', .3); }
  else if (id === 'sawmill') { emitFx(FX_CHIPS, p.x, p.y, 5, p.yaw, CHIP_SAWDUST); sound('saw', .25); }
  else if (id === 'forge') { emitFx(FX_CHIPS, p.x, p.y, 8, p.yaw, CHIP_SPARK); sound('hammer', .4); }
  else if (id === 'mill') emitFx(FX_CHIPS, p.x, p.y, 5, p.yaw, CHIP_FLOUR);
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
    if (b.residents >= capacityOf(b) || !isConnected(b)) continue;
    b.timer -= dt;
    if (b.timer > 0) continue;
    const needsFood = population() >= housing.free;
    let food = -1;
    for (const k of housing.eats) if (food < 0 && world.stock[k] >= 1) food = k;
    const arrival = arrivalFactor(world.mood);                // an unhappy village draws nobody
    if (arrival === 0) { b.timer = 2; continue; }
    if (needsFood && food < 0) { world.waitingForFood = true; b.timer = 1; continue; }
    const settler = newPerson(ROLE_SETTLER, world.buildings.indexOf(b), world.gate);
    settler.state = ST_WALK_IN;
    if (!planPath(settler, buildingTile(b))) { b.timer = 2; continue; }
    if (needsFood) take(food, 1);
    b.residents++; b.timer = SETTLER_INTERVAL * arrival; world.people.push(settler); world.saveDirty = true;
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
/** A porter who is not carrying anything goes back to being an idle resident, so that a workshop can have him. */
function reclaimPorter(): void {
  for (const p of world.people) {
    if (p.job < 0 || !economy.buildings[world.buildings[p.job].type].store || p.state !== ST_SEEK) continue;
    world.buildings[p.job].workers--;
    p.job = -1; p.role = ROLE_RESIDENT; p.state = ST_IDLE; p.path = []; p.step = 0; p.timer = 1;
    return;
  }
}
function assignJobs(): void {
  for (const b of world.buildings) if (b.alive && b.type !== HOUSE && !economy.buildings[b.type].store) {   // the hint: no road to a store
    if (!exportsOk(b)) b.state = BS_ISOLATED; else if (b.state === BS_ISOLATED) b.state = BS_IDLE;
  }
  let producers = 0, vacancies = 0;
  for (const b of world.buildings) if (b.alive && b.type !== HOUSE && !economy.buildings[b.type].store) { producers++; vacancies += economy.buildings[b.type].workers - b.workers; }
  const order: number[] = world.buildings.map((_b: Building, id: number): number => id);
  order.sort((a: number, b: number): number => rankOf(world.buildings[a].type) - rankOf(world.buildings[b].type) || a - b);   // the player's priority, then the oldest first
  for (let pass = 0; pass < 2; pass++) for (const id of order) {   // producers are staffed first; porters only once something produces and no producer lacks hands
    if (pass === 1 && (producers === 0 || vacancies > 0)) break;
    const site = world.buildings[id];
    if (!site.alive || site.type === HOUSE || economy.buildings[site.type].store !== (pass === 1)) continue;
    const def = economy.buildings[site.type];
    while (site.workers < def.workers) {
      let best: Person | null = null, bestDist = 1e9;
      if (pass === 0) reclaimPorter();                          // a producer lacking hands takes a porter back before it waits for a newcomer
      for (const p of world.people) {
        if (p.role !== ROLE_RESIDENT || p.job >= 0 || (p.state !== ST_IDLE && p.state !== ST_STROLL)) continue;
        const d = gap(p.x, p.y, tileX(buildingTile(site)), tileY(buildingTile(site)));
        if (d < bestDist) { bestDist = d; best = p; }
      }
      if (best === null) break;
      best.role = def.roleId;
      best.job = id; site.workers++; best.state = ST_GO_WORK; if (pass === 0) vacancies--;
      if (!planPath(best, buildingTile(site))) best.timer = 0;
    }
  }
}

/** A workplace was torn down: its workers go back to idling at home. */
export function releaseWorkers(siteId: number): void {
  for (const p of world.people) {
    if (p.job !== siteId) continue;
    releaseClaims(p); cancelTransport(p);
    p.job = -1; p.role = ROLE_RESIDENT; p.carry = 0; p.load = 0; p.state = ST_IDLE; p.path = []; p.step = 0; p.timer = 1;
  }
  world.buildings[siteId].workers = 0;
}
/** Takes `n` people out of the village for an expedition: idle residents first, then workers. Returns the house of each (empty when there are not enough). */
export function takeForExpedition(n: number): number[] {
  const taken: number[] = [];
  for (let pass = 0; pass < 2 && taken.length < n; pass++) {
    for (let k = world.people.length - 1; k >= 0 && taken.length < n; k--) {
      const p = world.people[k];
      if (p.role === ROLE_SETTLER || p.role === ROLE_PEDDLER || (pass === 0 ? p.job >= 0 || p.role !== ROLE_RESIDENT : p.job < 0)) continue;
      releaseClaims(p); cancelTransport(p);
      if (p.job >= 0) world.buildings[p.job].workers--;
      taken.push(p.home); world.people.splice(k, 1);
    }
  }
  return taken;
}
/** Removes one person of a house from the people list without touching its resident count (a member of an expedition after a restore). */
export function dropPerson(houseId: number): void {
  for (let k = 0; k < world.people.length; k++) if (world.people[k].home === houseId && world.people[k].role !== ROLE_PEDDLER) { world.people.splice(k, 1); return; }
}
/** A house lost a level: the people beyond `keep` leave. */
export function evictResidents(houseId: number, keep: number): void {
  const kept: Person[] = [];
  let seen = 0;
  for (const p of world.people) {
    if (p.home !== houseId || seen++ < keep) { kept.push(p); continue; }
    releaseClaims(p); cancelTransport(p);
    if (p.job >= 0) world.buildings[p.job].workers--;
  }
  world.people = kept; world.buildings[houseId].residents = Math.min(world.buildings[houseId].residents, keep);
}
/** A house was torn down: its inhabitants leave. */
export function removeResidents(houseId: number): void {
  const kept: Person[] = [];
  for (const p of world.people) {
    if (p.home !== houseId) { kept.push(p); continue; }
    releaseClaims(p); cancelTransport(p);
    if (p.job >= 0) world.buildings[p.job].workers--;
  }
  world.people = kept;
}

// ---- the daily life of one person: what a worker does is read from the definition of its building (economy.json) ----
const defOf = (site: Building): BuildingDef => economy.buildings[site.type];
const kindOf = (p: Person): string => p.job >= 0 ? defOf(world.buildings[p.job]).gather : '';
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
/** The nearest deposit of kind k that nobody works: a gatherer walks next to it (the tile itself is blocked, like a tree). */
function nearestLode(p: Person, k: number): boolean {
  const field = fieldFrom(tileOf(p));
  let best = -1, bestCost = WORK_RADIUS;
  for (let t = 0; t < world.rock.length; t++) {
    if (world.rock[t] !== ROCK_DEPOSIT + k || world.claimed[t]) continue;
    const ap = approachTile(field, t);
    if (ap >= 0 && field.dist[ap] < bestCost) { bestCost = field.dist[ap]; best = t; }
  }
  if (best < 0) return false;
  p.path = pathTo(field, approachTile(field, best)); p.step = 0;
  world.claimed[best] = 1; p.target = best; p.state = ST_TO_LODE;
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
    if (d.hunted || d.state === DEER_GONE || d.species !== 0) continue;   // only the deer are game
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
/** The first thing a gathered load is: the resource drawn in the hands. */
const firstOutput = (def: BuildingDef): number => { for (let k = 0; k < def.outputs.length; k++) if (def.outputs[k] > 0) return k; return -1; };
function releaseClaims(p: Person): void {
  const kind = kindOf(p);
  if (kind === 'tree' && p.target >= 0 && (p.state === ST_TO_TREE || p.state === ST_CHOP)) world.claimed[p.target] = 0;
  if (kind.slice(0, 8) === 'deposit:' && p.target >= 0 && (p.state === ST_TO_LODE || p.state === ST_MINE)) world.claimed[p.target] = 0;
  if (kind === 'shore' && p.target >= 0 && (p.state === ST_TO_SHORE || p.state === ST_FISH)) world.claimed[p.target] = 0;
  if (kind === 'deer' && p.target >= 0 && p.state >= ST_STALK && p.state <= ST_PICK && p.state !== ST_TO_SITE) world.deer[p.target].hunted = false;
  p.target = -1;
}
/** The gathered load goes to the workplace, which holds it until a porter (or the worker) takes it to a store. The by-products (hides with the game) are rolled now. */
function deliver(p: Person): void {
  const site = world.buildings[p.job], out = defOf(site).outputs;
  for (let k = 0; k < out.length; k++) {
    if (k === p.carry - 1) site.stock[k] += p.load;
    else if (out[k] > 0) { const h = harvestFor(k, p.variant); site.stock[k] += h === null ? out[k] : rollUnits(k, h); }
  }
  p.carry = 0; p.load = 0; world.saveDirty = true;
  sound('point', .3);
}
/** A gathering cycle ended on a source of `variant` (a tree species, a doe or a stag; -1 none): the worker carries what the harvest brought (`ok`: the cycle succeeded) to the workplace. */
function goDeliver(p: Person, variant: number, ok: boolean = true): void {
  const site = world.buildings[p.job], def = defOf(site), src = sourceOf(def), first = src >= 0 ? src : firstOutput(def);
  const h = src >= 0 ? harvestFor(src, variant) : null;
  p.variant = variant; p.carry = first + 1;
  p.load = !ok ? 0 : h === null ? def.outputs[first] : rollUnits(src, h);
  if (p.load <= 0) { p.carry = 0; p.state = ST_SEEK; p.timer = .3; return; }   // nothing came of it: back to the next source
  p.state = ST_TO_SITE;
  if (!planPath(p, buildingTile(site))) { p.carry = 0; p.load = 0; p.state = ST_SEEK; p.timer = 1; }
}
/** The harvest of the building's first raw output for a variant (a harvest that never fails and never ends when it has none). */
const NONE = new Harvest();
function harvestOfSite(def: BuildingDef, variant: number): Harvest { const src = sourceOf(def); return src < 0 ? NONE : harvestFor(src, variant) as Harvest; }
/** Starts a swing: the worker's phase restarts and runs so that the blows of the harvest's time fall evenly (view/actors.ts draws the pose from it). */
function beginSwing(p: Person, seconds: number): void { p.phase = 0; p.rate = swingRate(seconds); }
/** A workshop cycle ends: a raw source (nothing taken in) gets what its harvest rolled, a processor its fixed outputs. */
function produce(site: Building, def: BuildingDef): void {
  const raw = def.inputs.every((n: number): boolean => n === 0), src = raw ? sourceOf(def) : -1;
  const hit = src < 0 || succeeds(harvestFor(src, -1) as Harvest);
  for (let k = 0; k < def.outputs.length; k++) {
    if (def.outputs[k] <= 0) continue;
    const h = raw && hit ? harvestFor(k, -1) : null;
    site.stock[k] += !raw ? def.outputs[k] : !hit ? 0 : h === null ? def.outputs[k] : rollUnits(k, h);
  }
}
function startWork(p: Person, site: Building, def: BuildingDef): boolean {
  if (resting(def)) return false;                            // the hives sleep in winter
  for (let k = 0; k < def.inputs.length; k++) if (site.stock[k] < def.inputs[k]) return false;
  for (let k = 0; k < def.inputs.length; k++) site.stock[k] -= def.inputs[k];
  site.state = BS_WORKING; site.waitFor = -1;
  p.state = ST_WORK; p.timer = cycleSeconds(harvestOfSite(def, -1), def) / workScale(site, def); beginSwing(p, p.timer);
  if (def.startSound !== '') sound(def.startSound, .35);
  return true;
}

function updateWorker(p: Person, dt: number): void {
  dt *= workPace(p);                                         // the discontented and the tired work slower
  const site = world.buildings[p.job], def = defOf(site);
  const speed = WALK_SPEED * settings.walkSpeed;
  switch (p.state) {
    case ST_GO_WORK:
      if (walk(p, dt, speed)) { p.state = ST_SEEK; p.timer = 0; }
      break;
    case ST_SEEK: {
      p.timer -= dt;
      if (p.timer > 0) break;
      let found = false;
      if (def.store) found = findLoad(p);                        // a porter
      else if (!hasRoomFor(site, def.outputs)) { site.state = BS_FULL; found = haulOut(p, p.job); }   // full: the worker carries it to a store itself
      else if (readyBatch(site, def.outputs) && haulOut(p, p.job)) found = true;                       // a batch is ready and no porter came: carry it
      else if (def.service !== null && def.service.walker) found = startRoam(p, site);
      else if (def.lode >= 0) found = nearestLode(p, def.lode);
      else if (def.gather === 'tree') found = nearestTree(p);
      else if (def.gather === 'shore') found = nearestShore(p);
      else if (def.gather === 'deer') found = nearestGame(p);
      else {
        if (site.state === BS_FULL || site.state === BS_ISOLATED) site.state = BS_IDLE;
        found = startWork(p, site, def) || fetchInput(p, p.job);
      }
      if (!found) p.timer = def.store ? 1.5 : 2;
      break;
    }
    case ST_WORK: {
      const before = p.phase;
      p.phase += dt * p.rate;
      if (struck(before, p.phase)) workBlow(p, site);
      p.timer -= dt;
      if (p.timer > 0) break;
      produce(site, def);
      world.saveDirty = true; sound('point', .3);
      site.state = BS_IDLE; p.state = ST_SEEK; p.timer = .2;
      break;
    }
    case ST_ROAM:
      roamTick(p, site);
      if (walk(p, dt, speed)) { p.state = ST_ROAM_BACK; if (!planPath(p, buildingTile(site))) { p.state = ST_SEEK; p.timer = ROAM_REST; } }
      break;
    case ST_ROAM_BACK:
      roamTick(p, site);
      if (walk(p, dt, speed)) { p.state = ST_SEEK; p.timer = ROAM_REST; p.target = -1; }
      break;
    case ST_FETCH:
      if (walk(p, dt, speed)) pickUp(p);
      break;
    case ST_BRING:
      if (walk(p, dt, speed)) putDown(p);
      break;
    case ST_TO_TREE:
      if (!walk(p, dt, speed)) break;
      if (world.tree[p.target] === 0 || !isNear(p, p.target)) { releaseClaims(p); p.state = ST_SEEK; p.timer = 0; break; }
      faceTile(p, p.target); p.state = ST_CHOP; p.timer = cycleSeconds(harvestOfSite(def, world.tree[p.target] - 1), def); beginSwing(p, p.timer);
      break;
    case ST_CHOP: {
      const before = p.phase;
      p.phase += dt * p.rate;
      if (struck(before, p.phase)) { emitFx(FX_LEAVES, tileX(p.target), tileY(p.target), 0, p.target, world.tree[p.target] - 1); sound('chop', .6); }
      p.timer -= dt;
      if (p.timer > 0) break;
      const species = world.tree[p.target] - 1;
      emitFx(FX_FELL, tileX(p.target), tileY(p.target), p.yaw, p.target, species);
      world.tree[p.target] = 0; world.claimed[p.target] = 0; world.felledCount++;
      world.revision++; world.saveDirty = true;
      p.target = -1; goDeliver(p, species, succeeds(harvestOfSite(def, species)));
      break;
    }
    case ST_TO_LODE:
      if (!walk(p, dt, speed)) break;
      if (world.rock[p.target] !== ROCK_DEPOSIT + def.lode || !isNear(p, p.target)) { releaseClaims(p); p.state = ST_SEEK; p.timer = 0; break; }
      faceTile(p, p.target); p.state = ST_MINE; p.timer = cycleSeconds(harvestOfSite(def, -1), def); beginSwing(p, p.timer);
      break;
    case ST_MINE: {
      const before = p.phase;
      p.phase += dt * p.rate;
      if (struck(before, p.phase)) { const fx = LODE_FX[def.lode]; emitFx(FX_CHIPS, tileX(p.target), tileY(p.target), fx.chips, p.target, fx.palette); sound(fx.sound, fx.volume); }
      p.timer -= dt;
      if (p.timer > 0) break;
      const lodeHarvest = harvestOfSite(def, -1), found = succeeds(lodeHarvest);
      if (found && depletes(lodeHarvest)) world.lode[p.target]--;
      if (world.lode[p.target] <= 0) { emitFx(FX_CHIPS, tileX(p.target), tileY(p.target), LODE_FX[def.lode].chips * 3, p.target, LODE_FX[def.lode].dust); world.rock[p.target] = 0; world.lode[p.target] = 0; world.revision++; }   // used up: the tile is free again and the baked scenery redone
      world.claimed[p.target] = 0; world.saveDirty = true;
      p.target = -1; goDeliver(p, -1, found);
      break;
    }
    case ST_TO_SHORE: {
      if (!walk(p, dt, speed)) break;
      const water = waterNeighbor(p.target);
      if (water < 0 || tileOf(p) !== p.target) { releaseClaims(p); p.state = ST_SEEK; p.timer = 0; break; }
      faceTile(p, water); p.state = ST_FISH; p.timer = cycleSeconds(harvestOfSite(def, -1), def); p.phase = 0;
      break;
    }
    case ST_FISH:
      p.phase += dt;
      p.timer -= dt;
      if (p.timer > 0) break;
      if (succeeds(harvestOfSite(def, -1))) {
        world.claimed[p.target] = 0; p.target = -1;
        emitFx(FX_SPLASH, p.x, p.y, p.yaw, p.target);
        sound('fish', .45);
        goDeliver(p, -1);
      } else p.timer = cycleSeconds(harvestOfSite(def, -1), def) * .6;     // nothing bit: the line goes back in
      break;
    case ST_STALK: {
      const deer = world.deer[p.target];
      if (deer.state === DEER_DEAD || deer.state === DEER_GONE || deer.state === DEER_FLEE) { releaseClaims(p); p.state = ST_SEEK; p.timer = 0; break; }   // a deer that bolted is let go
      if (gap(deer.x, deer.y, p.x, p.y) <= SHOOT_RANGE) {
        p.path = []; p.step = 0; p.state = ST_AIM; p.timer = AIM_SECONDS;
        p.yaw = Math.atan2(deer.y - p.y, deer.x - p.x);
        break;
      }
      p.timer -= dt;
      if (walk(p, dt, gap(deer.x, deer.y, p.x, p.y) < STALK_CROUCH ? speed * .55 : speed) || p.timer <= 0) { p.timer = .9; if (!planPath(p, tileAt(deer.x, deer.y))) { releaseClaims(p); p.state = ST_SEEK; p.timer = 1; } }
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
      if (succeeds(harvestOfSite(def, deer.stag ? 1 : 0))) {
        deer.state = DEER_DEAD; deer.path = []; deer.step = 0; deer.timer = 0; deer.errand = 0;
        sound('hit', .6); emitFx(FX_CHIPS, deer.x, deer.y, deer.stag ? 14 : 9, 0, CHIP_DUST);
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
      p.yaw = Math.atan2(deer.y - p.y, deer.x - p.x); p.state = ST_PICK; p.timer = cycleSeconds(harvestOfSite(def, deer.stag ? 1 : 0), def);
      break;
    }
    case ST_PICK: {
      p.timer -= dt;
      if (p.timer > 0) break;
      const game = world.deer[p.target], kind = game.stag ? 1 : 0;
      game.state = DEER_GONE; game.hunted = false;
      p.target = -1; goDeliver(p, kind);
      break;
    }
    case ST_TO_SITE:
      if (!walk(p, dt, speed)) break;
      if (isNear(p, buildingTile(site))) deliver(p); else { p.carry = 0; p.load = 0; }
      p.state = ST_SEEK; p.timer = .3;
      break;
    default:
      p.state = ST_SEEK;
  }
}

function updatePerson(p: Person, dt: number): void {
  if (p.role === ROLE_PEDDLER) return;                       // stands at the gate while his offers last (engine/trade.ts)
  if (p.role !== ROLE_SETTLER && routine(p, dt)) return;     // sleeping, walking home, off to a free-time place
  if (p.role === ROLE_SETTLER) {
    if (walk(p, dt, WALK_SPEED * settings.walkSpeed)) { p.role = ROLE_RESIDENT; p.state = ST_IDLE; p.timer = 1 + random() * 3; }
  } else if (p.role === ROLE_RESIDENT) {
    if (p.state === ST_STROLL) {
      if (walk(p, dt, WALK_SPEED * settings.walkSpeed * .6)) { p.state = ST_IDLE; p.timer = 2 + random() * 5; }
      return;
    }
    p.timer -= dt;
    if (p.timer > 0) return;
    if (freeTime(p)) return;
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

/** A villager is lost (maimed by wolves, far from the houses): his claims, his load and his place at home and at work are given back. */
export function losePerson(p: Person): void {
  releaseClaims(p); cancelTransport(p);
  if (p.job >= 0) world.buildings[p.job].workers--;
  if (p.home >= 0) world.buildings[p.home].residents = Math.max(0, world.buildings[p.home].residents - 1);
  world.people = world.people.filter((q: Person): boolean => q !== p);
}
