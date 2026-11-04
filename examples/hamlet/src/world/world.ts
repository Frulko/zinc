import {
  DEFAULT_SIZE, TILE, REFERENCE_AREA, GATE_I, TERRAIN_GRASS, TERRAIN_WATER, TERRAIN_VOID, DEER_START, ANIMAL_CAP, DEER_GRAZE, DEER_GONE, ROCK_DEPOSIT, LODE_REACH, MOUNTAIN_LEVEL,
} from '../constants';
import { noise } from './noise';
import { terrain, TerrainParams, TerrainLayers, copyTerrainParams, GEN_CLUSTERED } from '../gen/terrain';
import { placeDeposits, DepositRule } from '../gen/deposits';
import { SPECIES, SP_WOLF } from '../rules/species';
import { economy, Resource, Service, Goal, BuildingDef } from './economy';

/** Anything that walks the tile grid. A class, not an interface: the walking code takes a Mover and must change the person itself (interfaces are copied records). */
export class Mover { x: number = 0; y: number = 0; yaw: number = 0; path: number[] = []; step: number = 0; phase: number = 0; }
/** A building: what it holds (`stock`, per resource of economy.json) and what its workers are doing (`state`, and `waitFor`, the resource it lacks). */
export class Building {
  type: number = 0; i: number = 0; j: number = 0; w: number = 1; h: number = 1; alive: boolean = true; residents: number = 0; workers: number = 0; timer: number = 2;
  happy: number = 60;                                    // houses: how content the people are, 0..100, moving at most 2 a day toward what the house offers (rules/needs.ts)
  level: number = 0; streak: number = 0; fed: number[] = [];   // houses: level, days in a row meeting the next level (+) or failing this one (-), per food days of meals left
  cover: number[] = [];                                  // per service: days left of its coverage (houses only)
  stock: number[] = []; reserved: number[] = []; incoming: number[] = [];   // reserved: leaving with a porter; incoming: promised by one
  fire: number = 0; damage: number = 0; crime: number = 0; burn: number = 0;   // risks (engine/risk.ts): the counters of fire, wear and petty crime, and the days a burning ruin still burns
  turn: number = 0;                                      // service buildings: the junctions its walkers met so far, the rotating choice of the next one (engine/services.ts)
  orders: number[] = [];                                 // stores: per resource ORDER_ACCEPT, ORDER_REFUSE or ORDER_GET (engine/transport.ts); empty: accept everything
  state: number = 0; waitFor: number = -1; fixed: boolean = false;       // fixed: stands from the start (the hall) and cannot be demolished
}
export class Person extends Mover {
  load: number = 0; src: number = -1; dst: number = -1; res: number = -1; want: number = 0;   // a transport: from building src to building dst, `want` units of res promised, `load` in hand
                        // the load in hand (carry: its resource + 1, load: how many) and the building it goes to
  role: number = 0; home: number = -1; job: number = -1; state: number = 0; timer: number = 0; target: number = -1; carry: number = 0; hair: number = 0;
  mood: number = 60; fatigue: number = 0; fun: number = 0; feel: number = 0;   // satisfaction 0..100, tiredness 0..100, days left of the lift a visit to the market or tavern gave, the plain state of rules/needs.ts
  shotX: number = 0; shotY: number = 0;
  rate: number = 0; variant: number = -1;   // the swing's phase speed while working (rules/harvest.ts), and the variant of the source just worked (tree species, doe or stag)
}
/** Public order (engine/crime.ts): the robbers and rioters on the roads (not in `people`: they are no villagers, not counted, not saved), the peace rating 0..100 (daily), the heat of recent crimes and the days of the last robbery and riot. */
export class Crime { outlaws: Person[] = []; peace: number = 100; heat: number = 0; lastRobbery: number = -999; lastRiot: number = -999; caught: number = 0; robbed: number = 0; riots: number = 0; }
/** A risk event for the message log (engine/risk.ts): `kind` fire, collapse, theft, rubble or out, its sentence and the tile it happened on. Not saved. */
export class Alert { kind: string = ''; text: string = ''; tile: number = -1; }
/** One line of the peddler's offer: he `sell`s qty of a resource to the village for `coins`, or `buy`s it from the village. */
export class Offer { resource: number = 0; qty: number = 0; side: string = ''; coins: number = 0; taken: boolean = false; }
/** An expedition under way: the adventure, the days left, and the house each member comes from (members leave the people list while away). */
export class Expedition { adventure: number = 0; left: number = 0; homes: number[] = []; }
/** A decision applied to the village and logged with its tick (rules/commands.ts). */
export class Command { tick: number = 0; kind: string = ''; a: number = 0; b: number = 0; }
/** A wild animal (engine/deer.ts, species in rules/species.ts): `id` is stable while the slot may be reused, `leader` the id of the herd's leader (-1: it leads or is alone), `errand` 1 going to drink. */
export class Deer extends Mover {
  state: number = 0; timer: number = 0; hunted: boolean = false; stag: boolean = false;
  id: number = 0; species: number = 0; age: number = 0; leader: number = -1; thirst: number = 0; moves: number = 0; errand: number = 0; cooldown: number = 0; threatX: number = 0; threatY: number = 0;
  hx: number = 1; hy: number = 0; speed: number = 0; stuck: number = 0; home: number = -1; tx: number = 0; ty: number = 0;   // steering (engine/deer.ts): unit heading, current speed, seconds blocked, home tile (-1: not set yet), the herd or escape goal
  prey: number = -1; hunger: number = 0; aware: number = 0; noted: boolean = false;   // a wolf's quarry (an animal id) and seconds since it ate, the seconds a hunted animal has noticed its hunter, the pack's warning was given
}

