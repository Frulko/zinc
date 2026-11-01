// Headless rules of the hamlet: roads, arrivals, jobs, wood, meat, demolition and the save round trip. No window.
import { world, generate, tileIndex, isOpen, waterNeighbor, neighbor } from '../../../examples/hamlet/src/world/world';
import { applyTool, checkTool, addBuilding } from '../../../examples/hamlet/src/rules/build';
import { stepWorld } from '../../../examples/hamlet/src/engine/simulate';
import { updateNature } from '../../../examples/hamlet/src/engine/nature';
import { population, createResident } from '../../../examples/hamlet/src/engine/villagers';
import { seedFromText, parseSeedRequest } from '../../../examples/hamlet/src/world/seed';
import { snapshot, restore } from '../../../examples/hamlet/src/world/save';
import { stateHash } from '../../../examples/hamlet/src/world/hash';
import { TOOL_ROAD, TOOL_HOUSE, TOOL_ERASE, HOUSE, PLACE_NO_WATER, PLACE_OK, PLACE_NO_ROAD, ROLE_LUMBERJACK, ROLE_HUNTER, ROLE_NAMES } from '../../../examples/hamlet/src/constants';
import * as fs from 'zinc:fs';
import { economy, loadEconomy, parseEconomy, chainReport, Economy } from '../../../examples/hamlet/src/world/economy';
import { MODEL_IDS } from '../../../examples/hamlet/src/view/models';
import { toolOf } from '../../../examples/hamlet/src/rules/build';

const ECONOMY_TEXT = fs.readText('examples/hamlet/assets/economy.json');   // the test runs from the repository root
loadEconomy(ECONOMY_TEXT, MODEL_IDS, ROLE_NAMES);
const TOOL_SAWMILL = toolOf('sawmill'), TOOL_LODGE = toolOf('lodge'), TOOL_FISHERY = toolOf('fishery');
const WOOD = economy.resourceOf('wood'), MEAT = economy.resourceOf('meat'), FISH = economy.resourceOf('fish');
let failures = 0;
function check(name: string, ok: boolean): void { console.log('hamlet rules: ' + name + (ok ? ' PASS' : ' FAIL')); if (!ok) failures++; }
function run(seconds: number): void { for (let k = 0; k < seconds * 32; k++) stepWorld(); }

world.autosave = false;
generate(7916, 12);
const at = (i: number, j: number): number => tileIndex(i, j);
for (const t of [at(1, 6), at(2, 6), at(3, 6), at(4, 6), at(5, 6), at(3, 5), at(2, 5), at(4, 7), at(5, 5)]) { world.tree[t] = 0; world.rock[t] = 0; }

