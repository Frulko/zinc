import { env } from 'zinc:sys';
import { world, newBuilding, tileX, tileY, spawnDeer, random, Person } from './world/world';
import { economy } from './world/economy';
import { TERRAIN_GRASS, ST_STROLL } from './constants';
import { act, ui, WIN_NONE } from './ui/state';
import { PRESETS } from './gen/presets';
import { TerrainParams } from './gen/terrain';
import { TICK, TILE } from './constants';
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
  showcase();
  ui.window = WIN_NONE;                                   // a debug start shows the village, not the main menu a saved game would open
  if (v.length > 5 && env('ZINC_HAMLET_VIEW') !== 'cite') jumpTo(v[4] * world.half, v[5] * world.half);
  const at = env('ZINC_HAMLET_CAM');                                    // "i,j,zoom" as for the Cité view: the old view looks at the same tile (its zoom stays the normal one: Cité zoom = 10 * fit.s0 / 22.63 matches it)
  if (at !== '' && env('ZINC_HAMLET_VIEW') !== 'cite') { const c = at.split(',').map((x: string): number => Number(x)); jumpTo(c[0] * TILE - world.half, c[1] * TILE - world.half); }
  if (v.length > 3) world.tick = Math.round(v[3] * MONTH_SECONDS / TICK) + 8;
}

/** ZINC_HAMLET_CROWD="people,animals[,buildings]": a built village for the view benchmarks (roads on a grid, buildings along them, walkers on the roads, herds on the grass). Not a game state. */
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
  const cap = want.length > 2 ? want[2] : 160;      // the third number: how many buildings (over 160 they spread over the whole map)
  const gi = world.gate % n, gj = Math.floor(world.gate / n);
  for (let t = 0; t < n * n && type < cap; t++) {
    const i = t % n, j = Math.floor(t / n);
    if (world.terrain[t] !== TERRAIN_GRASS || world.road[t] !== 0 || world.build[t] >= 0 || i < 2 || j < 2 || i >= n - 2 || j >= n - 2) continue;
    if ((cap > 160 || (Math.abs(i - gi - 30) < 34 && Math.abs(j - gj) < 34)) && (i % 6 === 4 || j % 6 === 4) && (i + j) % 2 === 0 && t !== world.gate - n) { world.tree[t] = 0; world.rock[t] = 0; newBuilding(type % 25, t, 1, 1); type++; }
  }
  const roads: number[] = [];
  for (let t = 0; t < n * n; t++) if (world.road[t] !== 0) roads.push(t);
  for (let k = 0; k < want[0] && roads.length > 0 && world.buildings.length > 0; k++) {   // every walker has a home and a workplace: the simulation indexes world.buildings[p.job]
    const p = new Person(), t = roads[Math.floor(random() * roads.length)];
    p.x = tileX(t) + (random() - .5); p.y = tileY(t) + (random() - .5); p.yaw = random() * 6.28; p.phase = random() * 6; p.role = 1 + (k % 23); p.state = ST_STROLL; p.carry = k % 5 === 0 ? 1 : 0; p.home = k % world.buildings.length; p.job = (k * 7 + 3) % world.buildings.length;
    world.people.push(p);
  }
  if (want.length > 1) { world.deer.length = 0; world.deerSeq = 0; }   // the animals asked for, not those of the generator on top (they made a 20-animal crowd hundreds)
  for (let k = 0; k < (want.length > 1 ? want[1] : 0); k++) {
    for (let tries = 0; tries < 30; tries++) { const t = Math.floor(random() * n * n); if (world.terrain[t] === TERRAIN_GRASS && world.tree[t] === 0 && world.road[t] === 0 && world.build[t] < 0) { spawnDeer(t, k % 4, true); break; } }
  }
  world.revision++;
  act.loaded();
}

/** ZINC_HAMLET_SHOWCASE=1: a street east of the gate with one of each big building on both sides, on flattened ground (pictures of the footprints). Debug only. */
function showcase(): void {
  if (env('ZINC_HAMLET_SHOWCASE') !== '1') return;
  const n = world.size, gi = world.gate % n, gj = Math.floor(world.gate / n);
  const road = gj + 9;
  for (let j = road - 8; j <= Math.min(n - 1, road + 8); j++) for (let i = 2; i < 36; i++) {
    const t = j * n + i;
    if (world.terrain[t] !== TERRAIN_GRASS) continue;
    world.tree[t] = 0; world.rock[t] = 0; world.deco[t] = 0; world.height[t] = 0;
  }
  for (let i = gi; i < 36; i++) world.road[road * n + i] = 1;
  for (let j = gj; j <= road; j++) world.road[j * n + gi] = 1;
  const north: string[] = ['storehouse', 'farm', 'theatre', 'mill', 'chapel'], south: string[] = ['market', 'sawmill', 'tavern', 'house', 'house'];
  let x = 3;
  for (let k = 0; k < north.length; k++) { const t = economy.typeOf(north[k]), d = economy.buildings[t]; newBuilding(t, (road - d.h) * n + x); x += d.w + 1; }
  x = 3;
  for (let k = 0; k < south.length; k++) {
    const t = economy.typeOf(south[k]), d = economy.buildings[t];
    const id = newBuilding(t, (road + 1) * n + x);
    if (k === 4) { world.buildings[id].level = 3; world.buildings[id].w = 2; world.buildings[id].h = 2; for (const u of [(road + 1) * n + x + 1, (road + 2) * n + x, (road + 2) * n + x + 1]) { world.build[u] = id; } }
    if (k === 3) world.buildings[id].level = 1;
    x += (k === 4 ? 2 : d.w) + 1;
  }
  world.netRev++; world.revision++;
}