/** The whole game state: plain data, no drawing, no side effect at import. */
export interface World {
  seed: number; size: number; half: number; gate: number; time: number; tick: number; rng: number; jobTimer: number; stock: number[]; hasWater: boolean;
  terrain: number[]; height: number[]; road: number[]; tree: number[]; rock: number[]; deco: number[]; biome: number[]; build: number[]; claimed: number[];
  felledCount: number;              // trees cut so far
  unlimited: boolean;               // no-limit mode: trees and deer come back below a threshold
  treeTimer: number;
  buildings: Building[]; people: Person[]; deer: Deer[];
  pondX: number; pondY: number; pondR: number; offsetX: number; offsetY: number;
  revision: number;                 // bumped when the baked scenery must be redone
  netRev: number;                   // bumped when the road network or the buildings on it change (engine/network.ts is rebuilt from it)
  saveDirty: boolean; lastSave: number; autosave: boolean;
  deerTimer: number; waitingForFood: boolean; watch: number; sleepers: number[]; sleeping: number;   // watch: the tile at the middle of the camera (-1: none); sleepers: per region and species the animals asleep as a count (engine/wild.ts), sleeping their total
  deerSeq: number;                  // ids given to wild animals
  mood: number; jobless: number;    // the village's average satisfaction 0..100 and the share of people without work in percent (engine/mood.ts, daily)
  appeal: number[];                 // desirability per tile, recomputed daily (rules/appeal.ts)
  goals: number[];                  // per goal: 1 when done (rules/goals.ts); unlocked: per building type 1 when it may be built
  unlocked: number[]; progression: boolean; risks: boolean; news: string[]; alerts: Alert[]; log: Command[];   // progression: the campaign layers (locked buildings, the peddler, adventures) are on; the new-village flow turns it on, a plain sandbox or a test leaves it off; risks: fire, collapse and theft are on (engine/risk.ts), a choice of the new-village form, on with the campaign; news: lines for the UI to show and clear; log: the commands issued
  expeditions: Expedition[];
  offers: Offer[]; peddlerLeft: number;   // the peddler at the gate: his offers, and the days he still stays (0: not here)
  lode: number[];                   // what is left of the deposit on a tile (world.rock >= ROCK_DEPOSIT)
  params: TerrainParams;            // what the terrain generator was asked for (saved with the village)
  difficulty: number;               // index in economy.difficulties chosen in the new-village form (rules/difficulty.ts); -1: a sandbox, which starts with the top-level `start`
  crime: Crime;                     // robbers, rioters and the peace rating (engine/crime.ts)
  mission: string;                  // the id of the mission this village plays (world/missions.ts), '' in a sandbox
  priority: number[];               // building types in the order idle residents are given work (rules/labour.ts)
}

