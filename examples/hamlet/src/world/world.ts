import {
  DEFAULT_SIZE, TILE, REFERENCE_AREA, GATE_I, TERRAIN_GRASS, TERRAIN_WATER, TERRAIN_VOID, DEER_START, DEER_GRAZE, DEER_GONE, ROCK_DEPOSIT, LODE_REACH,
} from '../constants';
import { noise } from './noise';
import { terrain, TerrainParams, TerrainLayers, copyTerrainParams } from '../gen/terrain';
import { placeDeposits, DepositRule } from '../gen/deposits';
import { SPECIES, SP_WOLF } from '../rules/species';
import { economy, Resource, Service, Goal, BuildingDef } from './economy';

/** Anything that walks the tile grid. A class, not an interface: the walking code takes a Mover and must change the person itself (interfaces are copied records). */
export class Mover { x: number = 0; y: number = 0; yaw: number = 0; path: number[] = []; step: number = 0; phase: number = 0; }
/** A building: what it holds (`stock`, per resource of economy.json) and what its workers are doing (`state`, and `waitFor`, the resource it lacks). */
export class Building {
  type: number = 0; i: number = 0; j: number = 0; alive: boolean = true; residents: number = 0; workers: number = 0; timer: number = 2;
  happy: number = 60;                                    // houses: how content the people are, 0..100, moving at most 2 a day toward what the house offers (rules/needs.ts)
  level: number = 0; streak: number = 0; fed: number[] = [];   // houses: level, days in a row meeting the next level (+) or failing this one (-), per food days of meals left
  cover: number[] = [];                                  // per service: days left of its coverage (houses only)
  stock: number[] = []; reserved: number[] = []; incoming: number[] = [];   // reserved: leaving with a porter; incoming: promised by one
  fire: number = 0; damage: number = 0; crime: number = 0; burn: number = 0;   // risks (engine/risk.ts): the counters of fire, wear and petty crime, and the days a burning ruin still burns
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
  terrain: number[]; road: number[]; tree: number[]; rock: number[]; deco: number[]; biome: number[]; build: number[]; claimed: number[];
  felledCount: number;              // trees cut so far
  unlimited: boolean;               // no-limit mode: trees and deer come back below a threshold
  treeTimer: number;
  buildings: Building[]; people: Person[]; deer: Deer[];
  pondX: number; pondY: number; pondR: number; offsetX: number; offsetY: number;
  revision: number;                 // bumped when the baked scenery must be redone
  saveDirty: boolean; lastSave: number; autosave: boolean;
  deerTimer: number; waitingForFood: boolean;
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
  priority: number[];               // building types in the order idle residents are given work (rules/labour.ts)
}

/** Progress of a new village: no goal done, every building named by a goal's reward locked (rules/goals.ts). */
export function resetGoals(): void {
  world.goals = economy.goals.map((_g: Goal): number => 0);
  world.unlocked = economy.buildings.map((_d: BuildingDef): number => 1);
  for (const g of economy.goals) for (const k of g.unlock) world.unlocked[k] = 0;
  world.news = []; world.log = []; world.offers = []; world.peddlerLeft = 0; world.expeditions = [];
}
/** A new building of a type on a tile, empty. The rules add buildings the same way (rules/build.ts). */
export function newBuilding(type: number, t: number): number {
  const id = world.buildings.length, b = new Building(), none = (): number[] => economy.resources.map((_r: Resource): number => 0);
  b.type = type; b.i = tileI(t); b.j = tileJ(t); b.fed = none(); b.cover = economy.services.map((_s: Service): number => 0); b.stock = none(); b.reserved = none(); b.incoming = none();
  world.buildings.push(b);
  world.build[t] = id; world.deco[t] = 0;
  return id;
}
/** world.stock: what the stores (every alive building that stores) hold, per resource. What a producer still holds or a porter carries is not counted yet. */
export function recount(): void {
  world.stock = economy.resources.map((_r: Resource): number => 0);
  for (const b of world.buildings) if (b.alive && economy.buildings[b.type].store) for (let k = 0; k < b.stock.length; k++) world.stock[k] += b.stock[k];
}

