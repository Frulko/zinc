// Hamlet at scale, headless: generation time, a dense built city and the simulation step. By hand: ZINC_HEADLESS=1 zinc run [--native] tests/data/hamlet/stress.ts
// Knobs (environment): HAMLET_SIZE (256), HAMLET_SEED (3), HAMLET_PRESET (0 = first), HAMLET_BUILDINGS (1000, houses + workshops), HAMLET_PEOPLE (2000), HAMLET_ANIMALS (1000),
// HAMLET_TICKS (640), HAMLET_GEN_ONLY=1 (stop after the generation). The view side (Cite frame, camera walks) is tests/data/hamlet/stress.sh.
import { env } from 'zinc:sys';
import * as fs from 'zinc:fs';
import { world, generate, tileIndex, spawnDeer, isOpen } from '../../../examples/hamlet/src/world/world';
import { addBuilding } from '../../../examples/hamlet/src/rules/build';
import { stepWorld } from '../../../examples/hamlet/src/engine/simulate';
import { createResident } from '../../../examples/hamlet/src/engine/villagers';
import { buildRoad } from '../../../examples/hamlet/src/rules/roadplan';
import { economy, loadEconomy } from '../../../examples/hamlet/src/world/economy';
import { setStock } from '../../../examples/hamlet/src/rules/stock';
import { assignJobs, updatePeople } from '../../../examples/hamlet/src/engine/villagers';
import { appealSlice } from '../../../examples/hamlet/src/rules/appeal';
import { stepDay } from '../../../examples/hamlet/src/engine/day';
import { updateDeer } from '../../../examples/hamlet/src/engine/deer';
import { updateNature } from '../../../examples/hamlet/src/engine/nature';
import { updateOutlaws } from '../../../examples/hamlet/src/engine/crime';
import { stateHash } from '../../../examples/hamlet/src/world/hash';
import { PRESETS } from '../../../examples/hamlet/src/gen/presets';
import { TerrainParams } from '../../../examples/hamlet/src/gen/terrain';
import { ROLE_NAMES, HOUSE, DAY_TICKS, TERRAIN_GRASS } from '../../../examples/hamlet/src/constants';

const TEXT = fs.readText('examples/hamlet/assets/economy.json');
const ids: string[] = [];
for (let at = TEXT.indexOf('"buildings"'); ;) { at = TEXT.indexOf('"model": "', at); if (at < 0) break; at += 10; ids.push(TEXT.slice(at, TEXT.indexOf('"', at))); }
loadEconomy(TEXT, ids, ROLE_NAMES);
const num = (name: string, d: number): number => env(name) === '' ? d : Number(env(name));
const SIZE = num('HAMLET_SIZE', 256), SEED = num('HAMLET_SEED', 3), BUILDINGS = num('HAMLET_BUILDINGS', 1000), PEOPLE = num('HAMLET_PEOPLE', 2000), ANIMALS = num('HAMLET_ANIMALS', 1000), TICKS = num('HAMLET_TICKS', 640);
const r = (v: number): number => Math.round(v * 100) / 100;
world.autosave = false; world.progression = false;

