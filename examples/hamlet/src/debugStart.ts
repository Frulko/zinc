import { env } from 'zinc:sys';
import { world, newBuilding, tileX, tileY, spawnDeer, random, Person } from './world/world';
import { economy } from './world/economy';
import { TERRAIN_GRASS, ST_STROLL } from './constants';
import { act } from './ui/state';
import { PRESETS } from './gen/presets';
import { TerrainParams } from './gen/terrain';
import { TICK } from './constants';
import { trace, jumpTo } from './view/scenery';
import { MONTH_SECONDS } from './rules/season';
import { settings } from './settings';

/**
 * For screenshots and tests only: ZINC_START_MONTH=n sets the month of the current village; ZINC_HAMLET_SCRUB=n adds n ticks a frame (a year in seconds); ZINC_HAMLET_TRACE=1 prints the bake times; ZINC_HAMLET_STILL=1 stops the simulation and the pause on move (for comparing pictures). ZINC_HAMLET="seed,size,preset,month,x,y" (x and y optional: the point to look at, as a share of the half-width) starts that village (preset = index in PRESETS, month = 0 March .. 11 February) instead of the saved
 * one. Run it with ZINC_APP_DATA pointing at a scratch folder: the village is saved like any other.
 */
export function debugStart(): void {
  trace.on = env('ZINC_HAMLET_TRACE') === '1';
  trace.scrub = Number(env('ZINC_HAMLET_SCRUB') === '' ? '0' : env('ZINC_HAMLET_SCRUB'));
  if (env('ZINC_HAMLET_STILL') === '1') { settings.simSpeed = 0; settings.pauseOnMove = false; }   // the world stands still and the clock runs on: two runs of one input draw the same pictures
  const text = env('ZINC_HAMLET');
  if (text === '') {
    if (env('ZINC_START_MONTH') !== '') world.tick = Math.round(Number(env('ZINC_START_MONTH')) * MONTH_SECONDS / TICK) + 8;
    return;
  }
  const v = text.split(',').map((s: string): number => Number(s));
  const preset = PRESETS[Math.max(0, Math.min(PRESETS.length - 1, v.length > 2 ? v[2] : 0))];
  const params = new TerrainParams(), from = preset.params;
  params.waterAmount = from.waterAmount; params.river = from.river; params.forestDensity = from.forestDensity; params.rockDensity = from.rockDensity; params.biome = from.biome;
  params.coast = from.coast; params.outcrop = from.outcrop; params.flowers = from.flowers; params.biomes = from.biomes; params.wolves = from.wolves; params.relief = from.relief;
  act.newVillage(v[0], v.length > 1 ? v[1] : 24, false, false, params);
  crowd();
  if (v.length > 5 && env('ZINC_HAMLET_VIEW') !== 'cite') jumpTo(v[4] * world.half, v[5] * world.half);
  if (v.length > 3) world.tick = Math.round(v[3] * MONTH_SECONDS / TICK) + 8;
}

/** ZINC_HAMLET_CROWD="people,animals": a built village for the view benchmarks (roads on a grid, buildings along them, walkers on the roads, herds on the grass). Not a game state. */
function crowd(): void {
  const spec = env('ZINC_HAMLET_CROWD');
  if (spec === '') return;
  const want = spec.split(',').map((x: string): number => Number(x)), n = world.size;
  for (let t = 0; t < n * n; t++) {
    const i = t % n, j = Math.floor(t / n);
    if (world.terrain[t] !== TERRAIN_GRASS || i < 2 || j < 2 || i >= n - 2 || j >= n - 2) continue;
    if (i % 6 === 3 || j % 6 === 3) { world.road[t] = 1; world.tree[t] = 0; world.rock[t] = 0; world.deco[t] = 0; }
  }
  let type = 0;
  const gi = world.gate % n, gj = Math.floor(world.gate / n);
  for (let t = 0; t < n * n && type < 160; t++) {
    const i = t % n, j = Math.floor(t / n);
    if (world.terrain[t] !== TERRAIN_GRASS || world.road[t] !== 0 || world.build[t] >= 0 || i < 2 || j < 2 || i >= n - 2 || j >= n - 2) continue;
    if (Math.abs(i - gi - 30) < 34 && Math.abs(j - gj) < 34 && (i % 6 === 4 || j % 6 === 4) && (i + j) % 2 === 0 && t !== world.gate - n) { world.tree[t] = 0; world.rock[t] = 0; newBuilding(type % 25, t); type++; }
  }
  const roads: number[] = [];
  for (let t = 0; t < n * n; t++) if (world.road[t] !== 0) roads.push(t);
  for (let k = 0; k < want[0] && roads.length > 0; k++) {
    const p = new Person(), t = roads[Math.floor(random() * roads.length)];
    p.x = tileX(t) + (random() - .5); p.y = tileY(t) + (random() - .5); p.yaw = random() * 6.28; p.phase = random() * 6; p.role = 1 + (k % 23); p.state = ST_STROLL; p.carry = k % 5 === 0 ? 1 : 0;
    world.people.push(p);
  }
  for (let k = 0; k < (want.length > 1 ? want[1] : 0); k++) {
    for (let tries = 0; tries < 30; tries++) { const t = Math.floor(random() * n * n); if (world.terrain[t] === TERRAIN_GRASS && world.tree[t] === 0 && world.road[t] === 0 && world.build[t] < 0) { spawnDeer(t, k % 4); break; } }
  }
  world.revision++;
  act.loaded();
}
