// Hamlet simulation cost: a big village (HAMLET_SIZE, HAMLET_PEOPLE, HAMLET_ANIMALS) stepped headless, ms per stepWorld on this engine. By hand: ZINC_HEADLESS=1 zinc run tests/data/hamlet/perf.ts
import { env } from 'zinc:sys';
import * as fs from 'zinc:fs';
import { world, generate, tileIndex, spawnDeer, isOpen } from '../../../examples/hamlet/src/world/world';
import { addBuilding } from '../../../examples/hamlet/src/rules/build';
import { stepWorld } from '../../../examples/hamlet/src/engine/simulate';
import { createResident, assignJobs, updatePeople } from '../../../examples/hamlet/src/engine/villagers';
import { buildRoad } from '../../../examples/hamlet/src/rules/roadplan';
import { economy, loadEconomy } from '../../../examples/hamlet/src/world/economy';
import { setStock } from '../../../examples/hamlet/src/rules/stock';
import { appealSlice } from '../../../examples/hamlet/src/rules/appeal';
import { stepDay } from '../../../examples/hamlet/src/engine/day';
import { updateDeer } from '../../../examples/hamlet/src/engine/deer';
import { updateNature } from '../../../examples/hamlet/src/engine/nature';
import { updateOutlaws } from '../../../examples/hamlet/src/engine/crime';
import { stateHash } from '../../../examples/hamlet/src/world/hash';
import { TerrainParams } from '../../../examples/hamlet/src/gen/terrain';
import { ROLE_NAMES, HOUSE, DAY_TICKS } from '../../../examples/hamlet/src/constants';

const TEXT = fs.readText('examples/hamlet/assets/economy.json');
const ids: string[] = [];
for (let at = TEXT.indexOf('"buildings"'); ;) { at = TEXT.indexOf('"model": "', at); if (at < 0) break; at += 10; ids.push(TEXT.slice(at, TEXT.indexOf('"', at))); }
loadEconomy(TEXT, ids, ROLE_NAMES);
const num = (name: string, d: number): number => env(name) === '' ? d : Number(env(name));
const SIZE = num('HAMLET_SIZE', 128), PEOPLE = num('HAMLET_PEOPLE', 500), ANIMALS = num('HAMLET_ANIMALS', 300), TICKS = num('HAMLET_TICKS', 1280);
world.autosave = false; world.progression = false;
const params = new TerrainParams(); params.biomes = 0;
generate(11, SIZE, params);
for (let k = 0; k < economy.resources.length; k++) setStock(k, 400);
const half = Math.floor(SIZE / 2), gi = world.gate % SIZE;
// a street grid from the gate: avenues every 4 rows, houses and workshops on both sides
const roads: number[] = [];
for (let j = half - 20; j <= half + 20; j += 4) for (let i = gi; i < Math.min(SIZE - 2, gi + 60); i++) roads.push(tileIndex(i, j));
for (let j = half - 20; j <= half + 20; j++) roads.push(tileIndex(gi, j), tileIndex(gi + 30, j));
for (const t of roads) { world.tree[t] = 0; world.rock[t] = 0; }
buildRoad(roads);
let people = 0, n = 0;
const works = ['lumberhut', 'sawmill', 'farm', 'mill', 'bakery', 'market', 'well', 'fishery', 'lodge', 'smokehouse'];
for (let j = half - 20; j <= half + 20 && people < PEOPLE; j += 4) for (let i = gi + 2; i < Math.min(SIZE - 3, gi + 60) && people < PEOPLE; i++) {
  for (const dj of [1, -1]) {
    const t = tileIndex(i, j + dj);
    if (!isOpen(t) || world.road[t] || world.build[t] >= 0) continue;
    world.tree[t] = 0;
    if (n % 7 === 6) { addBuilding(economy.typeOf(works[Math.floor(n / 7) % works.length]), t); n++; continue; }
    const id = addBuilding(HOUSE, t); world.buildings[id].residents = 4; for (let k = 0; k < 4; k++) createResident(id); people += 4; n++;
  }
}
world.deer.length = 0; world.deerSeq = 0;
let animals = 0;
for (let tries = 0; animals < ANIMALS && tries < 20000; tries++) { const t = Math.floor(((tries * 2654435761) % 4294967296) % (SIZE * SIZE)); if (isOpen(t)) { spawnDeer(t, animals % 9 === 0 ? 1 : 0); animals++; } }
world.revision++;
console.log('perf setup: size ' + SIZE + ' people ' + world.people.length + ' buildings ' + world.buildings.length + ' animals ' + world.deer.length);
const times: number[] = [];
const SPLIT = env('HAMLET_SPLIT') === '1', parts: number[] = [0, 0, 0, 0, 0], names = ['jobs', 'day', 'people', 'deer', 'nature'];
const last: number[] = [0, 0, 0, 0, 0];
const part = (k: number, f: () => void): void => { const a = performance.now(); f(); const d = performance.now() - a; parts[k] += d; last[k] = d; };
function splitStep(): void {
  for (let k = 0; k < 5; k++) last[k] = 0;
  world.tick++; world.time += 1 / 32; world.jobTimer -= 1 / 32;
  if (world.jobTimer <= 0) { world.jobTimer = 1; part(0, assignJobs); }
  const inDay = world.tick % DAY_TICKS;
  if (inDay >= DAY_TICKS - 32) part(1, () => appealSlice(inDay - (DAY_TICKS - 32), 32));
  if (inDay === 0) part(1, stepDay);
  part(2, () => updatePeople(1 / 32)); updateOutlaws(1 / 32); part(3, () => updateDeer(1 / 32)); part(4, () => updateNature(1 / 32));
}
if (env('HAMLET_WARM') === '1') { const a = performance.now(); updateDeer(1 / 32); const b = performance.now(); updateDeer(1 / 32); console.log('deer first ' + (b - a) + ' second ' + (performance.now() - b)); }
let worst = 0, worstTick = 0;
for (let k = 0; k < TICKS; k++) { const a = performance.now(); if (SPLIT) splitStep(); else stepWorld(); const dt = performance.now() - a; times.push(dt); if (dt > 8 && env('HAMLET_SLOW') === '1') console.log('slow tick ' + world.tick + ' [' + last.map((v: number): string => String(Math.round(v * 10) / 10)).join(' ') + '] ' + Math.round(dt * 10) / 10 + ' ms, day tick ' + (world.tick % DAY_TICKS)); if (dt > worst) { worst = dt; worstTick = world.tick; } }
console.log('perf slowest tick ' + worstTick + ' (' + Math.round(worst * 10) / 10 + ' ms, day tick ' + (worstTick % DAY_TICKS) + ')');
const sorted = times.slice().sort((a: number, b: number): number => a - b);
let sum = 0; for (const t of times) sum += t;
const r = (v: number): number => Math.round(v * 1000) / 1000;
console.log('perf step ms: mean ' + r(sum / TICKS) + ' median ' + r(sorted[TICKS >> 1]) + ' p99 ' + r(sorted[Math.floor(TICKS * .99)]) + ' max ' + r(sorted[TICKS - 1]) + ' (' + TICKS + ' ticks, ' + Math.round(TICKS / DAY_TICKS * 10) / 10 + ' days)');
if (SPLIT) console.log('perf split ms/tick: ' + names.map((n: string, k: number): string => n + ' ' + r(parts[k] / TICKS)).join(' '));
console.log('perf working ' + world.people.filter((q) => q.job >= 0).length + ' of ' + world.people.length + ' hash ' + stateHash());