/** Progress of a new village: no goal done, every building named by a goal's reward locked (rules/goals.ts). */
export function resetGoals(): void {
  world.goals = economy.goals.map((_g: Goal): number => 0);
  world.unlocked = economy.buildings.map((_d: BuildingDef): number => 1);
  if (economy.openAtStart.length > 0) world.unlocked = economy.buildings.map((_d: BuildingDef, k: number): number => economy.openAtStart.indexOf(k) >= 0 ? 1 : 0);   // a mission names what is open at the start
  for (const g of economy.goals) for (const k of g.unlock) world.unlocked[k] = 0;
  world.news = []; world.log = []; world.offers = []; world.peddlerLeft = 0; world.expeditions = [];
}
/** A new building of a type on a tile, empty. The rules add buildings the same way (rules/build.ts). */
export function newBuilding(type: number, t: number, w: number = economy.buildings[type].w, h: number = economy.buildings[type].h): number {
  const id = world.buildings.length, b = new Building(), none = (): number[] => economy.resources.map((_r: Resource): number => 0);
  b.type = type; b.i = tileI(t); b.j = tileJ(t); b.w = w; b.h = h; b.fed = none(); b.cover = economy.services.map((_s: Service): number => 0); b.stock = none(); b.reserved = none(); b.incoming = none();
  world.buildings.push(b);
  claimTiles(id);
  world.netRev++;
  return id;
}
/** The tiles a building stands on, row by row from its top-left tile (b.i, b.j). world.build points to the building from every one of them. */
export function footprint(b: Building): number[] {
  const out: number[] = [];
  for (let dj = 0; dj < b.h; dj++) for (let di = 0; di < b.w; di++) out.push(tileIndex(b.i + di, b.j + dj));
  return out;
}
/** The tiles beside a rectangle of w x h tiles at (i, j), outside it, grouped by direction (+x, -x, +y, -y). A 1 x 1 gives its four neighbours in that order. */
export function rectEdge(i: number, j: number, w: number, h: number): number[] {
  const out: number[] = [];
  for (let d = 0; d < 4; d++) {
    for (let dj = 0; dj < h; dj++) for (let di = 0; di < w; di++) {
      const v = neighbor(tileIndex(i + di, j + dj), d);
      if (v < 0) continue;
      const vi = tileI(v), vj = tileJ(v);
      if (vi >= i && vi < i + w && vj >= j && vj < j + h) continue;      // inside the rectangle
      out.push(v);
    }
  }
  return out;
}
/** Where a building of footprint w x h that covers its present one could stand: the top-left tile, or -1 when the ground around it is not free. The extra tiles must be open and flat on the same level (the
 *  ground it grows into never has a road, a tree or a building); it grows toward +x and +y first, then the other ways. */