const zeros = (size: number = DEFAULT_SIZE): number[] => Array.from({ length: size * size }, (): number => 0);
export const world: World = {
  seed: 1, size: DEFAULT_SIZE, half: DEFAULT_SIZE * TILE / 2, gate: Math.floor(DEFAULT_SIZE / 2) * DEFAULT_SIZE, time: 0, tick: 0, rng: 1, jobTimer: 0, stock: [], hasWater: false,
  terrain: zeros(), road: zeros(), tree: zeros(), rock: zeros(), deco: zeros(), biome: zeros(), build: zeros(), claimed: zeros(),
  felledCount: 0, unlimited: false, treeTimer: 0, buildings: [], people: [], deer: [],
  pondX: 0, pondY: 0, pondR: 3, offsetX: 0, offsetY: 0,
  revision: 0, saveDirty: false, lastSave: 0, autosave: true, deerTimer: 0, waitingForFood: false, deerSeq: 0, mood: 70, jobless: 0, appeal: [], goals: [], unlocked: [], progression: false, risks: false, news: [], alerts: [], log: [], offers: [], peddlerLeft: 0, expeditions: [], lode: zeros(), params: new TerrainParams(), difficulty: -1, crime: new Crime(), priority: [],
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

export function spawnDeer(t: number, species: number = 0): Deer {
  let slot = -1;
  for (let k = 0; k < world.deer.length; k++) if (world.deer[k].state === DEER_GONE) { slot = k; break; }
  const deer = new Deer(), sp = SPECIES[species];
  deer.x = tileX(t); deer.y = tileY(t); deer.yaw = random() * 6.28; deer.phase = random() * 6;
  deer.state = DEER_GRAZE; deer.timer = 1 + random() * 3; deer.stag = random() < .4; deer.species = species;
  deer.id = world.deerSeq++; deer.age = sp.adultDays + Math.floor(random() * sp.lifeDays / 2); deer.thirst = random() * sp.drinkEvery;
  const hx = random() - .5, hy = random() - .5 + .01, hl = Math.sqrt(hx * hx + hy * hy);
  deer.hx = hx / hl; deer.hy = hy / hl; deer.yaw = Math.atan2(deer.hy, deer.hx);
  if (slot < 0) world.deer.push(deer); else world.deer[slot] = deer;
  return deer;
}

/** What the village holds at its entrance when it begins: the difficulty's start, or the file's top-level one in a sandbox. */
export function startStock(): number[] {
  const k = world.difficulty;
  return k >= 0 && k < economy.difficulties.length ? economy.difficulties[k].start.slice() : economy.start.slice();
}
/** A new random village: forest, rocks, a pond, flowers and a few deer. */
export function tileCount(): number { return world.size * world.size; }

export function generate(seed: number, size: number = DEFAULT_SIZE, params: TerrainParams = new TerrainParams()): void {
  world.seed = seed; world.size = size; world.half = size * TILE / 2; world.gate = Math.floor(size / 2) * size + GATE_I;
  world.terrain = zeros(size); world.road = zeros(size); world.tree = zeros(size); world.rock = zeros(size); world.deco = zeros(size); world.biome = zeros(size); world.build = zeros(size); world.claimed = zeros(size); world.lode = zeros(size);
  world.seed = seed; world.time = 0; world.tick = 0; world.jobTimer = 0; world.stock = [];
  world.buildings = []; world.people = []; world.crime = new Crime(); world.deer = []; world.felledCount = 0; world.treeTimer = 0;
  world.deerTimer = 0; world.deerSeq = 0; world.mood = 70; world.jobless = 0; world.waitingForFood = false; world.priority = []; world.appeal = zeros(size); resetGoals(); world.lastSave = 0; world.saveDirty = false;
  seedRandom(seed);
  params = copyTerrainParams(params);
  world.params = params;
  params.tile = TILE; params.clearI = GATE_I; params.clearJ = Math.floor(size / 2); params.clearR = 2;
  const layers = terrain(seed, size, size, params);
  world.offsetX = layers.offsetX; world.offsetY = layers.offsetY; world.pondX = layers.pondX; world.pondY = layers.pondY; world.pondR = layers.pondR;
  for (let t = 0; t < size * size; t++) {
    world.build[t] = -1; world.claimed[t] = 0;
    world.terrain[t] = layers.outside[t] === 1 ? TERRAIN_VOID : layers.water[t] === 1 ? TERRAIN_WATER : TERRAIN_GRASS;
    world.tree[t] = layers.forest[t]; world.rock[t] = layers.rock[t]; world.deco[t] = layers.deco[t]; world.biome[t] = layers.biome[t];
  }
  world.road[world.gate] = 1;
  placeLodes(layers);
  if (economy.hall >= 0) {                                    // the village store stands by the entrance, next to the gate road, holding what the village starts with
    const t = world.gate - size;
    world.terrain[t] = TERRAIN_GRASS; world.tree[t] = 0; world.rock[t] = 0; world.lode[t] = 0;
    const id = newBuilding(economy.hall, t);
    world.buildings[id].fixed = true; world.buildings[id].stock = startStock();
  }
  recount();
  world.hasWater = world.terrain.some((v: number): boolean => v === TERRAIN_WATER);
  for (let n = 0; n < Math.round(DEER_START * size * size / REFERENCE_AREA); n++) {
    for (let tries = 0; tries < 30; tries++) {
      const t = Math.floor(random() * size * size);
      if (isOpen(t) && tileI(t) > 3) { spawnDeer(t); break; }
    }
  }
  for (let sp = 1; sp < SPECIES.length; sp++) {                 // the smaller wild species: rabbits on open ground, boar by the trees
    for (let n = 0; n < Math.round(SPECIES[sp].start * size * size / REFERENCE_AREA); n++) {
      for (let tries = 0; tries < 40; tries++) {
        const t = Math.floor(random() * size * size);
        if (isOpen(t) && tileI(t) > 3 && (SPECIES[sp].kind !== 2 || treesAround(t) >= 2)) { spawnDeer(t, sp); break; }
      }
    }
  }
}

/** Scatters the active deposits of the economy over the terrain (gen/deposits.ts): each lands in world.rock as ROCK_DEPOSIT + its kind, with its amount in world.lode. */
function placeLodes(layers: TerrainLayers): void {
  const rules: DepositRule[] = [], kinds: number[] = [];
  for (let k = 0; k < economy.deposits.length; k++) {
  if (params.wolves > 0) spawnPacks(size, params.wolves);
  world.revision++;
}

/** Wolves, only when the village asks (TerrainParams.wolves): in forest country (a share of the land under trees), one pack of three to six on the far side from the gate per 24 x 24 tiles of map. No draw is made without the flag. */
function spawnPacks(size: number, mode: number): void {
  let land = 0, wood = 0;
  for (let t = 0; t < size * size; t++) if (world.terrain[t] === TERRAIN_GRASS) { land++; if (world.tree[t] !== 0) wood++; }
  if (mode < 2 && wood < land * .22) return;
  const packs = Math.max(1, Math.round(size * size / 576));
  for (let n = 0; n < packs; n++) {
    let den = -1;
    for (let tries = 0; tries < 80 && den < 0; tries++) {
      const t = Math.floor(random() * size * size);
      if (isOpen(t) && tileI(t) > size * .45 && treesAround(t) >= 3) den = t;
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
    const d = economy.deposits[k];
    if (!d.active) continue;
    const r = new DepositRule(); r.near = d.near; r.density = d.density; r.required = d.required;
    rules.push(r); kinds.push(k);
  }
  if (rules.length === 0) return;
  const keep: number[] = [];                                    // the entrance stays clear
  for (let t = 0; t < world.size * world.size; t++) if (Math.abs(tileI(t) - tileI(world.gate)) + Math.abs(tileJ(t) - tileJ(world.gate)) <= 2) keep.push(t);
  const placed = placeDeposits(layers, world.seed, rules, keep, world.gate, LODE_REACH);
  for (let t = 0; t < placed.length; t++) if (placed[t] > 0) { const k = kinds[placed[t] - 1]; world.rock[t] = ROCK_DEPOSIT + k; world.lode[t] = economy.deposits[k].amount; world.deco[t] = 0; }
}
