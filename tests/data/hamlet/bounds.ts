// Headless proof that nothing stands, spawns, regrows or walks on the void border or off the grid: trees, rocks, deposits, flowers, buildings, roads, deer, wolves, people, outlaws.
// Many seeds, sizes and presets, then days of simulation (hunting, regrowth, no-limit mode, the peddler, outlaws) and a save round trip. No window. Run from the repository root.
import * as fs from 'zinc:fs';
import { world, generate, tileAt, tileI, tileJ, Mover } from '../../../examples/hamlet/src/world/world';
import { economy, loadEconomy } from '../../../examples/hamlet/src/world/economy';
import { missions, loadMissions, applyMission } from '../../../examples/hamlet/src/world/missions';
import { addBuilding } from '../../../examples/hamlet/src/rules/build';
import { createResident } from '../../../examples/hamlet/src/engine/villagers';
import { setStock } from '../../../examples/hamlet/src/rules/stock';
import { stepWorld } from '../../../examples/hamlet/src/engine/simulate';
import { sendRobber } from '../../../examples/hamlet/src/engine/crime';
import { snapshot, restore } from '../../../examples/hamlet/src/world/save';
import { stateHash } from '../../../examples/hamlet/src/world/hash';
import { PRESETS } from '../../../examples/hamlet/src/gen/presets';
import { copyTerrainParams } from '../../../examples/hamlet/src/gen/terrain';
import { MODEL_IDS } from '../../../examples/hamlet/src/view/models';
import { TERRAIN_GRASS, TERRAIN_VOID, ROLE_NAMES, DEER_GONE, DAY_TICKS, HOUSE } from '../../../examples/hamlet/src/constants';

const ASSETS = 'examples/hamlet/assets/';
const read = (path: string): string => fs.readText(ASSETS + path);
loadEconomy(read('economy.json'), MODEL_IDS, ROLE_NAMES);
loadMissions(read);
world.autosave = false;
let failures = 0, hash = 0;
const bad: string[] = [];

/** Counts what stands on a tile the map does not play: void or off the grid. Trees, rocks, deposits, flowers, roads, buildings, animals, people and outlaws. */
function stray(label: string): number {
  const n = world.size, list: string[] = [];
  const gi = tileI(world.gate), gj = tileJ(world.gate);
  const rim = (t: number): boolean => { const i = t % n, j = Math.floor(t / n); return (i === 0 || j === 0 || i === n - 1 || j === n - 1) && Math.abs(i - gi) + Math.abs(j - gj) > 2; };   // the outermost ring renders half out of the map (the entrance is the exception)
  const out = (t: number): boolean => t < 0 || t >= n * n || world.terrain[t] === TERRAIN_VOID || rim(t);
  for (let t = 0; t < n * n; t++) {
    if (!out(t)) continue;
    if (world.tree[t] !== 0) list.push('tree@' + t);
    if (world.rock[t] !== 0) list.push('rock/deposit@' + t);
    if (world.deco[t] !== 0) list.push('deco@' + t);
    if (world.build[t] >= 0) list.push('building@' + t);
    if (world.road[t] !== 0) list.push('road@' + t);
    if (world.lode[t] !== 0) list.push('lode@' + t);
  }
  const at = (m: Mover, what: string): void => { const t = tileAt(m.x, m.y); if (out(t)) list.push(what + '@' + Math.round(m.x) + ',' + Math.round(m.y)); };
  for (const d of world.deer) if (d.state !== DEER_GONE) at(d, 'animal' + d.species);
  for (const p of world.people) at(p, 'person' + p.role);
  for (const p of world.crime.outlaws) at(p, 'outlaw');
  for (const b of world.buildings) if (b.alive && out(b.j * n + b.i)) list.push('building' + b.type);
  if (list.length > 0 && bad.length < 12) bad.push(label + ': ' + list.length + ' stray, e.g. ' + list.slice(0, 4).join(' '));
  return list.length;
}
/** A small built village around the gate (a road, houses, workshops, people), so the days run with real traffic. */
function settle(): void {
  for (const k of ['log', 'plank', 'leather', 'stone', 'tools', 'meat']) if (economy.resourceOf(k) >= 0) setStock(economy.resourceOf(k), 200);
  const gi = tileI(world.gate), gj = tileJ(world.gate), n = world.size;
  const open = (i: number, j: number): number => (i < 0 || j < 0 || i >= n || j >= n) ? -1 : j * n + i;
  for (let i = gi; i < Math.min(n - 1, gi + 9); i++) { const t = open(i, gj); if (t >= 0 && world.terrain[t] === TERRAIN_GRASS) { world.road[t] = 1; world.tree[t] = 0; world.rock[t] = 0; world.lode[t] = 0; } }
  const types = [HOUSE, HOUSE, economy.typeOf('lumberhut'), economy.typeOf('lodge'), economy.typeOf('sawmill')];
  let k = 0;
  for (let i = gi + 1; i < Math.min(n - 1, gi + 9) && k < types.length; i += 2) for (const dj of [-1, 1]) {
    const t = open(i, gj + dj);
    if (k >= types.length || t < 0 || world.terrain[t] !== TERRAIN_GRASS || world.build[t] >= 0) continue;
    world.tree[t] = 0; world.rock[t] = 0; world.lode[t] = 0;
    const id = addBuilding(types[k++], t);
    if (types[k - 1] === HOUSE) { for (let r = 0; r < 2; r++) createResident(id); world.buildings[id].residents = 2; }
  }
}
function days(count: number, label: string): void {
  for (let d = 0; d < count; d++) { for (let k = 0; k < DAY_TICKS; k++) stepWorld(); if (stray(label + ' day ' + (d + 1)) > 0) return; }
}
function scenario(label: string, seed: number, size: number, presetIx: number, daysToRun: number, unlimited: boolean): void {
  generate(seed, size, copyTerrainParams(PRESETS[presetIx].params));
  world.progression = true; world.risks = true; world.unlimited = unlimited;
  const a = stray(label + ' generated');
  if (daysToRun > 0 && a === 0) {
    settle(); sendRobber(0);
    if (unlimited) world.tree.fill(0);                                   // regrowth has the whole map to choose from
    days(daysToRun, label);
  }
  hash = (hash * 31 + (stateHash() >>> 0)) >>> 0;
}