const params = new TerrainParams(), from = PRESETS[Math.max(0, Math.min(PRESETS.length - 1, num('HAMLET_PRESET', 0)))].params;
params.waterAmount = from.waterAmount; params.river = from.river; params.forestDensity = from.forestDensity; params.rockDensity = from.rockDensity; params.biome = from.biome;
params.coast = from.coast; params.outcrop = from.outcrop; params.flowers = from.flowers; params.biomes = from.biomes; params.wolves = from.wolves; params.relief = from.relief;
const g0 = performance.now();
generate(SEED, SIZE, params);
const genMs = performance.now() - g0;
let trees = 0, rocks = 0, lodes = 0, water = 0;
for (let t = 0; t < SIZE * SIZE; t++) { if (world.tree[t] > 0) trees++; if (world.rock[t] > 0) rocks++; if (world.lode[t] > 0) lodes++; if (world.terrain[t] !== TERRAIN_GRASS) water++; }
console.log('stress gen: size ' + SIZE + ' ' + r(genMs) + ' ms, trees ' + trees + ' rocks ' + rocks + ' lodes ' + lodes + ' non-grass ' + water + ' animals ' + world.deer.length + ' hash ' + stateHash());
if (env('HAMLET_GEN_ONLY') === '1') { } else {
  for (let k = 0; k < economy.resources.length; k++) setStock(k, 400);
  // a street grid over the whole map (an avenue every 4 rows and every 8 columns), houses and workshops on both sides until the quota is met
  const gi = world.gate % SIZE, roads: number[] = [];
  for (let j = 4; j < SIZE - 4; j += 4) for (let i = 4; i < SIZE - 4; i++) roads.push(tileIndex(i, j));
  for (let i = 4; i < SIZE - 4; i += 8) for (let j = 4; j < SIZE - 4; j++) if (j % 4 !== 0) roads.push(tileIndex(i, j));
  const usable: number[] = [];
  for (const t of roads) if (isOpen(t) || world.tree[t] > 0 || world.rock[t] > 0) { world.tree[t] = 0; world.rock[t] = 0; usable.push(t); }
  const b0 = performance.now();
  buildRoad(usable);
  const roadMs = performance.now() - b0;
  const works = ['lumberhut', 'sawmill', 'farm', 'mill', 'bakery', 'market', 'well', 'fishery', 'lodge', 'smokehouse'];
  let people = 0, n = 0;
  const b1 = performance.now();
  for (let j = 4; j < SIZE - 4 && n < BUILDINGS; j += 4) for (let i = 5; i < SIZE - 5 && n < BUILDINGS; i++) {
    for (const dj of [1, -1]) {
      const t = tileIndex(i, j + dj);
      if (n >= BUILDINGS || !isOpen(t) || world.road[t] || world.build[t] >= 0 || i % 8 === 0) continue;
      world.tree[t] = 0;
      if (n % 5 === 4) { addBuilding(economy.typeOf(works[Math.floor(n / 5) % works.length]), t); n++; continue; }
      const id = addBuilding(HOUSE, t);
      if (id < 0) continue;
      let live = 0; world.buildings[id].residents = 0;
      while (live < 4 && people < PEOPLE) { createResident(id); live++; people++; world.buildings[id].residents++; }
      n++;
    }
  }
  const buildMs = performance.now() - b1;
  world.deer.length = 0; world.deerSeq = 0;
  let animals = 0;
  for (let tries = 0; animals < ANIMALS && tries < ANIMALS * 40; tries++) { const t = Math.floor(((tries * 2654435761) % 4294967296) % (SIZE * SIZE)); if (isOpen(t) && world.road[t] === 0) { spawnDeer(t, animals % 9 === 0 ? 1 : 0); animals++; } }
  world.revision++;
  console.log('stress city: roads ' + usable.length + ' (' + r(roadMs) + ' ms) buildings ' + world.buildings.length + ' (' + r(buildMs) + ' ms) people ' + world.people.length + ' animals ' + world.deer.length + ' gate col ' + gi);
  const times: number[] = [], parts: number[] = [0, 0, 0, 0, 0], names = ['jobs', 'day', 'people', 'deer', 'nature'], SPLIT = env('HAMLET_SPLIT') === '1';
  const worst: number[] = [0, 0, 0, 0, 0];
  const part = (k: number, f: () => void): void => { const a = performance.now(); f(); const d = performance.now() - a; parts[k] += d; if (d > worst[k]) worst[k] = d; };
  const splitStep = (): void => {                                        // stepWorld by hand, each part timed (HAMLET_SPLIT=1): the same calls in the same order
    world.tick++; world.time += 1 / 32; world.jobTimer -= 1 / 32;
    if (world.jobTimer <= 0) { world.jobTimer = 1; part(0, assignJobs); }
    const inDay = world.tick % DAY_TICKS;
    if (inDay >= DAY_TICKS - 32) part(1, (): void => appealSlice(inDay - (DAY_TICKS - 32), 32));
    if (inDay === 0) part(1, stepDay);
    part(2, (): void => updatePeople(1 / 32)); updateOutlaws(1 / 32); part(3, (): void => updateDeer(1 / 32)); part(4, (): void => updateNature(1 / 32));
  };
  for (let k = 0; k < TICKS; k++) { const a = performance.now(); if (SPLIT) splitStep(); else stepWorld(); const dt = performance.now() - a; times.push(dt); if (dt > 30 && env('HAMLET_SLOW') === '1') console.log('stress slow tick ' + world.tick + ' (day tick ' + (world.tick % DAY_TICKS) + ') ' + r(dt) + ' ms'); }
  if (SPLIT) console.log('stress split ms/tick: ' + names.map((n: string, k: number): string => n + ' ' + r(parts[k] / TICKS)).join(' ') + ' | worst ' + names.map((n: string, k: number): string => n + ' ' + r(worst[k])).join(' '));
  const s = times.slice().sort((a: number, b: number): number => a - b), at = (q: number): number => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  let sum = 0; for (const t of times) sum += t;
  console.log('stress step ms: mean ' + r(sum / TICKS) + ' p50 ' + r(at(.5)) + ' p95 ' + r(at(.95)) + ' p99 ' + r(at(.99)) + ' max ' + r(s[s.length - 1]) + ' (' + TICKS + ' ticks, ' + r(TICKS / DAY_TICKS) + ' days) people ' + world.people.length + ' animals ' + world.deer.length + ' hash ' + stateHash());
}
