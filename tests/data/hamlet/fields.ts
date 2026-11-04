// Headless proof of the distance fields (engine/path.ts roadSpread, planRoad, planFromHub): a spread gives the cost a search from a walker on the road gives, paths follow it, the cache follows the roads. Prints the cost of both ways. No window.
import { roamPreview } from '../../../examples/hamlet/src/engine/services';
import { economy, loadEconomy } from '../../../examples/hamlet/src/world/economy';
import { MODEL_IDS } from '../../../examples/hamlet/src/view/models';
import { ROLE_NAMES } from '../../../examples/hamlet/src/constants';
import * as fs from 'zinc:fs';
import { newBuilding } from '../../../examples/hamlet/src/world/world';
import { world, generate as generateWith, tileIndex, tileX, tileY, Mover } from '../../../examples/hamlet/src/world/world';
import { fieldFrom, roadSpread, planRoad, planFromHub, planPath, approachTile, UNREACHABLE, ESCAPE } from '../../../examples/hamlet/src/engine/path';
import { TerrainParams } from '../../../examples/hamlet/src/gen/terrain';

let failures = 0;
function check(name: string, ok: boolean): void { console.log('hamlet fields: ' + name + (ok ? ' PASS' : ' FAIL')); if (!ok) failures++; }
const SIZE = 256;
const p = new TerrainParams(); p.biomes = 0;
generateWith(3, SIZE, p);
for (let t = 0; t < world.tree.length; t++) { world.tree[t] = 0; world.rock[t] = 0; world.deco[t] = 0; world.height[t] = 0; world.terrain[t] = 0; }
// a street grid: a road every 8 tiles each way
const roads: number[] = [];
for (let j = 8; j < SIZE - 8; j += 8) for (let i = 8; i < SIZE - 8; i++) world.road[tileIndex(i, j)] = 1;
for (let i = 8; i < SIZE - 8; i += 8) for (let j = 8; j < SIZE - 8; j++) world.road[tileIndex(i, j)] = 1;
for (let i = 0; i < 8; i++) world.road[world.gate + i] = 1;        // the gate road joins the grid
for (let t = 0; t < world.road.length; t++) if (world.road[t] !== 0) roads.push(t);
world.netRev++;
const mover = (t: number): Mover => { const m = new Mover(); m.x = tileX(t); m.y = tileY(t); return m; };
const stores = [tileIndex(40, 40), tileIndex(200, 48), tileIndex(48, 200), tileIndex(208, 208), tileIndex(128, 128), tileIndex(88, 168)];
const people: number[] = [];
for (let k = 0; k < 2000; k++) people.push(roads[(k * 7919) % roads.length]);

// the spread equals the search
let same = true;
for (let k = 0; k < 40; k++) {
  const from = people[k * 50], goal = stores[k % stores.length];
  const f = fieldFrom(from, UNREACHABLE, ESCAPE);
  const a = approachTile(f, goal), want = a >= 0 ? f.dist[a] : -1;
  const sp = roadSpread(goal);
  const got = sp !== null && sp.dist[from] < UNREACHABLE ? sp.dist[from] : -1;
  if (Math.abs(want - got) > 1e-6) same = false;
}
check('the cost from a walker on the road to a goal equals the search', same);
// a planned path ends on the goal, each step one tile on a road
let valid = true;
for (let k = 0; k < 30; k++) {
  const from = people[k * 61], goal = stores[k % stores.length];
  const m = mover(from);
  if (!planRoad(m, goal)) { valid = false; continue; }
  let at = from;
  for (const t of m.path) { if (world.road[t] === 0 || Math.abs((t % SIZE) - (at % SIZE)) + Math.abs(Math.floor(t / SIZE) - Math.floor(at / SIZE)) !== 1) valid = false; at = t; }
  if (at !== goal) valid = false;
}
check('planRoad walks road tiles, one step at a time, to the goal', valid);
const g = mover(world.gate);
const okHub = planFromHub(g, world.gate, stores[0]);
check('planFromHub leaves the gate and ends on the goal', okHub && g.path.length > 0 && g.path[g.path.length - 1] === stores[0] && g.path[0] !== world.gate);
const old = mover(world.gate);
planPath(old, stores[0]);
check('the hub path is as long as the search path', old.path.length > 0 && old.path.length === g.path.length);
// the cache follows the roads
const before = roadSpread(stores[4]);
const d0 = before !== null ? before.dist[stores[0]] : -1;
world.road[tileIndex(130, 128)] = 0; world.road[tileIndex(131, 128)] = 0; world.netRev++;
const after = roadSpread(stores[4]);
check('a changed road rebuilds the spread', after !== null && d0 >= 0 && after.dist[tileIndex(131, 128)] >= UNREACHABLE);
// the roamer route preview: the market's next round over roads, without turning its counter
loadEconomy(fs.readText('examples/hamlet/assets/economy.json'), MODEL_IDS, ROLE_NAMES);
const shop = newBuilding(economy.typeOf('market'), tileIndex(20, 9), 1, 1), mb = world.buildings[shop];
const turn0 = mb.turn, route = roamPreview(mb), again = roamPreview(mb);
check('the roamer preview is a round of road tiles that leaves the counter alone', route.length > 1 && route.every((t: number): boolean => world.road[t] !== 0) && mb.turn === turn0 && route.join() === again.join());
// the cost: 2000 walkers each asking which of 6 stores is nearest
let t0 = performance.now(), sum = 0;
for (const from of people) {
  let best = UNREACHABLE;
  for (const goal of stores) { const sp = roadSpread(goal); if (sp !== null && sp.dist[from] < best) best = sp.dist[from]; }
  sum += best;
}
const fast = performance.now() - t0;
t0 = performance.now();
let sum2 = 0;
for (let k = 0; k < 100; k++) {                       // the old way costs a whole search per walker: 100 of the 2000, scaled
  const f = fieldFrom(people[k * 20], UNREACHABLE, ESCAPE);
  let best = UNREACHABLE;
  for (const goal of stores) { const a = approachTile(f, goal); if (a >= 0 && f.dist[a] < best) best = f.dist[a]; }
  sum2 += best;
}
const slow = (performance.now() - t0) * 20;
console.log('hamlet fields: 2000 walkers x 6 stores on 256 x 256: spreads ' + fast.toFixed(1) + ' ms, one search each ' + slow.toFixed(1) + ' ms (scaled from 100); ' + (sum > 0 && sum2 > 0 ? 'ok' : 'bad'));
console.log(failures === 0 ? 'hamlet fields: ALL PASS' : 'hamlet fields: ' + failures + ' FAILED');