// ---- the generator alone: many seeds, the five sizes, every preset ----
for (const size of [12, 24, 64, 128, 256]) for (let p = 0; p < PRESETS.length; p++) for (let s = 0; s < (size >= 128 ? 1 : 3); s++) {
  const seed = 11 + s * 977 + p * 31;
  scenario(PRESETS[p].label + ' ' + size + ' seed ' + seed, seed, size, p, 0, false);
}
// ---- days of simulation: hunting, wolves, regrowth, the peddler, outlaws ----
for (const size of [12, 24, 64]) for (let p = 0; p < PRESETS.length; p++) scenario('days ' + PRESETS[p].label + ' ' + size, 5 + p, size, p, size === 64 ? 2 : 4, p % 2 === 0);
// ---- the missions (their maps carry relief) ----
for (const m of missions) {
  applyMission(m.id); world.difficulty = m.difficulty; generate(m.seed, m.size, copyTerrainParams(m.params)); world.progression = true; world.risks = m.risks;
  stray('mission ' + m.id); settle(); days(2, 'mission ' + m.id);
}
applyMission('');
// ---- a save that holds stray objects loads clean ----
generate(3, 24, copyTerrainParams(PRESETS[0].params));
let voidTile = -1;
for (let t = 0; t < world.size * world.size && voidTile < 0; t++) if (world.terrain[t] === TERRAIN_VOID) voidTile = t;
world.tree[voidTile] = 2; world.rock[voidTile] = 1; world.deco[voidTile] = 1;
const dirty = snapshot();
generate(1, 24, copyTerrainParams(PRESETS[0].params));
const loaded = restore(dirty), strays = stray('restored save');
function check(name: string, ok: boolean): void { console.log('hamlet bounds: ' + name + (ok ? ' PASS' : ' FAIL')); if (!ok) failures++; }
check('a save with objects on the void loads clean', loaded && strays === 0);
check('nothing stands, spawns, regrows or walks on the void or off the grid', bad.length === 0);
for (const line of bad) console.log('hamlet bounds: ' + line);
console.log('hamlet bounds: hash ' + hash);
console.log(failures === 0 ? 'hamlet bounds: ALL PASS' : 'hamlet bounds: ' + failures + ' FAIL');