export function growSpot(b: Building, w: number, h: number): number {
  const lackI = w - b.w, lackJ = h - b.h;
  if (lackI < 0 || lackJ < 0) return -1;
  for (let oj = 0; oj <= lackJ; oj++) for (let oi = 0; oi <= lackI; oi++) {
    const ai = b.i - oi, aj = b.j - oj;
    if (ai < 0 || aj < 0 || ai + w > world.size || aj + h > world.size) continue;
    let ok = true;
    for (let j = aj; j < aj + h && ok; j++) for (let i = ai; i < ai + w && ok; i++) {
      if (i >= b.i && i < b.i + b.w && j >= b.j && j < b.j + b.h) continue;      // already its own
      const t = tileIndex(i, j);
      ok = isOpen(t) && isFlat(t) && world.height[t] === world.height[tileIndex(b.i, b.j)];
    }
    if (ok) return tileIndex(ai, aj);
  }
  return -1;
}
/** A house takes the bigger footprint at a spot growSpot found, or gives tiles back to the ground when w x h is smaller (it keeps its top-left tile then). */
export function resizeBuilding(id: number, w: number, h: number, anchor: number = -1): void {
  const b = world.buildings[id];
  for (const u of footprint(b)) if (world.build[u] === id) world.build[u] = -1;
  if (anchor >= 0) { b.i = tileI(anchor); b.j = tileJ(anchor); }
  b.w = w; b.h = h;
  claimTiles(id); world.netRev++;
}
/** Points world.build at the building from every tile of its footprint (a new building, or a house that grew). */
export function claimTiles(id: number): void {
  const b = world.buildings[id];
  for (const u of footprint(b)) { world.build[u] = id; world.deco[u] = 0; }
}

/** world.stock: what the stores (every alive building that stores) hold, per resource. What a producer still holds or a porter carries is not counted yet. */
export function recount(): void {
  world.stock = economy.resources.map((_r: Resource): number => 0);
  for (const b of world.buildings) if (b.alive && economy.buildings[b.type].store) for (let k = 0; k < b.stock.length; k++) world.stock[k] += b.stock[k];
}

const zeros = (size: number = DEFAULT_SIZE): number[] => Array.from({ length: size * size }, (): number => 0);
export const world: World = {
  seed: 1, size: DEFAULT_SIZE, half: DEFAULT_SIZE * TILE / 2, gate: Math.floor(DEFAULT_SIZE / 2) * DEFAULT_SIZE, time: 0, tick: 0, rng: 1, jobTimer: 0, stock: [], hasWater: false,
  terrain: zeros(), height: zeros(), road: zeros(), tree: zeros(), rock: zeros(), deco: zeros(), biome: zeros(), build: zeros(), claimed: zeros(),
  felledCount: 0, unlimited: false, treeTimer: 0, buildings: [], people: [], deer: [],
  pondX: 0, pondY: 0, pondR: 3, offsetX: 0, offsetY: 0,
  revision: 0, netRev: 0, saveDirty: false, lastSave: 0, autosave: true, deerTimer: 0, waitingForFood: false, watch: -1, sleepers: [], sleeping: 0, deerSeq: 0, mood: 70, jobless: 0, appeal: [], mission: '', goals: [], unlocked: [], progression: false, risks: false, news: [], alerts: [], log: [], offers: [], peddlerLeft: 0, expeditions: [], lode: zeros(), params: new TerrainParams(), difficulty: -1, crime: new Crime(), priority: [],
};

// ---- tiles ----
export const NEIGHBOR_DI: number[] = [1, -1, 0, 0];
export const NEIGHBOR_DJ: number[] = [0, 0, 1, -1];
export function tileIndex(i: number, j: number): number { return j * world.size + i; }
export function tileI(t: number): number { return t % world.size; }
export function tileJ(t: number): number { return Math.floor(t / world.size); }
export function tileX(t: number): number { return (tileI(t) + .5) * TILE - world.half; }
export function tileY(t: number): number { return (tileJ(t) + .5) * TILE - world.half; }
/** The tile under a world point, or -1 outside the map. */
export function tileAt(x: number, y: number): number {
  const i = Math.floor((x + world.half) / TILE), j = Math.floor((y + world.half) / TILE);
  return i < 0 || j < 0 || i >= world.size || j >= world.size ? -1 : tileIndex(i, j);
}
/** A world point on the playable map: inside the grid and not on the dissolved border. What the views draw stands on such points only. */
export function onMap(x: number, y: number): boolean { const t = tileAt(x, y); return t >= 0 && world.terrain[t] !== TERRAIN_VOID; }
/** The tile next to t in direction d (0:+x 1:-x 2:+y 3:-y), or -1. */
export function neighbor(t: number, d: number): number {
  const i = tileI(t) + NEIGHBOR_DI[d], j = tileJ(t) + NEIGHBOR_DJ[d];
  return i < 0 || j < 0 || i >= world.size || j >= world.size ? -1 : tileIndex(i, j);
}