check('a house needs a road', checkTool(TOOL_HOUSE, at(3, 5)) === PLACE_NO_ROAD);
for (let i = 1; i <= 5; i++) applyTool(TOOL_ROAD, at(i, 6));
check('a house beside a road is allowed', checkTool(TOOL_HOUSE, at(3, 5)) === PLACE_OK);
const wood = world.stock[WOOD];
applyTool(TOOL_HOUSE, at(3, 5));
check('a house costs wood', world.stock[WOOD] === wood - 5);
run(20);
check('settlers arrive and stay idle', population() === 2 && world.people.length === 2);
applyTool(TOOL_HOUSE, at(2, 5));
run(20);
check('a second house brings two more', population() === 4);
check('idle residents have no job', world.people.every((p) => p.job < 0));
applyTool(TOOL_SAWMILL, at(4, 7));
run(5);
check('the sawmill takes two idle residents', world.people.filter((p) => p.role === ROLE_LUMBERJACK).length === 2);
const before = world.stock[WOOD];
run(90);
check('lumberjacks deliver wood and fell trees', world.stock[WOOD] > before && world.felledCount > 0);
applyTool(TOOL_LODGE, at(5, 5));
run(5);
check('the lodge takes the two others as hunters', world.people.filter((p) => p.role === ROLE_HUNTER).length === 2);
run(300);
check('hunters bring game', world.stock[MEAT] > 0);
world.unlimited = true;
world.tree.fill(0); world.treeTimer = 0;
updateNature(.1);   // called alone: the lumberjacks would cut a new tree as fast as it grows
check('no-limit mode regrows trees below the threshold', world.tree.some((v) => v > 0));
world.unlimited = false; world.treeTimer = 0; const forest = world.tree.filter((v) => v > 0).length;
run(60);
check('normal mode does not regrow', world.tree.filter((v) => v > 0).length <= forest);
world.unlimited = true;
const text = snapshot();
const roads = world.road.filter((v) => v === 1).length;
check('the save restores the same village (trees and mode)', restore(text) && world.unlimited && snapshot() === text && world.road.filter((v) => v === 1).length === roads);
applyTool(TOOL_ERASE, at(3, 5)); applyTool(TOOL_ERASE, at(2, 5));
check('demolishing the houses sends their people away', population() === 0 && world.people.length === 0);
// ---- the fishing hut: needs a pond, then fishers bring fish ----
generate(7916, 12); world.stock[WOOD] = 100;
let shore = -1, inland = -1;
for (let t = 0; t < 144 && (shore < 0 || inland < 0); t++) {
  if (!isOpen(t)) continue;
  if (waterNeighbor(t) >= 0 && shore < 0) shore = t; else if (waterNeighbor(t) < 0 && t > 40 && inland < 0) inland = t;
}
check('the world has a pond', world.hasWater && shore >= 0);
check('a fishing hut needs water', applyTool(TOOL_FISHERY, inland) === PLACE_NO_WATER);
for (let d = 0; d < 4; d++) { const r = neighbor(shore, d); if (r >= 0 && isOpen(r)) { world.road[r] = 1; break; } }
let homeTile = -1;
for (let t = 0; t < 144 && homeTile < 0; t++) if (isOpen(t) && waterNeighbor(t) < 0 && Math.abs(tileIndex(0, 0) - t) > 30) homeTile = t;
const home = addBuilding(HOUSE, homeTile);
createResident(home); createResident(home); world.buildings[home].residents = 2;
check('a fishing hut by the pond is allowed', applyTool(TOOL_FISHERY, shore) === PLACE_OK);
run(120);
check('fishers bring fish', world.stock[FISH] > 0);
// ---- seeds: the same (seed, size) gives the same village; text seeds are hashed; name@size sets the size ----
generate(424242, 24);
const first = world.terrain.join('') + world.tree.join('') + world.rock.join('') + world.deco.join('') + world.deer.length + ':' + world.pondX;
generate(424242, 24);
check('the same seed and size give the same village', world.terrain.join('') + world.tree.join('') + world.rock.join('') + world.deco.join('') + world.deer.length + ':' + world.pondX === first);
generate(424243, 24);
check('another seed gives another village', world.terrain.join('') + world.tree.join('') + world.rock.join('') + world.deco.join('') + world.deer.length + ':' + world.pondX !== first);
check('a text seed is hashed like Java hashCode', seedFromText('hello') === 99162322 && seedFromText('7916') === 7916);
check('name@size sets the size, kept in range', parseSeedRequest('foret@32').size === 32 && parseSeedRequest('x@99').size === 32 && parseSeedRequest('x@3').size === 12 && parseSeedRequest('foret@32').seed === seedFromText('foret'));
check('the default size is 24, the gate is in the middle of the west edge', parseSeedRequest('a').size === 24 && world.gate === 12 * 24 && world.size === 24);
// ---- the economy file: every rule of the validator refuses a file that breaks it, and the chain report names makers and users ----
const bad = (from: string, to: string): string[] => parseEconomy(ECONOMY_TEXT.split(from).join(to), MODEL_IDS, ROLE_NAMES, new Economy());
check('the shipped economy is valid', parseEconomy(ECONOMY_TEXT, MODEL_IDS, ROLE_NAMES, new Economy()).length === 0);
check('an unknown resource is refused', bad('"cost": { "wood": 5 }', '"cost": { "gold": 5 }').join().indexOf('unknown-resource') >= 0);
check('a negative number is refused', bad('"cost": { "wood": 5 }', '"cost": { "wood": -5 }').join().indexOf('negative-number') >= 0);
check('a building without a model is refused', bad('"model": "sawmill", ', '').join().indexOf('no-model') >= 0);
check('a resource with no raw source is refused', bad('"gather": "tree", "outputs": { "wood": 1 }', '"inputs": { "wood": 1 }, "outputs": { "wood": 1 }').join().indexOf('cycle') >= 0);
check('a text that is not JSON is refused', parseEconomy('{', MODEL_IDS, ROLE_NAMES, new Economy())[0].indexOf('bad-json') === 0);
const report = chainReport();
check('the chain report lists makers and users', report.length === economy.resources.length && report[0].indexOf('wood: made by [sawmill] used by [house (cost)') === 0);
for (const line of report) console.log('hamlet chain: ' + line);
// ---- the generic job engine: a processing building fetches its input, works, makes its output; with no input it waits (and does not block) ----
const withWorks = ECONOMY_TEXT.replace('{ "id": "fish", "label": "Poisson", "carry": "fish" }', '{ "id": "fish", "label": "Poisson", "carry": "fish" }, { "id": "plank", "label": "Planches", "carry": "plank" }');
const cut2 = withWorks.lastIndexOf(']');
loadEconomy(withWorks.slice(0, cut2) + ', { "id": "plankworks", "label": "Planches", "model": "plankworks", "cost": { "wood": 4 }, "workers": 2, "role": "lumberjack", "inputs": { "wood": 2 }, "outputs": { "plank": 1 }, "seconds": 3 }' + withWorks.slice(cut2), MODEL_IDS.concat(['plankworks']), ROLE_NAMES);
const PLANK = economy.resourceOf('plank'), WORKS_ID = economy.typeOf('plankworks');
generate(1234, 16);
for (const t of [at(2, 7), at(4, 7), at(5, 9)]) { world.tree[t] = 0; world.rock[t] = 0; }
for (let i = 1; i <= 6; i++) applyTool(TOOL_ROAD, at(i, 8));
applyTool(TOOL_HOUSE, at(2, 7)); applyTool(toolOf('plankworks'), at(5, 9));
world.stock[WOOD] = 0;
run(40);
const works = world.buildings.filter((b) => b.type === WORKS_ID)[0];
check('a building without input waits and says what it lacks', works.workers === 2 && works.state === 2 && works.waitFor === WOOD);
world.stock[WOOD] = 12;
run(60);
check('given input, the workers fetch it and make planks (2 wood -> 1 plank)', world.stock[PLANK] >= 3 && world.stock[WOOD] <= 6);
loadEconomy(ECONOMY_TEXT, MODEL_IDS, ROLE_NAMES);
// ---- determinism: ticks, the generator in the world, the state hash (hamlet.sh compares the printed hash across the three engines) ----
generate(1234, 16); world.stock[WOOD] = 100;
for (let i = 1; i <= 6; i++) applyTool(TOOL_ROAD, tileIndex(i, 8));
applyTool(TOOL_HOUSE, tileIndex(2, 7)); applyTool(TOOL_HOUSE, tileIndex(4, 7)); applyTool(TOOL_SAWMILL, tileIndex(5, 9)); applyTool(TOOL_LODGE, tileIndex(3, 9));
for (let k = 0; k < 600; k++) stepWorld();
check('world.tick counts whole ticks', world.tick === 600 && Math.abs(world.time - 600 / 32) < 1e-6);
const hashed = stateHash();
console.log('hamlet rules: statehash ' + hashed);
const rngBefore = world.rng;
check('the save restores the state hash and the generator', restore(snapshot()) && stateHash() === hashed && world.rng === rngBefore);
console.log(failures === 0 ? 'hamlet rules: ALL PASS' : 'hamlet rules: ' + failures + ' FAIL');