// ---- random numbers: the game's own, so a seed replays ----
// The generator's state lives in the world (saved, hashed), not in a module global: whoever replays the same ticks gets the same village.
export function seedRandom(seed: number): void { world.rng = Math.imul(seed | 0, -1640531535) >>> 0; }
export function random(): number {
  world.rng = (Math.imul(world.rng | 0, 1664525) + 1013904223) >>> 0;
  return world.rng / 4294967296;
}

/** Below 1 inside the pond: an irregular blob, continuous so the shore is drawn per pixel. */
export function waterField(x: number, y: number): number {
  const dx = (x - world.pondX) * .9, dy = (y - world.pondY) * 1.1;
  return Math.sqrt(dx * dx + dy * dy) / world.pondR + (noise(x * .35 + world.offsetX, y * .35 + world.offsetY) - .5) * .55;
}

/** A tile with a pond tile next to it (4 directions): where a fisher stands. Returns the water tile, or -1. */
export function waterNeighbor(t: number): number {
  for (let d = 0; d < 4; d++) { const v = neighbor(t, d); if (v >= 0 && world.terrain[v] === TERRAIN_WATER) return v; }
  return -1;
}

/** Level of a tile, 0..MAX_HEIGHT (0: flat world, water). */
export function heightAt(t: number): number { return world.height[t]; }
/** A cliff between two adjacent tiles: a drop of two levels or more. Impassable. */
export function isCliff(a: number, b: number): boolean { return Math.abs(world.height[a] - world.height[b]) >= 2; }
/** A land tile with a land neighbour one level apart: passable, not buildable. Water and the border do not count. */
export function isSlope(t: number): boolean {
  for (let d = 0; d < 4; d++) { const v = neighbor(t, d); if (v >= 0 && world.terrain[v] === TERRAIN_GRASS && Math.abs(world.height[v] - world.height[t]) === 1) return true; }
  return false;
}
/** A flat footprint: every land neighbour is on the same level. */
export function isFlat(t: number): boolean {
  for (let d = 0; d < 4; d++) { const v = neighbor(t, d); if (v >= 0 && world.terrain[v] === TERRAIN_GRASS && world.height[v] !== world.height[t]) return false; }
  return true;
}

export function isOpen(t: number): boolean {
  return world.terrain[t] === TERRAIN_GRASS && world.tree[t] === 0 && world.rock[t] === 0 && world.build[t] < 0 && world.road[t] === 0;
}

/** Trees in the 3 x 3 around a tile. */
export function treesAround(t: number): number {
  let n = 0; const i = tileI(t), j = tileJ(t);
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const a = i + di, b = j + dj;
    if (a >= 0 && b >= 0 && a < world.size && b < world.size && world.tree[b * world.size + a] !== 0) n++;
  }
  return n;
}

/** `append`: the caller knows no slot is free (a village being generated), so the search for one is skipped: it made generation quadratic in the animals. */
export function spawnDeer(t: number, species: number = 0, append: boolean = false, rand: () => number = random): Deer {
  let slot = -1;
  if (!append) for (let k = 0; k < world.deer.length; k++) if (world.deer[k].state === DEER_GONE) { slot = k; break; }
  const deer = new Deer(), sp = SPECIES[species];
  deer.x = tileX(t); deer.y = tileY(t); deer.yaw = rand() * 6.28; deer.phase = rand() * 6;
  deer.state = DEER_GRAZE; deer.timer = 1 + rand() * 3; deer.stag = rand() < .4; deer.species = species;
  deer.id = world.deerSeq++; deer.age = sp.adultDays + Math.floor(rand() * sp.lifeDays / 2); deer.thirst = rand() * sp.drinkEvery;
  const hx = rand() - .5, hy = rand() - .5 + .01, hl = Math.sqrt(hx * hx + hy * hy);
  deer.hx = hx / hl; deer.hy = hy / hl; deer.yaw = Math.atan2(deer.hy, deer.hx);
  if (slot < 0) world.deer.push(deer); else world.deer[slot] = deer;
  return deer;
}

/** What the village holds at its entrance when it begins: the difficulty's start, or the file's top-level one in a sandbox. */
export function startStock(): number[] {
  const k = world.difficulty;
  if (economy.startOverride.length > 0) return economy.startOverride.slice();     // a mission's own start
  return k >= 0 && k < economy.difficulties.length ? economy.difficulties[k].start.slice() : economy.start.slice();
}
/** A new random village: forest, rocks, a pond, flowers and a few deer. */
export function tileCount(): number { return world.size * world.size; }

export function generate(seed: number, size: number = DEFAULT_SIZE, params: TerrainParams = new TerrainParams()): void {
  world.seed = seed; world.size = size; world.half = size * TILE / 2; world.gate = Math.floor(size / 2) * size + GATE_I;
  world.terrain = zeros(size); world.height = zeros(size); world.road = zeros(size); world.tree = zeros(size); world.rock = zeros(size); world.deco = zeros(size); world.biome = zeros(size); world.build = zeros(size); world.claimed = zeros(size); world.lode = zeros(size);
  world.seed = seed; world.time = 0; world.tick = 0; world.jobTimer = 0; world.stock = [];
  world.buildings = []; world.people = []; world.crime = new Crime(); world.deer = []; world.felledCount = 0; world.treeTimer = 0;
  world.deerTimer = 0; world.deerSeq = 0; world.sleepers = []; world.sleeping = 0; world.mood = 70; world.jobless = 0; world.waitingForFood = false; world.priority = []; world.appeal = zeros(size); resetGoals(); world.lastSave = 0; world.saveDirty = false;
  seedRandom(seed);
  params = copyTerrainParams(params);
  world.params = params;
  params.tile = TILE; params.clearI = GATE_I; params.clearJ = Math.floor(size / 2); params.clearR = 2;
  const layers = terrain(seed, size, size, params);
  world.offsetX = layers.offsetX; world.offsetY = layers.offsetY; world.pondX = layers.pondX; world.pondY = layers.pondY; world.pondR = layers.pondR;
  for (let t = 0; t < size * size; t++) {
    world.build[t] = -1; world.claimed[t] = 0;
    world.terrain[t] = layers.outside[t] === 1 ? TERRAIN_VOID : layers.water[t] === 1 ? TERRAIN_WATER : TERRAIN_GRASS;
    world.tree[t] = layers.forest[t]; world.rock[t] = layers.rock[t]; world.deco[t] = layers.deco[t]; world.biome[t] = layers.biome[t]; world.height[t] = layers.level[t];
  }
  world.road[world.gate] = 1;
  placeLodes(layers, params.genStyle);
  if (economy.hall >= 0) {                                    // the village store stands by the entrance, next to the gate road, holding what the village starts with
    const t = world.gate - size;                              // the village store is one tile whatever its type's footprint: the first road and the guide start from the gate
    world.terrain[t] = TERRAIN_GRASS; world.tree[t] = 0; world.rock[t] = 0; world.lode[t] = 0;
    const id = newBuilding(economy.hall, t, 1, 1);
    world.buildings[id].fixed = true; world.buildings[id].stock = startStock();
  }
  recount();
  world.hasWater = world.terrain.some((v: number): boolean => v === TERRAIN_WATER);
  let planned = DEER_START;                                     // a big map is not a bigger crowd: the placed animals stop at ANIMAL_CAP (1024 x 1024 asked for 80000 and the steering cost grew with them)
  for (let sp = 1; sp < SPECIES.length; sp++) planned += SPECIES[sp].start;
  const thin = Math.min(1, ANIMAL_CAP * REFERENCE_AREA / (planned * size * size));
  if (params.genStyle === GEN_CLUSTERED) spawnHerds(size, thin);
  else {
  for (let n = 0; n < Math.round(DEER_START * size * size * thin / REFERENCE_AREA); n++) {
    for (let tries = 0; tries < 30; tries++) {
      const t = Math.floor(random() * size * size);
      if (isOpen(t) && tileI(t) > 3) { spawnDeer(t, 0, true); break; }
    }
  }
  for (let sp = 1; sp < SPECIES.length; sp++) {                 // the smaller wild species: rabbits on open ground, boar by the trees
    for (let n = 0; n < Math.round(SPECIES[sp].start * size * size * thin / REFERENCE_AREA); n++) {
      for (let tries = 0; tries < 40; tries++) {
        const t = Math.floor(random() * size * size);
        if (isOpen(t) && tileI(t) > 3 && (SPECIES[sp].kind !== 2 || treesAround(t) >= 2)) { spawnDeer(t, sp, true); break; }
      }
    }
  }
  }
  if (params.wolves > 0) spawnPacks(size, params.wolves, params.genStyle === GEN_CLUSTERED);
  world.revision++; world.netRev++;
}

/** Wolves, only when the village asks (TerrainParams.wolves): in forest country (a share of the land under trees), one pack of three to six on the far side from the gate per 24 x 24 tiles of map. No draw is made without the flag. */
function spawnPacks(size: number, mode: number, clustered: boolean): void {
  let land = 0, wood = 0;
  for (let t = 0; t < size * size; t++) if (world.terrain[t] === TERRAIN_GRASS) { land++; if (world.tree[t] !== 0) wood++; }
  if (mode < 2 && wood < land * .22) return;
  const packs = Math.max(1, Math.round(size * size / 576));
  for (let n = 0; n < packs; n++) {
    let den = -1;
    for (let tries = 0; tries < 80 && den < 0; tries++) {
      const t = Math.floor(random() * size * size);
      if (isOpen(t) && tileI(t) > size * .45 && treesAround(t) >= 3 && (!clustered || (world.height[t] < MOUNTAIN_LEVEL && surroundings(t)[1] >= 8))) den = t;   // a clustered pack dens deep in a wood
    }
    if (den < 0) return;
    const alpha = spawnDeer(den, SP_WOLF), count = 3 + Math.floor(random() * 4);
    alpha.stag = true; alpha.age = SPECIES[SP_WOLF].adultDays + 3; alpha.hunger = random() * 40;
    for (let k = 1; k < count; k++) {
      let spot = -1;
      for (let tries = 0; tries < 20 && spot < 0; tries++) {
        const t = tileIndex(Math.max(0, Math.min(size - 1, tileI(den) + Math.floor(random() * 5) - 2)), Math.max(0, Math.min(size - 1, tileJ(den) + Math.floor(random() * 5) - 2)));
        if (isOpen(t)) spot = t;
      }
      if (spot < 0) continue;
      const w = spawnDeer(spot, SP_WOLF);
      w.leader = alpha.id; w.stag = false; w.hunger = random() * 40;
    }
  }
}

/** Scatters the active deposits of the economy over the terrain (gen/deposits.ts): each lands in world.rock as ROCK_DEPOSIT + its kind, with its amount in world.lode. */
function placeLodes(layers: TerrainLayers, style: number): void {
  const rules: DepositRule[] = [], kinds: number[] = [];
  for (let k = 0; k < economy.deposits.length; k++) {
    const d = economy.deposits[k];
    if (!d.active) continue;
    const r = new DepositRule(); r.near = d.near; r.density = d.density; r.required = d.required;
    rules.push(r); kinds.push(k);
  }
  if (rules.length === 0) return;
  const keep: number[] = [];                                    // the entrance stays clear
  for (let t = 0; t < world.size * world.size; t++) if (Math.abs(tileI(t) - tileI(world.gate)) + Math.abs(tileJ(t) - tileJ(world.gate)) <= 2) keep.push(t);
  const richness: number[] = Array.from({ length: world.size * world.size }, (): number => 0);
  const placed = placeDeposits(layers, world.seed, rules, keep, world.gate, LODE_REACH, style, richness);
  for (let t = 0; t < placed.length; t++) if (placed[t] > 0) { const k = kinds[placed[t] - 1]; world.rock[t] = ROCK_DEPOSIT + k; world.lode[t] = richness[t] > 0 ? Math.max(1, Math.round(economy.deposits[k].amount * richness[t] / 100)) : economy.deposits[k].amount; world.deco[t] = 0; }
}

/** Open ground a herd may stand on (clustered style): free, and below the mountain rock. */
function grazing(t: number): boolean { return isOpen(t) && tileI(t) > 3 && world.height[t] < MOUNTAIN_LEVEL; }
/** What the 5 x 5 around a tile holds: open tiles and trees (the habitat of a herd). */
function surroundings(t: number): number[] {
  let open = 0, trees = 0, flowers = 0;
  const ti = tileI(t), tj = tileJ(t);
  for (let j = tj - 2; j <= tj + 2; j++) for (let i = ti - 2; i <= ti + 2; i++) {
    if (i < 0 || j < 0 || i >= world.size || j >= world.size) continue;
    const u = tileIndex(i, j);
    if (isOpen(u)) open++;
    if (world.tree[u] !== 0) trees++;
    if (world.deco[u] === 1 || world.deco[u] === 2) flowers++;
  }
  return [open, trees, flowers];
}
/** How well a tile suits a herd of a species: deer on meadows at the edge of a wood, rabbits on flowery open ground, boar inside the woods, 0..1. */
function herdHabitat(sp: number, t: number): number {
  const [open, trees, flowers] = surroundings(t);
  const kind = SPECIES[sp].kind;
  if (kind === 2) return Math.min(1, trees / 8);
  if (kind === 1) return Math.min(1, open / 25 * .7 + flowers / 4 * .3) * (trees > 0 ? 1 : .6);
  return Math.min(1, open / 25) * (trees >= 2 ? 1 : .35) * (trees > 12 ? .3 : 1);
}
/**
 * Wild animals in herds (clustered style): per species the same head count as the scatter style, split in herds of the species' `group` size; each herd has a leader (the others
 * follow it from the first tick) and a centre chosen by dart throwing over the habitat, at least 6 tiles from the other centres; the members stand on open ground within three tiles.
 */
function spawnHerds(size: number, thin: number): void {
  const centres: number[] = [];
  for (let sp = 0; sp < SPECIES.length - 1; sp++) {
    const total = Math.round((sp === 0 ? DEER_START : SPECIES[sp].start) * size * size * thin / REFERENCE_AREA), per = Math.max(2, Math.min(SPECIES[sp].group, 6));
    for (let left = total; left > 0; left -= per) {
      let best = -1, bestScore = -1;
      for (let tries = 0; tries < 60; tries++) {
        const t = Math.floor(random() * size * size);
        if (!grazing(t)) continue;
        let apart = true;
        for (const c of centres) if ((tileI(c) - tileI(t)) * (tileI(c) - tileI(t)) + (tileJ(c) - tileJ(t)) * (tileJ(c) - tileJ(t)) < 36) { apart = false; break; }
        const score = herdHabitat(sp, t) * (apart ? 1 : .2);
        if (score > bestScore) { bestScore = score; best = t; }
        if (random() < score) { best = t; break; }
      }
      if (best < 0) break;
      centres.push(best);
      const lead = spawnDeer(best, sp, true), count = Math.min(left, per);
      lead.stag = true;
      for (let m = 1; m < count; m++) {
        for (let tries = 0; tries < 20; tries++) {
          const t = tileIndex(Math.max(0, Math.min(size - 1, tileI(best) + Math.floor(random() * 7) - 3)), Math.max(0, Math.min(size - 1, tileJ(best) + Math.floor(random() * 7) - 3)));
          if (grazing(t)) { const d = spawnDeer(t, sp, true); d.leader = lead.id; d.stag = false; break; }
        }
      }
    }
  }
}
