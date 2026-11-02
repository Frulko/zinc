// Headless rules of the hamlet: roads, arrivals, jobs, wood, meat, demolition and the save round trip. No window.
import { recount, world, generate as generateWith, tileIndex, tileI, tileJ, tileAt, isOpen, waterNeighbor, neighbor } from '../../../examples/hamlet/src/world/world';
import { applyTool, checkTool, addBuilding } from '../../../examples/hamlet/src/rules/build';
import { fxQueue, FX_FELL, FX_LEAVES } from '../../../examples/hamlet/src/world/fx';
import { stepWorld } from '../../../examples/hamlet/src/engine/simulate';
import { updateNature } from '../../../examples/hamlet/src/engine/nature';
import { population, createResident } from '../../../examples/hamlet/src/engine/villagers';
import { seedFromText, parseSeedRequest } from '../../../examples/hamlet/src/world/seed';
import { snapshot, restore } from '../../../examples/hamlet/src/world/save';
import { stateHash } from '../../../examples/hamlet/src/world/hash';
import { TOOL_ROAD, TOOL_HOUSE, TOOL_ERASE, HOUSE, PLACE_NO_WATER, PLACE_OK, PLACE_NO_ROAD, ROLE_LUMBERJACK, ROLE_HUNTER, ROLE_NAMES, ST_TO_SITE, BS_ISOLATED, PLACE_NO_STOCK, PLACE_NO_LODE, PLACE_LOCKED, ROLE_PEDDLER, ROCK_DEPOSIT, LODE_REACH } from '../../../examples/hamlet/src/constants';
import * as fs from 'zinc:fs';
import { parseBiomes } from '../../../examples/hamlet/src/world/biomes';
import { BIOME_IDS, BI_HILLS, BI_PLAIN, BI_MARSH, DECO_REEDS, DECO_TRAIL } from '../../../examples/hamlet/src/gen/terrain';
import { economy, loadEconomy, parseEconomy, chainReport, Economy } from '../../../examples/hamlet/src/world/economy';
// the model ids of view/models.ts (a building's model sits at its own index; the scene checks it against the real list at start-up)
const MODEL_IDS: string[] = ['house', 'sawmill', 'lodge', 'fishery', 'storehouse', 'lumberhut', 'smokehouse', 'farm', 'mill', 'bakery', 'market', 'tannery', 'well', 'quarry', 'claypit', 'mine', 'forge', 'forager', 'apiary', 'chandlery', 'meadery', 'tavern', 'firehouse', 'works', 'watchpost', 'ruin', 'chapel', 'theatre'];
import { dailyRisks, isRuin } from '../../../examples/hamlet/src/engine/risk';
import { dailyCrime, updateOutlaws, sendRobber, computePeace, watchGap, peaceText } from '../../../examples/hamlet/src/engine/crime';
import { BS_NO_SOURCE, BS_OFF_NET } from '../../../examples/hamlet/src/constants';
import { whyIdle } from '../../../examples/hamlet/src/ui/Info';
import { Person, tileY } from '../../../examples/hamlet/src/world/world';
import { ROLE_WATCHMAN, ROLE_RIOTER, ROLE_ROBBER } from '../../../examples/hamlet/src/constants';
import { coverAround } from '../../../examples/hamlet/src/engine/services';
import { houseNeeds, servicesOffered } from '../../../examples/hamlet/src/rules/needs';
import { setStock } from '../../../examples/hamlet/src/rules/stock';
import { stockWithCarried, exportsOk } from '../../../examples/hamlet/src/engine/transport';
import { adviceLine } from '../../../examples/hamlet/src/hud';
import { toolOf } from '../../../examples/hamlet/src/rules/build';
import { harvested, harvestedOf, harvestFor, efficiency, meanUnits, rollUnits, succeeds, blowsOf, swingRate, BLOW_ANGLE, TAU } from '../../../examples/hamlet/src/rules/harvest';
import { ST_CHOP } from '../../../examples/hamlet/src/constants';
import { seedRandom } from '../../../examples/hamlet/src/world/world';
import { housingReport, capacityOf } from '../../../examples/hamlet/src/rules/housing';
import { computeAppeal, appealTiles } from '../../../examples/hamlet/src/rules/appeal';
import { PRESETS } from '../../../examples/hamlet/src/gen/presets';
import { terrain, TerrainParams, TerrainLayers, GEN_CLUSTERED } from '../../../examples/hamlet/src/gen/terrain';
import { issue, replayAt } from '../../../examples/hamlet/src/rules/commands';
import { canStart } from '../../../examples/hamlet/src/rules/adventure';
import { offerLines, canTrade } from '../../../examples/hamlet/src/rules/trade';
import { lockText, scenarioWon } from '../../../examples/hamlet/src/rules/goals';
import { movePriority } from '../../../examples/hamlet/src/rules/labour';
import { flowersAround, resting, workScale, soilAround } from '../../../examples/hamlet/src/rules/meadow';
import { MONTH_SECONDS } from '../../../examples/hamlet/src/rules/season';
import { litBonus } from '../../../examples/hamlet/src/rules/housing';
import { hintText } from '../../../examples/hamlet/src/rules/hints';
import { computeHints } from '../../../examples/hamlet/src/rules/hints';
import { isWalkable } from '../../../examples/hamlet/src/engine/path';
import { buildRoad } from '../../../examples/hamlet/src/rules/roadplan';
import { labourStats, employed } from '../../../examples/hamlet/src/rules/labour';
import { startRoam, dailyServices } from '../../../examples/hamlet/src/engine/services';
import { dailyHousing } from '../../../examples/hamlet/src/engine/housing';
import { setOrder, orderOf } from '../../../examples/hamlet/src/rules/storage';
import { ORDER_REFUSE, ORDER_GET, ORDER_ACCEPT, ROLE_SETTLER, COVER_DAYS } from '../../../examples/hamlet/src/constants';
import { netAt, gateNetwork, onGateNetwork, networkCount } from '../../../examples/hamlet/src/engine/network';
import { dailyAnimals, updateDeer } from '../../../examples/hamlet/src/engine/deer';
import { dailyMood } from '../../../examples/hamlet/src/engine/mood';
import { SPECIES, SP_WOLF, SP_RABBIT } from '../../../examples/hamlet/src/rules/species';
import { Deer, spawnDeer, tileX } from '../../../examples/hamlet/src/world/world';
import { personTarget, feelFrom, thoughtOf, workPace, arrivalFactor, leavingToday, FEEL_ANGRY, FEEL_HOMELESS, FEEL_HUNGRY, FEEL_TIRED, FEEL_JOBLESS, FEEL_CONTENT } from '../../../examples/hamlet/src/rules/needs';
import { DEER_GRAZE, DEER_GONE, DEER_DEAD, DEER_ALERT, DEER_FLEE, DEER_REST, DEER_DRINK, DEER_STALK, DEER_CHASE, DEER_EAT, ST_SLEEP, ST_HOME, DAY_TICKS } from '../../../examples/hamlet/src/constants';

// the rules are proven on one-tile buildings (the layouts below are packed): footprints have their own test, tests/data/hamlet/footprints.ts
const ECONOMY_TEXT = fs.readText('examples/hamlet/assets/economy.json').replace(/"size": \[[0-9, ]+\], ?/g, '');   // the test runs from the repository root
loadEconomy(ECONOMY_TEXT, MODEL_IDS, ROLE_NAMES);
const TOOL_SAWMILL = toolOf('sawmill'), TOOL_LODGE = toolOf('lodge'), TOOL_FISHERY = toolOf('fishery');
const PLANK = economy.resourceOf('plank'), WOOD = economy.resourceOf('log'), MEAT = economy.resourceOf('meat'), FISH = economy.resourceOf('fish');
const rich = (): void => { setStock(WOOD, 100); setStock(PLANK, 100); setStock(economy.resourceOf('leather'), 100); setStock(economy.resourceOf('stone'), 100); setStock(economy.resourceOf('tools'), 100); setStock(economy.resourceOf('clay'), 100); };
let failures = 0;
function check(name: string, ok: boolean): void { console.log('hamlet rules: ' + name + (ok ? ' PASS' : ' FAIL')); if (!ok) failures++; }
/** Lays road from a road tile to the gate's network by the shortest open way (walkers keep to the roads, so a piece of street must be joined to the entrance). */
function linkToGate(from: number): void {
  const prev: number[] = world.terrain.map((): number => -2), q: number[] = [from];
  prev[from] = -1;
  let goal = -1;
  for (let h = 0; h < q.length && goal < 0; h++) {
    const u = q[h];
    if (netAt(u) >= 0 && netAt(u) === gateNetwork()) { goal = u; break; }
    for (let d = 0; d < 4; d++) { const v = neighbor(u, d); if (v >= 0 && prev[v] === -2 && world.terrain[v] === 0 && world.build[v] < 0) { prev[v] = u; q.push(v); } }
  }
  for (let t = goal; t >= 0; t = prev[t]) { world.tree[t] = 0; world.rock[t] = 0; world.lode[t] = 0; if (!world.road[t]) buildRoad([t]); }
}
function run(seconds: number): void { for (let k = 0; k < seconds * 32; k++) stepWorld(); }

world.autosave = false; world.progression = false;   // nothing is locked but in the goals block
/** The rules below were written on the uniform scatter of the first villages (Classique); the biome generator, the default now, has its own checks further down. */
function generate(seed: number, size: number = 24, params: TerrainParams | null = null): void {
  let p = params;
  if (p === null) { p = new TerrainParams(); p.biomes = 0; }
  generateWith(seed, size, p);
}
generate(7916, 12);
const at = (i: number, j: number): number => tileIndex(i, j);
for (const t of [at(1, 6), at(2, 6), at(3, 6), at(4, 6), at(5, 6), at(3, 5), at(2, 5), at(4, 7), at(5, 5)]) { world.tree[t] = 0; world.rock[t] = 0; }
for (const t of [at(7, 8), at(8, 7), at(6, 9), at(5, 8), at(8, 9)]) if (world.terrain[t] === 0 && world.rock[t] === 0) world.tree[t] = 2;   // the ring of the map is border now: the wood this fixture used to find there is planted

check('a house needs a road', checkTool(TOOL_HOUSE, at(3, 5)) === PLACE_NO_ROAD);
for (let i = 1; i <= 5; i++) applyTool(TOOL_ROAD, at(i, 6));
check('a house beside a road is allowed', checkTool(TOOL_HOUSE, at(3, 5)) === PLACE_OK);
const planks = world.stock[PLANK];
applyTool(TOOL_HOUSE, at(3, 5));
check('a house costs planks', world.stock[PLANK] === planks - 3);
run(20);
check('settlers arrive and stay idle', population() === 2 && world.people.length === 2);
applyTool(TOOL_HOUSE, at(2, 5));
run(20);
check('a second house brings two more', population() === 4);
check('idle residents have no job', world.people.every((p) => p.job < 0));
world.tree[at(4, 7)] = 0; world.rock[at(4, 7)] = 0;   // the generator's start guarantee or the growth since may have planted it
applyTool(toolOf('lumberhut'), at(4, 7));
run(5);
check('the hut takes two idle residents', world.people.filter((p) => p.role === ROLE_LUMBERJACK).length === 2);
const before = world.stock[WOOD];
run(90);
check('lumberjacks deliver wood and fell trees', world.stock[WOOD] > before && world.felledCount > 0);
check('felling raises view events (a blow and a fall)', fxQueue.some((e) => e.kind === FX_FELL) || fxQueue.some((e) => e.kind === FX_LEAVES));
rich(); applyTool(TOOL_HOUSE, at(4, 5)); world.tree[at(4, 5)] = 0;
run(20);
applyTool(TOOL_LODGE, at(5, 5));
run(20);
check('the lodge takes the two others as hunters', world.people.filter((p) => p.role === ROLE_HUNTER).length === 2);
run(300);
check('hunters bring game', world.stock[MEAT] > 0);
world.unlimited = true;
world.tree.fill(0); world.treeTimer = 0;
updateNature(.1);   // called alone: the lumberjacks would cut a new tree as fast as it grows
check('no-limit mode regrows trees below the threshold', world.tree.some((v) => v > 0));
world.unlimited = false; world.treeTimer = 0; const forest = world.tree.filter((v) => v > 0).length;
run(60);
check('normal mode regrows slowly: a tree every 4 s at most', world.tree.filter((v) => v > 0).length <= forest + 16);
world.unlimited = true;
const text = snapshot();
const roads = world.road.filter((v) => v === 1).length;
check('the save restores the same village (trees and mode)', restore(text) && world.unlimited && snapshot() === text && world.road.filter((v) => v === 1).length === roads);
applyTool(TOOL_ERASE, at(3, 5)); applyTool(TOOL_ERASE, at(2, 5)); applyTool(TOOL_ERASE, at(4, 5));
check('demolishing the houses sends their people away', population() === 0 && world.people.length === 0);
// ---- the fishing hut: needs a pond, then fishers bring fish ----
generate(7916, 12); rich();
let shore = -1, inland = -1;
for (let t = 0; t < 144 && (shore < 0 || inland < 0); t++) {
  if (!isOpen(t)) continue;
  if (waterNeighbor(t) >= 0 && shore < 0) shore = t; else if (waterNeighbor(t) < 0 && t > 40 && inland < 0) inland = t;
}
check('the world has a pond', world.hasWater && shore >= 0);
check('a fishing hut needs water', applyTool(TOOL_FISHERY, inland) === PLACE_NO_WATER);
for (let d = 0; d < 4; d++) { const r = neighbor(shore, d); if (r >= 0 && isOpen(r)) { world.road[r] = 1; world.netRev++; linkToGate(r); break; } }
let homeTile = -1;
for (let t = 0; t < 144 && homeTile < 0; t++) if (isOpen(t) && waterNeighbor(t) < 0 && Math.abs(tileIndex(0, 0) - t) > 30) homeTile = t;
const home = addBuilding(HOUSE, homeTile);
for (let d = 0; d < 4; d++) { const r = neighbor(homeTile, d); if (r >= 0 && isOpen(r)) { world.road[r] = 1; world.netRev++; linkToGate(r); break; } }   // the house stands on a street that leads to the entrance
createResident(home); createResident(home); world.buildings[home].residents = 2;
for (let d = 0; d < 4; d++) { const r = neighbor(shore, d); if (r >= 0 && world.road[r]) for (let e = 0; e < 4; e++) { const v = neighbor(r, e); if (v >= 0 && v !== shore && isOpen(v) && waterNeighbor(v) < 0) { addBuilding(economy.typeOf('storehouse'), v); break; } } }
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
check('name@size sets the size, kept in range', parseSeedRequest('foret@32').size === 32 && parseSeedRequest('x@999').size === 256 && parseSeedRequest('x@200').size === 200 && parseSeedRequest('x@3').size === 12 && parseSeedRequest('foret@32').seed === seedFromText('foret'));
check('the default size is 24, the gate is in the middle of the west edge', parseSeedRequest('a').size === 24 && world.gate === 12 * 24 && world.size === 24);
// ---- the economy file: every rule of the validator refuses a file that breaks it, and the chain report names makers and users ----
const bad = (from: string, to: string): string[] => parseEconomy(ECONOMY_TEXT.split(from).join(to), MODEL_IDS, ROLE_NAMES, new Economy());
check('the shipped economy is valid', parseEconomy(ECONOMY_TEXT, MODEL_IDS, ROLE_NAMES, new Economy()).length === 0);
check('an unknown resource is refused', bad('"cost": { "plank": 3 }', '"cost": { "gold": 3 }').join().indexOf('unknown-resource') >= 0);
check('a negative number is refused', bad('"cost": { "plank": 3 }', '"cost": { "plank": -3 }').join().indexOf('negative-number') >= 0);
check('a building without a model is refused', bad('"model": "sawmill", ', '').join().indexOf('no-model') >= 0);
check('a resource with no raw source is refused', bad('"gather": "tree", "outputs": { "log": 1 }', '"inputs": { "plank": 1 }, "outputs": { "log": 1 }').join().indexOf('cycle') >= 0);
check('a labour share of 0 or a walker reach of 9 is refused (bad-sim)', bad('"labourShare": 100', '"labourShare": 0').some((e) => e.indexOf('bad-sim') === 0) && bad('"walkerReach": 2', '"walkerReach": 9').some((e) => e.indexOf('bad-sim') === 0));
check('a text that is not JSON is refused', parseEconomy('{', MODEL_IDS, ROLE_NAMES, new Economy())[0].indexOf('bad-json') === 0);
const report = chainReport();
check('the chain report lists makers and users', report.length === economy.resources.length && report[0].indexOf('log: made by [lumberhut] used by [sawmill (input)') === 0);
for (const line of report) console.log('hamlet chain: ' + line);
// ---- the generic job engine: a processing building fetches its input, works, makes its output; with no input it waits (and does not block) ----
const SAWMILL_ID = economy.typeOf('sawmill');
generate(1234, 16);
for (const t of [at(2, 7), at(4, 7), at(5, 9), at(3, 9), at(1, 8), at(2, 8), at(3, 8), at(4, 8), at(5, 8), at(6, 8)]) { world.tree[t] = 0; world.rock[t] = 0; }
for (let i = 1; i <= 6; i++) applyTool(TOOL_ROAD, at(i, 8));
applyTool(TOOL_HOUSE, at(2, 7)); applyTool(TOOL_SAWMILL, at(5, 9));
setStock(WOOD, 0);
run(40);
const works = world.buildings.filter((b) => b.type === SAWMILL_ID)[0];
check('a building without input waits and says what it lacks', works.workers === 2 && works.state === 2 && works.waitFor === WOOD);
setStock(WOOD, 12);
run(60);
check('given input, the workers fetch it and make planks (2 logs -> 1 plank)', world.stock[PLANK] + works.stock[PLANK] >= 3 && world.stock[WOOD] + works.stock[WOOD] <= 6);
// ---- chain 1: from the start stock, a hut, a sawmill and two houses make planks with no other input than building ----
generate(1234, 16);
for (const t of [at(2, 7), at(4, 7), at(5, 9), at(3, 9), at(1, 8), at(2, 8), at(3, 8), at(4, 8), at(5, 8), at(6, 8)]) { world.tree[t] = 0; world.rock[t] = 0; }
buildRoad([1, 2, 3, 4, 5, 6].map((i) => at(i, 8)));
check('the start stock lets the player build the first village', applyTool(TOOL_HOUSE, at(2, 7)) === PLACE_OK && applyTool(TOOL_HOUSE, at(4, 7)) === PLACE_OK && applyTool(toolOf('lumberhut'), at(3, 9)) === PLACE_OK && applyTool(TOOL_SAWMILL, at(5, 9)) === PLACE_OK);
check('the hut is paid in planks and logs', world.stock[PLANK] === economy.start[PLANK] - 10 - 3 && world.stock[WOOD] === economy.start[WOOD] - 2 - 6);
run(150);
console.log('hamlet chain 1: after 150 s from the start stock: ' + world.stock[PLANK] + ' planks, ' + world.stock[WOOD] + ' logs, ' + world.felledCount + ' trees felled');
check('the first chain makes at least 5 planks', world.stock[PLANK] >= 5);
// ---- chain 2: the lodge makes meat and hides, the smokehouse smokes meat (burning a log), houses past the free settlers eat smoked meat ----
const MEAT2 = economy.resourceOf('meat'), SMOKED = economy.resourceOf('smoked_meat'), HIDE = economy.resourceOf('hide');
const clearRow = (): void => { for (const t of [at(2, 7), at(4, 7), at(6, 7), at(5, 9), at(3, 9), at(1, 8), at(2, 8), at(3, 8), at(4, 8), at(5, 8), at(6, 8), at(7, 8)]) { world.tree[t] = 0; world.rock[t] = 0; } for (let i = 1; i <= 7; i++) applyTool(TOOL_ROAD, at(i, 8)); };
generate(1234, 16); rich(); clearRow();
applyTool(TOOL_HOUSE, at(2, 7)); applyTool(TOOL_HOUSE, at(4, 7)); applyTool(TOOL_LODGE, at(3, 9)); applyTool(toolOf('smokehouse'), at(5, 9));
run(20);
applyTool(TOOL_HOUSE, at(6, 7));
run(400);
console.log('hamlet chain 2: after 400 s: ' + population() + ' inhabitants, ' + world.stock[MEAT2] + ' meat, ' + world.stock[SMOKED] + ' smoked meat, ' + world.stock[HIDE] + ' hides');
check('the lodge brings meat and hides', world.stock[MEAT2] + world.stock[SMOKED] > 0 && world.stock[HIDE] > 0);
check('a third house settles beyond the free settlers, fed with smoked meat', population() >= 5);
generate(1234, 16); rich(); clearRow();
applyTool(TOOL_HOUSE, at(2, 7)); applyTool(toolOf('smokehouse'), at(5, 9));
setStock(MEAT2, 10); setStock(WOOD, 0);
run(40);
const smoke = world.buildings.filter((b) => b.alive && b.type === economy.typeOf('smokehouse'))[0];
check('without fuel the smokehouse stops and says what it lacks', smoke.state === 2 && smoke.waitFor === WOOD && adviceLine().indexOf('Il manque : Bois') >= 0 && world.stock[SMOKED] + smoke.stock[SMOKED] === 0);
// ---- chain 3: the farm makes wheat, the mill flour, the bakery bread ----
generate(1234, 16); rich(); clearRow(); world.tree[at(7, 9)] = 0; world.rock[at(7, 9)] = 0;
for (const i of [2, 4, 6]) { const h = addBuilding(HOUSE, at(i, 7)); createResident(h); createResident(h); world.buildings[h].residents = 2; }
applyTool(toolOf('farm'), at(3, 9)); applyTool(toolOf('mill'), at(5, 9)); applyTool(toolOf('bakery'), at(7, 9));
run(300);
const BREAD = economy.resourceOf('bread');
console.log('hamlet chain 3: after 300 s: ' + world.stock[BREAD] + ' bread, ' + world.stock[economy.resourceOf('flour')] + ' flour, ' + world.stock[economy.resourceOf('wheat')] + ' wheat');
check('the farm, the mill and the bakery make bread', world.stock[BREAD] > 0);
console.log('hamlet chain orphans: ' + economy.resources.filter((r, k) => !economy.buildings.some((d) => d.outputs[k] > 0) || !economy.buildings.some((d) => d.inputs[k] > 0 || d.cost[k] > 0 || (d.housing !== null && d.housing.eats.indexOf(k) >= 0))).map((r) => r.id).join(','));
// ---- stores and porters: two producers, one store (the hall): nothing is lost or made twice; a building with no road to a store does not send ----
generate(1234, 16); rich();
for (const t of [at(2, 7), at(4, 7), at(5, 9), at(3, 9), at(1, 8), at(2, 8), at(3, 8), at(4, 8), at(5, 8), at(6, 8), at(12, 12), at(12, 13)]) { world.tree[t] = 0; world.rock[t] = 0; }
for (let i = 1; i <= 6; i++) applyTool(TOOL_ROAD, at(i, 8));
applyTool(TOOL_HOUSE, at(2, 7)); applyTool(TOOL_HOUSE, at(4, 7)); applyTool(toolOf('lumberhut'), at(5, 9)); applyTool(toolOf('lumberhut'), at(3, 9));
world.road[at(12, 12)] = 1; world.revision++; world.netRev++; applyTool(toolOf('lumberhut'), at(12, 13));
const allWood = (): number => {                    // every wood in the village: stores, producers, loads in hand
  let n = 0;
  for (let id = 0; id < world.buildings.length; id++) if (world.buildings[id].alive) n += stockWithCarried(id)[WOOD];
  for (const p of world.people) if (p.carry === WOOD + 1 && p.state === ST_TO_SITE) n += p.load;
  return n;
};
const start = allWood(), felled = world.felledCount, gathered = harvestedOf(WOOD);
run(80);
check('totals are conserved: the wood a harvest rolled is somewhere in the village', allWood() === start + (harvestedOf(WOOD)) - gathered && world.felledCount > felled + 5);
check('the hall received wood from the producers', world.stock[WOOD] > 40);
const lone = world.buildings[world.build[at(12, 13)]];
check('a building whose road does not lead to the entrance is off the network: idle, no worker, no output, and says so', !exportsOk(lone) && !onGateNetwork(lone) && lone.state === BS_OFF_NET && lone.workers === 0 && whyIdle(world.build[at(12, 13)]).indexOf('entrée') > 0 && networkCount() >= 2 && lone.stock[WOOD] >= 0 && world.buildings[world.build[at(5, 9)]].state !== BS_ISOLATED);
// ---- labour pool: three workplaces, three idle residents; the priority decides who is staffed ----
const labourVillage = (first: string): void => {
  generate(1234, 16); rich(); clearRow(); world.tree[at(6, 9)] = 0; world.rock[at(6, 9)] = 0;
  for (const [i, n] of [[2, 2], [4, 1]]) { const h = addBuilding(HOUSE, at(i, 7)); for (let k = 0; k < n; k++) createResident(h); world.buildings[h].residents = n; world.buildings[h].timer = 1e9; }   // no settler arrives: exactly three idle hands
  applyTool(toolOf('lumberhut'), at(3, 9)); applyTool(TOOL_SAWMILL, at(5, 9)); applyTool(TOOL_LODGE, at(6, 9));
  movePriority(economy.typeOf(first), -99);
  run(15);
};
const staffed = (id: string): number => world.buildings.filter((b) => b.alive && b.type === economy.typeOf(id)).reduce((n, b) => n + b.workers, 0);
labourVillage('lumberhut');
check('priority: the default order spreads three hands over three workshops', staffed('lumberhut') === 1 && staffed('sawmill') === 1 && staffed('lodge') === 1);
labourVillage('sawmill');
check('priority: an order the player sets is strict: the first type is staffed in full, the next takes what is left, the last gets nobody', staffed('sawmill') === 2 && staffed('lumberhut') === 1 && staffed('lodge') === 0);
labourVillage('lodge');
check('priority: moving the lodge first staffs it first', staffed('lodge') === 2 && staffed('lumberhut') + staffed('sawmill') === 1);
check('an unstaffed workplace says no_workers', computeHints().some((h) => h.kind === 'no_workers'));
// ---- services: a market walker roams the roads and covers the houses it passes; coverage decays by the day ----
const MARKET = economy.serviceOf('market');
const coverVillage = (): number[] => {
  generate(1234, 16); rich(); clearRow(); world.tree[at(12, 12)] = 0; world.rock[at(12, 12)] = 0;
  const ids: number[] = [];
  for (const i of [2, 4, 6, 12]) { const h = addBuilding(HOUSE, i === 12 ? at(12, 12) : at(i, 7)); if (i !== 6) { createResident(h); createResident(h); world.buildings[h].residents = 2; } world.buildings[h].timer = 1e9; ids.push(h); }
  applyTool(toolOf('market'), at(5, 9));
  run(80);
  return ids;
};
let ids = coverVillage();
const covers = (): string => ids.map((h) => world.buildings[h].cover[MARKET]).join();
console.log('hamlet services: covers after 80 s ' + covers() + ' hash ' + stateHash());
check('the market walker covers the houses beside its route', ids.slice(0, 3).every((h) => world.buildings[h].cover[MARKET] > 0));
check('a house off the roads is not covered, and the hint says so', world.buildings[ids[3]].cover[MARKET] === 0 && computeHints().some((h) => h.reason === 'no_service:market' && h.tile === at(12, 12)));
const firstCovers = covers(), firstHash = stateHash();
ids = coverVillage();
check('coverage over a fixed road layout is deterministic (same covers and state hash)', covers() === firstCovers && stateHash() === firstHash);
applyTool(TOOL_ERASE, at(5, 9));
run(90);
check('without the market the counters decay to zero, a day at a time', ids.every((h) => world.buildings[h].cover[MARKET] === 0));
// ---- housing levels: needs, hysteresis, capacity, and the report in words ----
generate(1234, 16); rich(); clearRow();
const WATER = economy.serviceOf('water'), SMOKED2 = economy.resourceOf('smoked_meat'), BREAD2 = economy.resourceOf('bread');
const hh = addBuilding(HOUSE, at(2, 7)), cabin = world.buildings[hh];
createResident(hh); createResident(hh); cabin.residents = 2; cabin.timer = 1e9;
check('a new house is level 0 and its report says what the next level lacks', cabin.level === 0 && housingReport(cabin).text.indexOf('marché') >= 0 && housingReport(cabin).missing.length >= 2);
applyTool(toolOf('market'), at(5, 9));
const kids = addBuilding(HOUSE, at(4, 7)); createResident(kids); createResident(kids); world.buildings[kids].residents = 2; world.buildings[kids].timer = 1e9;   // idle hands for the vendor
setStock(SMOKED2, 60); setStock(BREAD2, 60); cabin.cover[WATER] = 9999;
for (const [ti, tj] of [[2, 6], [1, 7], [3, 7]]) { world.tree[at(ti, tj)] = 0; world.rock[at(ti, tj)] = 0; }
const stocked = world.stock[SMOKED2] + world.stock[BREAD2];
run(200);
check('the market and a meal lift the house to level 1: capacity grows', cabin.level === 1 && capacityOf(cabin) === 4 && world.stock[SMOKED2] + world.stock[BREAD2] < stocked);
check('level 2 still lacks appeal, and the report says so', cabin.level === 1 && housingReport(cabin).text.indexOf('agréable') >= 0 && computeHints().some((h) => h.kind === 'house_needs' && h.tile === at(2, 7)));
for (const [ti, tj] of [[2, 6], [1, 7], [3, 7]]) world.tree[at(ti, tj)] = 1;      // three trees around the house: appeal 3 once the day slice counts them
run(120);
check('with water, two foods and appeal the house reaches level 2 (capacity 6)', cabin.level === 2 && capacityOf(cabin) === 6 && !housingReport(cabin).top);
cabin.timer = 0; run(10);
applyTool(TOOL_ERASE, at(5, 9));
run(60);
check('hysteresis: three days without a market do not take the level away', cabin.level === 2);
cabin.cover[WATER] = 9999;
run(240);
check('after the devolve days the house falls back and the surplus residents leave', cabin.level < 2 && cabin.residents <= capacityOf(cabin) && world.people.filter((p) => p.home === hh).length === cabin.residents);
const saved = snapshot();
check('the levels survive a save round trip', restore(saved) && snapshot() === saved);
// ---- chain 4: the tannery turns hides into leather; the market stall needs leather; the well waters the houses within its radius ----
generate(1234, 16); rich(); clearRow(); world.tree[at(12, 12)] = 0; world.rock[at(12, 12)] = 0; world.tree[at(4, 5)] = 0; world.rock[at(4, 5)] = 0; world.tree[at(3, 5)] = 0; world.rock[at(3, 5)] = 0; world.tree[at(6, 9)] = 0; world.rock[at(6, 9)] = 0;
const LEATHER = economy.resourceOf('leather'), HIDE2 = economy.resourceOf('hide'), WATER2 = economy.serviceOf('water');
const th = addBuilding(HOUSE, at(2, 7)); createResident(th); createResident(th); world.buildings[th].residents = 2; world.buildings[th].timer = 1e9;
const far = addBuilding(HOUSE, at(12, 12)); createResident(far); world.buildings[far].residents = 1; world.buildings[far].timer = 1e9;
setStock(economy.resourceOf('leather'), 0); setStock(HIDE2, 8);
check('the market stall needs leather and says so', applyTool(toolOf('market'), at(6, 9)) === PLACE_NO_STOCK && economy.resources[LEATHER].price > 0);
applyTool(toolOf('tannery'), at(5, 9));
applyTool(toolOf('well'), at(3, 5));
check('a well needs no road', checkTool(toolOf('well'), at(4, 5)) === PLACE_OK);
run(70);
check('the tannery makes leather from hides (2 hides -> 1 leather)', world.stock[LEATHER] + world.buildings[world.build[at(5, 9)]].stock[LEATHER] >= 2 && world.stock[HIDE2] <= 4);
check('the well waters the houses within its radius, not the far one', world.buildings[th].cover[WATER2] > 0 && world.buildings[far].cover[WATER2] === 0);
check('a house the well does not reach is flagged by a hint', computeHints().some((h) => h.reason === 'no_service:water' && h.tile === at(12, 12)));
// ---- desirability: rings of a constructed layout, recomputed once a day ----
generate(1234, 16); world.tree.fill(0); world.rock.fill(0); rich();
computeAppeal();
const base = world.appeal.slice();
world.tree[at(6, 6)] = 1;
addBuilding(economy.typeOf('sawmill'), at(10, 10)); addBuilding(economy.typeOf('well'), at(10, 3));
computeAppeal();
const delta = (i: number, j: number): number => world.appeal[at(i, j)] - base[at(i, j)];
check('a tree adds one to its four neighbours and nothing beyond', delta(5, 6) === 1 && delta(6, 7) === 1 && delta(4, 6) === 0 && delta(6, 6) === 0);
check('the rings of an industry fall with distance (-3, -2, -1, then nothing)', delta(9, 10) === -3 && delta(8, 10) === -2 && delta(7, 10) === -1 && delta(6, 10) === 0);
check('a well raises the tiles around it', delta(10, 4) === 1 && delta(10, 5) === 1 && delta(10, 6) === 0);
check('the grid is clamped to the limit', (() => { for (let k = 0; k < 20; k++) addBuilding(economy.typeOf('sawmill'), at(2 + (k % 5), 12 + Math.floor(k / 5))); computeAppeal(); return world.appeal.every((v) => v >= -economy.appealMax && v <= economy.appealMax) && world.appeal.some((v) => v === -economy.appealMax); })());
world.appeal = world.appeal.map((_v) => 77);
run(10);
check('the grid is not recomputed between two days', world.appeal.every((v) => v === 77));
run(12);
check('it is recomputed when the day turns', world.appeal.every((v) => v !== 77) && appealTiles().length > 0);
// ---- the terrain generator: layers, params, determinism; deposits by rule; the quarry works one until it is gone ----
const layerText = (l: TerrainLayers): string => [l.water, l.outside, l.wet, l.forest, l.rock, l.deco].map((a) => a.join('')).join('|') + l.pondX + ':' + l.pondR;
const gp = (): TerrainParams => new TerrainParams();
const t24 = layerText(terrain(424242, 24, 24, gp()));
check('terrain(): the same seed, size and params give the same layers', layerText(terrain(424242, 24, 24, gp())) === t24 && layerText(terrain(424243, 24, 24, gp())) !== t24);
let genHash = 2166136261;
for (const seed of [1, 7, 99, 424242]) for (const l of [terrain(seed, 24, 24, gp())]) for (let t = 0; t < 576; t++) genHash = Math.imul(genHash ^ (l.water[t] + l.forest[t] * 2 + l.rock[t] * 16 + l.deco[t] * 64 + l.wet[t] * 256), 16777619);
console.log('hamlet rules: genhash ' + (genHash >>> 0));
const sum = (a: number[]): number => a.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
const dry = gp(); dry.waterAmount = 0; const lake = gp(); lake.waterAmount = 1;
check('param water_amount: none gives no water, more gives more', sum(terrain(5, 24, 24, dry).water) === 0 && sum(terrain(5, 24, 24, lake).water) > sum(terrain(5, 24, 24, gp()).water));
const stream = gp(); stream.river = true; const withRiver = terrain(5, 24, 24, stream);
check('param river: a stream crosses every row and the shore is wet', withRiver.riverI.length === 24 && sum(withRiver.water) > sum(terrain(5, 24, 24, gp()).water) && sum(withRiver.wet) > 0);
const dense = gp(); dense.forestDensity = 1; const bare = gp(); bare.forestDensity = 0;
const wood = gp(); wood.biome = 1; const birch = gp(); birch.biome = 2;
check('params forest and rock density move the counts', sum(terrain(5, 24, 24, dense).forest) > sum(terrain(5, 24, 24, bare).forest));
check('param biome: pines only, or birches only', terrain(5, 24, 24, wood).forest.every((v) => v >= 0 && v <= 3) && sum(terrain(5, 24, 24, wood).forest) > 0 && terrain(5, 24, 24, birch).forest.every((v) => v === 0 || v === 4));
let playable = true;
for (let seed = 1; seed <= 20; seed++) {
  generateWith(seed, 12);
  for (let t = 0; t < 144; t++) if (Math.abs(tileI(t) - 0) + Math.abs(tileJ(t) - 6) <= 2 && (world.tree[t] > 0 || world.rock[t] > 0 || world.terrain[t] !== 0)) playable = false;
}
check('generate() keeps the gate area clear', playable);
// deposits: every size keeps a stone within reach of the gate, and none stands on water or in a wall of trees
let reachOk = true, lodeCount = 0;
const STONE_K = economy.deposits.findIndex((d) => economy.resources[d.resource].id === 'stone');
for (const size of [12, 24, 32]) for (let seed = 1; seed <= 50; seed++) {
  generateWith(seed, size);
  let near = 0;
  for (let t = 0; t < size * size; t++) if (world.rock[t] === ROCK_DEPOSIT + STONE_K) { lodeCount++; if (Math.abs(tileI(t) - tileI(world.gate)) + Math.abs(tileJ(t) - tileJ(world.gate)) <= LODE_REACH && world.lode[t] > 0 && world.terrain[t] === 0) near++; }
  if (near === 0) reachOk = false;
}
check('150 villages (50 seeds, 3 sizes): a stone deposit always lies within reach of the gate', reachOk && lodeCount > 150);
check('deposits of resources nobody works yet are not placed', economy.deposits.every((d, k) => d.active || world.rock.every((v) => v !== ROCK_DEPOSIT + k)));
// the quarry: needs a deposit near, works it one unit per trip, the deposit disappears when used up and the scenery is redone
generate(1234, 16); rich(); clearRow(); for (const t of [at(7, 9), at(6, 9)]) { world.tree[t] = 0; world.rock[t] = 0; world.lode[t] = 0; }
const qh = addBuilding(HOUSE, at(2, 7)); createResident(qh); createResident(qh); world.buildings[qh].residents = 2; world.buildings[qh].timer = 1e9;
for (let t = 0; t < 256; t++) if (world.rock[t] >= ROCK_DEPOSIT) { world.rock[t] = 0; world.lode[t] = 0; }
check('a quarry needs a deposit of stone near it', applyTool(toolOf('quarry'), at(5, 9)) === PLACE_NO_LODE);
world.rock[at(7, 9)] = ROCK_DEPOSIT + STONE_K; world.lode[at(7, 9)] = 2;
const STONE_R = economy.resourceOf('stone'); setStock(STONE_R, 0);
check('with a deposit near, the quarry is allowed', applyTool(toolOf('quarry'), at(5, 9)) === PLACE_OK);
setStock(economy.resourceOf('tools'), 0);   // a tool in the stores would add its bonus: here one unit a trip
const rev = world.revision, snap = snapshot();
run(25);
check('quarrymen bring stone, one unit per trip, from the deposit', world.stock[STONE_R] + world.buildings[world.build[at(5, 9)]].stock[STONE_R] >= 1 && world.lode[at(7, 9)] <= 1);
check('the deposit survives a save round trip, partly worked', restore(snapshot()) && world.rock[at(7, 9)] === (world.lode[at(7, 9)] > 0 ? ROCK_DEPOSIT + STONE_K : 0) && snapshot().length > 0);
run(60);
check('a used-up deposit disappears and the scenery is redone', world.rock[at(7, 9)] === 0 && world.lode[at(7, 9)] === 0 && world.revision > rev && world.stock[STONE_R] + world.buildings[world.build[at(5, 9)]].stock[STONE_R] === 2);
// ---- bees: flowers speed the hive, winter stops it, honey and wax come out, candles light a house ----
generate(1234, 16); rich(); clearRow();
const HONEY = economy.resourceOf('honey'), WAX = economy.resourceOf('wax'), CANDLE = economy.resourceOf('candle'), APIARY_T = economy.typeOf('apiary');
const apiaryDef = economy.buildings[APIARY_T];
for (const t of [at(5, 9), at(4, 9), at(6, 9), at(5, 10)]) { world.tree[t] = 0; world.rock[t] = 0; }
for (let j = 5; j <= 13; j++) for (let i = 1; i <= 9; i++) world.deco[at(i, j)] = 0;
const bh = addBuilding(HOUSE, at(2, 7)); createResident(bh); createResident(bh); world.buildings[bh].residents = 2; world.buildings[bh].timer = 1e9;
setStock(HONEY, 0); setStock(WAX, 0);
check('an apiary is placed', applyTool(toolOf('apiary'), at(5, 9)) === PLACE_OK);
const hive = world.buildings[world.build[at(5, 9)]];
check('no flower near the hive: none counted, normal speed, and a hint', flowersAround(hive, apiaryDef) === 0 && workScale(hive, apiaryDef) === 1 && computeHints().some((h) => h.reason === 'no_flowers'));
for (const t of [at(4, 10), at(6, 10), at(3, 9), at(7, 9), at(5, 11), at(5, 7), at(6, 6), at(4, 12)]) world.deco[t] = 2;
check('flowers within the radius speed the hive (capped at six)', flowersAround(hive, apiaryDef) === 6 && Math.abs(workScale(hive, apiaryDef) - 1.6) < 1e-9 && !computeHints().some((h) => h.reason === 'no_flowers'));
world.tick = 0;
check('spring: the hive works', !resting(apiaryDef));
run(80);
const sp = world.stock[HONEY] + hive.stock[HONEY] + stockWithCarried(world.build[at(5, 9)])[HONEY];
check('in spring the beekeepers make honey and wax', sp >= 2 && world.stock[WAX] + hive.stock[WAX] >= 1);
world.tick = Math.round(9 * MONTH_SECONDS * 32);   // December: winter lasts 45 s
check('winter: the hive rests', resting(apiaryDef));
run(15);   // finish the cycle under way (and let the porters deliver), then nothing more starts
const w0 = world.stock[HONEY] + hive.stock[HONEY] + stockWithCarried(world.build[at(5, 9)])[HONEY];
run(25);
const w1 = world.stock[HONEY] + hive.stock[HONEY] + stockWithCarried(world.build[at(5, 9)])[HONEY];
check('no honey is made in winter', w1 === w0);
check('candles light a house only while lit', litBonus(world.buildings[bh]) === 0 && (world.buildings[bh].fed[CANDLE] = 2, litBonus(world.buildings[bh]) === 1));
check('the new goods survive a save round trip', restore(snapshot()) && world.buildings.some((b) => b.alive && b.type === APIARY_T));
// ---- goals: locked buildings, conditions checked daily, rewards as commands that replay, progress in the save ----
world.progression = true;
generate(1234, 16); clearRow();
const LODGE_T = economy.typeOf('lodge'), SAWMILL_T = economy.typeOf('sawmill'), HUT_T = economy.typeOf('lumberhut');
const goalIx = (id: string): number => economy.goals.findIndex((g) => g.id === id);
check('buildings a goal unlocks start locked, with the goal that opens them in words', applyTool(TOOL_LODGE, at(3, 9)) === PLACE_LOCKED && lockText(LODGE_T).indexOf('Des planches') >= 0 && lockText(HUT_T) === '' && lockText(SAWMILL_T) === '');   // the sawmill is open from the start: a village with no planks and no sawmill could never grow
const gh = addBuilding(HOUSE, at(2, 7)); createResident(gh); createResident(gh); world.buildings[gh].residents = 2; world.buildings[gh].timer = 1e9;
const logsBefore = world.stock[WOOD];
applyTool(toolOf('lumberhut'), at(3, 9));
run(25);
check('a goal is reached in the daily slice: its reward unlocks the sawmill and gives wood', world.goals[goalIx('wood')] === 1 && applyTool(TOOL_SAWMILL, at(5, 9)) === PLACE_OK && world.news.length === 1 && world.news[0].indexOf('Du bois') >= 0);
check('the reward went through the command log', world.log.length === 1 && world.log[0].kind === 'goal' && world.log[0].a === goalIx('wood') && world.log[0].tick > 0);
world.tree[at(6, 9)] = 0;
check('the next goal waits for its conditions (planks)', world.goals[goalIx('planks')] === 0 && applyTool(TOOL_LODGE, at(6, 9)) === PLACE_LOCKED);
setStock(PLANK, 15);
run(22);
check('wood, planks, then the lodge opens: the tutorial chain', world.goals[goalIx('planks')] === 1 && lockText(LODGE_T) === '' && world.log.length === 2);
const logged = world.log.slice(), planksNow = world.stock[PLANK];
const saveText = snapshot();
check('goal progress and unlocks survive a save round trip', restore(saveText) && world.goals[goalIx('planks')] === 1 && lockText(LODGE_T) === '' && snapshot() === saveText);
generate(1234, 16);
check('a fresh village is locked again', world.goals.every((v) => v === 0) && lockText(LODGE_T) !== '');
const next = replayAt(logged, 0, 1e9);
check('replaying the log rebuilds the same progress without checking the conditions', next === 2 && world.goals[goalIx('wood')] === 1 && world.goals[goalIx('planks')] === 1 && lockText(LODGE_T) === '' && world.stock[PLANK] === economy.start[PLANK] + 6);
check('the scenario is won when its final goal is done', !scenarioWon() && (() => { world.goals = world.goals.map((_v) => 1); return scenarioWon(); })());
world.progression = false;
// ---- trade: a peddler at the gate every five days with seeded offers; buying and selling are commands ----
const COIN = economy.resourceOf('coin');
const peddlers = (): number => world.people.filter((p) => p.role === ROLE_PEDDLER).length;
const twentyDays = (): string[] => {
  generate(1234, 16); world.progression = true;
  const seen: string[] = [];
  for (let day = 1; day <= 20; day++) {
    run(20);
    if (world.peddlerLeft === 2) seen.push(offerLines().join(' / '));
    if (day === 6) seen.push('day6 peddlers ' + peddlers() + ' offers ' + world.offers.length);
    if (day === 8) seen.push('day8 peddlers ' + peddlers() + ' offers ' + world.offers.length);
  }
  return seen;
};
const visits = twentyDays();
console.log('hamlet trade: ' + visits.join(' || '));
check('over 20 days the peddler comes on days 5, 10, 15 and 20 with three offers each', visits.filter((v) => v.indexOf('Le colporteur') === 0).length === 4 && visits.filter((v) => v.indexOf('Le colporteur') === 0).every((v) => v.split(' / ').length === 3));
check('he stands at the gate while he stays and is gone after', visits.indexOf('day6 peddlers 1 offers 3') >= 0 && visits.indexOf('day8 peddlers 0 offers 0') >= 0);
check('the offers are seeded: the same village draws the same visits', twentyDays().join('|') === visits.join('|'));
generate(1234, 16); world.progression = true;
run(100);
for (let k = 0; k < economy.resources.length; k++) setStock(k, 60);   // whatever the table draws, something can be taken
const offered = world.offers.map((o) => o.side + o.resource), stockBefore = world.stock.slice();
let sold = -1;
for (let k = 0; k < world.offers.length; k++) if (sold < 0 && world.offers[k].side === 'buy' && canTrade(k)) sold = k;
let bought = -1;
for (let k = 0; k < world.offers.length; k++) if (bought < 0 && world.offers[k].side === 'sell' && canTrade(k)) bought = k;
const logCount = world.log.length;
const line = sold >= 0 ? world.offers[sold] : world.offers[bought];
check('a trade is a command: it moves goods and coins, is logged, and cannot be taken twice', issue('trade', sold >= 0 ? sold : bought) && world.log.length === logCount + 1 && world.log[logCount].kind === 'trade' && line.taken
  && (line.side === 'buy' ? world.stock[COIN] === stockBefore[COIN] + line.coins && world.stock[line.resource] === stockBefore[line.resource] - line.qty : world.stock[COIN] === stockBefore[COIN] - line.coins && world.stock[line.resource] === stockBefore[line.resource] + line.qty)
  && !issue('trade', sold >= 0 ? sold : bought));
setStock(COIN, 0);
let poor = -1;
for (let k = 0; k < world.offers.length; k++) if (world.offers[k].side === 'sell' && !world.offers[k].taken) poor = k;
check('without the coins the village cannot buy', poor < 0 || (!canTrade(poor) && !issue('trade', poor)));
const tradeSave = snapshot();
check('the peddler and his offers survive a save round trip', restore(tradeSave) && snapshot() === tradeSave && peddlers() === 1 && world.offers.length === offered.length);
check('the offer lines are plain words', offerLines().length === 3 && offerLines()[0].indexOf('Pièces') > 0);
world.progression = false;
// ---- adventures: people leave for days, come back with a reward, some may be lost; start and return are commands ----
const HUNT = economy.adventures.findIndex((a) => a.id === 'hunt'), HIDE3 = economy.resourceOf('hide'), SMOKED3 = economy.resourceOf('smoked_meat');
const expedition = (risk: number): string => {
  generate(1234, 16); world.progression = true; rich(); clearRow(); world.tree[at(6, 9)] = 0; world.rock[at(6, 9)] = 0;
  for (const i of [2, 4, 6]) { const h = addBuilding(HOUSE, at(i, 7)); createResident(h); createResident(h); world.buildings[h].residents = 2; world.buildings[h].timer = 1e9; }
  applyTool(toolOf('lumberhut'), at(3, 9)); applyTool(TOOL_SAWMILL, at(5, 9)); world.unlocked.fill(1);
  setStock(SMOKED3, 5); setStock(HIDE3, 0);
  run(10);
  const staffedBefore = world.buildings.reduce((n, b) => n + (b.alive && b.type !== HOUSE ? b.workers : 0), 0), peopleBefore = world.people.length;
  economy.adventures[HUNT].risk = risk;
  const ok = issue('adventure_start', HUNT);
  const away = world.people.length, staffedAway = world.buildings.reduce((n, b) => n + (b.alive && b.type !== HOUSE ? b.workers : 0), 0);
  const detail = [ok ? 1 : 0, peopleBefore, away, staffedBefore, staffedAway, world.stock[SMOKED3], world.expeditions.length].join(',');
  run(45);
  const back = [world.expeditions.length, world.people.length, world.stock[HIDE3], world.stock[SMOKED3], world.buildings.filter((b) => b.alive && b.type === HOUSE).reduce((n, b) => n + b.residents, 0), stateHash()].join(',');
  economy.adventures[HUNT].risk = 10;
  return detail + ' | ' + back;
};
const safe = expedition(0), again = expedition(0), doomed = expedition(100);
console.log('hamlet adventure: ' + safe);
const numbersOf = (text: string): number[] => text.split(',').map((v) => Number(v));
const leaving = numbersOf(safe.split(' | ')[0]), returned = numbersOf(safe.split(' | ')[1]);
check('starting an adventure pays its cost and takes three people out of the village', leaving[0] === 1 && leaving[1] - leaving[2] === 3 && leaving[5] === 3 && leaving[6] === 1);
check('workers are absent from their jobs while away (idle residents go first, then workers)', leaving[4] < leaving[3] && leaving[3] - leaving[4] <= 3);
check('they come back after two days with the reward: hides and smoked meat', returned[0] === 0 && returned[2] === 6 && returned[3] === 3 + 4 && returned[4] === 6 && returned[1] === 6);
check('the result is deterministic for a seed', again === safe);
const lost = numbersOf(doomed.split(' | ')[1]);
check('with every member lost nobody returns, no reward comes and the houses lose them', lost[0] === 0 && lost[2] === 0 && lost[4] === 3 && lost[1] === 3);
expedition(0);
world.expeditions.length = 0; world.people = []; generate(1234, 16); world.progression = true; rich(); clearRow();
for (const i of [2, 4, 6]) { const h = addBuilding(HOUSE, at(i, 7)); createResident(h); createResident(h); world.buildings[h].residents = 2; world.buildings[h].timer = 1e9; }
world.unlocked.fill(1); setStock(SMOKED3, 5); setStock(HIDE3, 0);
issue('adventure_start', HUNT);
run(25);
const midText = snapshot(), midPeople = world.people.length;
check('a save in the middle of an adventure round trips: the members stay away', restore(midText) && snapshot() === midText && world.expeditions.length === 1 && world.people.length === midPeople);
run(30);
check('after the restore the expedition still comes home with its reward', world.expeditions.length === 0 && world.stock[HIDE3] >= 6 && world.people.length >= 3 && world.news.some((n) => n.indexOf('Retour') >= 0 || n.indexOf('pas revenue') >= 0));
check('an adventure needs its people and cost', !canStart(HUNT) || (setStock(SMOKED3, 0), !canStart(HUNT)));
world.progression = false;
// ---- harvests: time, yield, percent and chance come from economy.json; the swing follows the time ----
const harvestsOk = economy.resources.every((r) => r.harvest === null || [r.harvest].concat(r.variants).every((h) => h.units > 0 && h.percent >= 0 && h.percent <= 500 && h.chance > 0 && h.chance <= 100 && h.depletion <= 100 && h.seasons.length === 4 && h.time >= 0));
check('every harvest block stays within its bounds', harvestsOk && economy.resources.filter((r) => r.harvest !== null).length >= 9);
check('trees have four species and game two variants, a taller tree takes longer', economy.resources[WOOD].variants.length === 4 && economy.resources[MEAT].variants.length === 2 && (harvestFor(WOOD, 2)?.time ?? 0) > (harvestFor(WOOD, 0)?.time ?? 9) && (harvestFor(MEAT, 1)?.units ?? 0) > (harvestFor(MEAT, 0)?.units ?? 9));
check('a bad percent, chance, season list or tool is refused', bad('"percent": 85 }', '"percent": 900 }').join().indexOf('bad-harvest') >= 0 && bad('"chance": 80,', '"chance": 0,').join().indexOf('bad-harvest') >= 0 && bad('"seasons": [60, 130, 150, 25]', '"seasons": [60, 130]').join().indexOf('bad-harvest') >= 0 && bad('"resource": "tools", "bonus": 15', '"resource": "gold", "bonus": 15').join().indexOf('unknown-resource') >= 0);
check('blows follow the time: longer, more blows, evenly spread', blowsOf(2.2) === 4 && blowsOf(3.6) === 7 && blowsOf(.3) === 1 && Math.abs(swingRate(3.6) * 3.6 * BLOW_ANGLE / TAU - 7) < 1e-9);
generate(4242, 20); rich(); world.tick = 0;
const logH = harvestFor(WOOD, -1)!, toolsK = economy.resourceOf('tools');
setStock(toolsK, 0); const plain = efficiency(logH); setStock(toolsK, 3);
check('a tool in the stores raises the efficiency by its bonus', Math.abs(efficiency(logH) - plain * 1.2) < 1e-9);
world.tick = Math.floor(MONTH_SECONDS * 9.5 * 32);
check('the season scales the efficiency (winter fells less)', efficiency(logH) < plain * 1.2 - 1);
world.tick = 0;
const stag = harvestFor(MEAT, 1)!;
const trial = (seed: number): number[] => { seedRandom(seed); let units = 0, wins = 0; for (let k = 0; k < 2000; k++) { if (succeeds(stag)) { wins++; units += rollUnits(MEAT, stag); } } return [units, wins]; };
const t1 = trial(5), t2 = trial(5);
check('rolls are deterministic for a seed', t1[0] === t2[0] && t1[1] === t2[1]);
check('rolled units and success follow the percent and the chance', Math.abs(t1[1] / 2000 - stag.chance / 100) < .04 && Math.abs(t1[0] / t1[1] - meanUnits(stag)) < .1);
clearRow();
for (let i = 1; i <= 8; i++) applyTool(TOOL_ROAD, tileIndex(i, 8));
linkToGate(tileIndex(1, 8));
world.unlocked.fill(1); world.people = [];
for (const i of [2, 4]) { const h = addBuilding(HOUSE, at(i, 7)); createResident(h); createResident(h); createResident(h); createResident(h); world.buildings[h].residents = 4; world.buildings[h].timer = 1e9; }
applyTool(toolOf('lumberhut'), at(6, 9)); applyTool(toolOf('lumberhut'), at(3, 9));
const lastPhase: number[] = Array.from({ length: 64 }, () => 0), species: number[] = Array.from({ length: 64 }, () => -1);
let chops = 0, timeOk = true, blowsOk = true;
for (let k = 0; k < harvested.length; k++) harvested[k] = 0;
for (let k = 0; k < 60 * 32; k++) {
  stepWorld();
  world.people.forEach((p, i) => {
    if (p.state === ST_CHOP) {
      if (species[i] < 0) { species[i] = world.tree[p.target] - 1; const want = harvestFor(WOOD, species[i])!.time; if (!(p.timer <= want && p.timer > want - .1)) timeOk = false; }
      lastPhase[i] = p.phase;
    } else if (species[i] >= 0) {
      const done = Math.floor((lastPhase[i] * BLOW_ANGLE - Math.PI) / TAU) + 1;
      if (done !== blowsOf(harvestFor(WOOD, species[i])!.time)) blowsOk = false;
      species[i] = -1; chops++;
    }
  });
}
console.log('hamlet rules: harvesthash ' + harvested.join('.') + ':' + world.rng + ':' + world.stock.join('.'));   // compared across the three engines by hamlet.sh
check('a felling cycle lasts the species time and strikes the blows of that time', chops >= 4 && timeOk && blowsOk);
generate(1234, 16); rich(); seedRandom(11);
// ---- wild animals: alert, flee, a hunter's quarry stands, night rest, drinking, breeding up to the cap, old age ----
generate(4242, 16); world.people = []; world.progression = false;
const deerOf = (): Deer => world.deer.filter((d) => d.state !== DEER_GONE)[0];
const house0 = addBuilding(HOUSE, at(2, 7)); createResident(house0);
const watcher = world.people[0]; watcher.state = ST_SLEEP + 100;      // a state no routine touches: a statue
const freeze = (d: Deer): void => { d.state = DEER_GRAZE; d.timer = 1e6; d.path = []; d.step = 0; d.thirst = 0; d.hunted = false; };
let d0 = deerOf(); freeze(d0); world.tick = 0;
watcher.x = d0.x + 6; watcher.y = d0.y;
for (let k = 0; k < 8; k++) stepWorld();
check('a deer freezes when a person is within the alert radius', d0.state === DEER_ALERT);
freeze(d0); watcher.x = d0.x + 2.5; watcher.y = d0.y;
for (let k = 0; k < 8; k++) stepWorld();
check('a deer flees when a person comes within the fear radius', d0.state === DEER_FLEE && d0.path.length > 0);
const fleeFrom = Math.abs(d0.x - watcher.x) + Math.abs(d0.y - watcher.y);
for (let k = 0; k < 40; k++) stepWorld();
check('a fleeing deer runs away from the threat', Math.abs(d0.x - watcher.x) + Math.abs(d0.y - watcher.y) > fleeFrom + 1);
freeze(d0); d0.hunted = true; watcher.x = d0.x + 2.5; watcher.y = d0.y;
for (let k = 0; k < 8; k++) stepWorld();
check('a hunter\'s quarry stands still instead of fleeing', d0.state === DEER_ALERT);
d0.hunted = false; watcher.x = -1000; watcher.y = -1000;
for (let k = 0; k < 90; k++) stepWorld();
check('a deer goes back to grazing when the person leaves', d0.state !== DEER_FLEE && d0.state !== DEER_ALERT);
freeze(d0); d0.timer = 0; world.tick = Math.floor(DAY_TICKS * .8);
for (let k = 0; k < 6; k++) stepWorld();
check('a deer lies up at night', d0.state === DEER_REST);
world.tick = 0; freeze(d0); d0.timer = 0; d0.thirst = 1e6;
let drank = !world.hasWater;
for (let k = 0; k < 40 * 32 && !drank; k++) { stepWorld(); if (d0.state === DEER_DRINK) drank = true; world.tick = world.tick % 300; }
check('a thirsty deer walks to the water and drinks', drank);
{ // breeding
  const herd = world.deer.filter((d) => d.state !== DEER_GONE && d.species === 0);
  herd.forEach((d, i) => { d.stag = i === 0; d.age = 20; d.cooldown = 0; d.x = herd[0].x; d.y = herd[0].y; });
  world.tick = 1;
  const before = world.deer.filter((d) => d.state !== DEER_GONE && d.species === 0).length;
  for (let day = 0; day < 40; day++) dailyAnimals();
  const after = world.deer.filter((d) => d.state !== DEER_GONE && d.species === 0).length, cap = Math.round(SPECIES[0].perArea * world.size * world.size / 144);
  check('does breed in season, fawns follow the herd, up to the cap of the area', after > before && after <= cap && world.deer.some((d) => d.age === 0 || d.leader >= 0));
  for (const d of world.deer.filter((q) => q.species === 0)) { d.age = 5; d.cooldown = 0; }
  world.tick = Math.floor(DAY_TICKS * 9 * 3 * 1.5);                    // a winter day: no breeding
  const winter = world.deer.filter((d) => d.state !== DEER_GONE && d.species === 0).length;
  for (let day = 0; day < 10; day++) dailyAnimals();
  check('nothing breeds out of season', world.deer.filter((d) => d.state !== DEER_GONE && d.species === 0).length <= winter);
  for (const d of world.deer) d.age = SPECIES[d.species].lifeDays + 30;
  for (let day = 0; day < 30; day++) dailyAnimals();
  check('deer die of old age', world.deer.every((d) => d.state === DEER_GONE || d.state === DEER_DEAD));
}
// ---- animal movement: never on a blocked tile, herds hold together, running is faster than walking, the heading turns at a limit ----
{
  const live = (): Deer[] => world.deer.filter((d) => d.state !== DEER_GONE && d.state !== DEER_DEAD);
  let bad = 0, samples = 0, snap = 0, maxTurn = 0, inRange = 0, followers = 0, species = 0, panicBuilt = 0;
  const walkable = (d: Deer): boolean => { const t = tileAt(d.x, d.y); return t >= 0 && isWalkable(t); };
  const cases: number[][] = [[4242, 16, 0], [31, 24, 1], [7777, 32, 2], [90210, 24, 3]];
  for (const c of cases) {
    generate(c[0], c[1], PRESETS[c[2] % PRESETS.length].params); world.people = []; world.progression = false; world.tick = 0;
    species += [0, 1, 2].filter((sp) => live().some((d) => d.species === sp)).length;
    for (let k = 0; k < 3; k++) for (const d of live()) { d.leader = -1; }
    for (let day = 0; day < 3; day++) dailyAnimals();
    const last = new Map<number, number>();
    for (let k = 0; k < 2000; k++) {
      stepWorld();
      if (k === 800) { const d = live()[0]; for (let dir = 0; dir < 4 && d !== undefined; dir++) { const v = neighbor(tileAt(d.x, d.y), dir); if (v >= 0 && isOpen(v)) { addBuilding(HOUSE, v); break; } } }
      if (k % 4 === 0) for (const d of live()) {
        samples++; if (k !== 800 && !walkable(d)) bad++;   // (a house built over an animal moves it out on the next tick)
        const before = last.get(d.id);
        const yaw = Math.atan2(d.hy, d.hx);
        if (before !== undefined) { let dy = Math.abs(yaw - before); if (dy > Math.PI) dy = 2 * Math.PI - dy; if (dy > maxTurn && d.speed > 0) maxTurn = dy; }
        last.set(d.id, yaw);
      }
    }
    snap += live().length;
    for (const d of live()) if (d.leader >= 0) { const l = world.deer.filter((o) => o.id === d.leader && o.state !== DEER_GONE)[0]; if (l !== undefined) { followers++; if (Math.abs(l.x - d.x) + Math.abs(l.y - d.y) < 36) inRange++; } }
  }
  check('no animal is ever on a water, tree, rock or building tile (' + samples + ' samples, ' + snap + ' alive at the end)', bad === 0 && samples > 1000);
  check('rabbits and boar live next to the deer', species >= cases.length * 2);
  check('the heading never snaps (at most ' + maxTurn.toFixed(2) + ' rad in 4 ticks)', maxTurn < 2.6);
  check('herds stay near their leader (' + inRange + ' of ' + followers + ')', followers === 0 || inRange >= followers * .8);
  check('running is faster than walking, for every species', SPECIES.every((sp) => sp.flee > sp.walk * 1.5));
  generate(4242, 16); world.people = [];
  const house = addBuilding(HOUSE, at(2, 7)); createResident(house);
  const w = world.people[0]; w.state = ST_SLEEP + 100;
  const run0 = world.deer.filter((d) => d.species === 0)[0];
  run0.state = DEER_GRAZE; run0.timer = 1e6; run0.path = []; run0.step = 0; run0.hunted = false; run0.leader = -1; w.x = run0.x + 2.5; w.y = run0.y; world.tick = 0;
  let top = 0;
  for (let k = 0; k < 40; k++) { stepWorld(); if (run0.speed > top) top = run0.speed; }
  check('a deer ramps up to a run (' + top.toFixed(2) + ' units/s, walking is ' + SPECIES[0].walk + ')', top > SPECIES[0].walk * 2);
  const hashes = live().map((d) => Math.round(d.x * 1000) * 31 + Math.round(d.y * 1000)).reduce((h, v) => (h * 31 + v) | 0, 7);
  console.log('hamlet rules: animalhash ' + (hashes >>> 0) + ':' + live().length);
}
const tileX2 = (i: number): number => (i + .5) * 2 - world.half;
const isOpenBlocked = (t: number): boolean => !isOpen(t);
// ---- wolves (opt-in packs), hunted game that bolts, rabbits and the winter ----
{
  const wolvesOf = (): Deer[] => world.deer.filter((d) => d.species === SP_WOLF && d.state !== DEER_GONE);
  const withWolves = (mode: number, forest: number, seed: number): void => {
    const p = new TerrainParams(); p.wolves = mode; p.forestDensity = forest; p.biomes = 0;
    generate(seed, 24, p); world.people = []; world.progression = false; world.tick = 0;
  };
  generate(11, 24);
  check('no wolf unless the village asks for them', wolvesOf().length === 0 && world.params.wolves === 0 && PRESETS[0].params.wolves === 0);
  withWolves(1, 1, 11);
  const pack = wolvesOf();
  check('a pack of three to six with one alpha, in forest country', pack.length >= 3 && pack.length <= 6 && pack.filter((d) => d.stag).length === 1 && pack.filter((d) => d.leader >= 0).length === pack.length - 1);
  withWolves(1, .05, 11);
  check('the plain flag gives no wolf on open country', wolvesOf().length === 0);
  withWolves(1, 1, 11);
  const wtext = snapshot(), wfields = wtext.split(';');
  check('the save keeps the wolves flag', restore(wtext) && world.params.wolves === 1 && wolvesOf().length >= 3);
  const pf = wfields[10].split(',');
  wfields[10] = pf.slice(0, 9).join(',');
  check('a save from before the wolves has none', pf.length === 12 && restore(wfields.join(';')) && world.params.wolves === 0 && wolvesOf().length === 0);
  // a wolf holds still to be looked at
  withWolves(1, 1, 11);
  const house1 = addBuilding(HOUSE, at(2, 7)); createResident(house1);
  const watch = world.people[0]; watch.state = ST_SLEEP + 100;
  const alpha = wolvesOf().filter((d) => d.stag)[0];
  const still = (d: Deer): void => { d.state = DEER_GRAZE; d.timer = 1e6; d.path = []; d.step = 0; d.thirst = 0; d.leader = -1; d.hunger = 0; d.prey = -1; };
  still(alpha); watch.x = alpha.x + 8; watch.y = alpha.y; world.tick = 0;
  for (let k = 0; k < 8; k++) stepWorld();
  check('a wolf freezes at a villager', alpha.state === DEER_ALERT);
  watch.x = -1000; watch.y = -1000;
  still(alpha); world.buildings[house1].burn = 5; const hx = (world.buildings[house1].i + .5) * 2 - world.half, hy = (world.buildings[house1].j + .5) * 2 - world.half;
  alpha.x = hx + 10; alpha.y = hy; world.tick = 0;
  for (let k = 0; k < 8; k++) stepWorld();
  check('a wolf flees from a fire', alpha.state === DEER_FLEE);
  world.buildings[house1].burn = 0;
  // a villager alone at night: a fright, and only in the dangerous mode a mauling
  for (const mode of [1, 2]) {
    withWolves(mode, 1, 11);
    const h = addBuilding(HOUSE, at(2, 7)); createResident(h);
    const lone = world.people[0]; lone.state = ST_SLEEP + 100; lone.mood = 60;
    const a = wolvesOf().filter((d) => d.stag)[0];
    for (const w of wolvesOf()) w.leader = w === a ? -1 : a.id;
    for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) if (Math.abs(i - Math.floor((a.x + world.half) / 2)) < 7 && Math.abs(j - Math.floor((a.y + world.half) / 2)) < 5) world.tree[j * 24 + i] = 0;   // open ground between them
    for (const d of world.deer) if (d.species !== SP_WOLF) d.state = DEER_GONE;      // nothing to hunt: only the villager is left
    still(a); a.hunger = 100; a.cooldown = 0; lone.x = a.x - 8.5; lone.y = a.y; world.tick = Math.floor(DAY_TICKS * .8);
    for (let k = 0; k < 32 * 30; k++) { world.tick = Math.floor(DAY_TICKS * .8) + (k % 40); stepWorld(); }
    if (mode === 1) check('wolves frighten a villager alone at night, no one dies', lone.mood < 60 && world.people.length === 1 && world.news.some((n) => n.indexOf('suivi') >= 0));
    else check('in the dangerous mode a villager alone at night can be lost', world.people.length === 0 && world.news.some((n) => n.indexOf('attaqué') >= 0));
  }
  // the hunt: stalk, chase, kill, feed; the herd flees; nobody on a blocked tile
  withWolves(2, 1, 13);   // seed 11 puts the first deer within the charge distance of the wolves: they run it down without a stalk
  const sawDead = new Set<number>();
  let stalks = 0, chases = 0, eats = 0, flees = 0, blocked = 0, samples2 = 0;
  const walkable2 = (d: Deer): boolean => { const t = tileAt(d.x, d.y); return t >= 0 && isWalkable(t); };
  for (let k = 0; k < 32 * 300; k++) {
    stepWorld();
    if (k % 4 !== 0) continue;
    for (const d of world.deer) {
      if (d.state === DEER_GONE) continue;
      if (d.state === DEER_DEAD) { if (d.errand === 9) sawDead.add(d.id); continue; }
      if (d.species === SP_WOLF) { if (d.state === DEER_STALK) stalks++; if (d.state === DEER_CHASE) chases++; if (d.state === DEER_EAT) eats++; }
      else if (d.species === 0 && d.state === DEER_FLEE) flees++;
      samples2++; if (!walkable2(d)) blocked++;
    }
  }
  check('wolves stalk, chase and feed (' + stalks + ', ' + chases + ', ' + eats + ' samples)', stalks > 0 && chases > 0 && eats > 0);
  check('they bring a deer down (' + sawDead.size + ' kills) while the others flee', sawDead.size >= 1 && flees > 0);
  check('no animal is on a blocked tile with wolves on (' + samples2 + ' samples)', blocked === 0 && samples2 > 1000);
  const kills = world.deer.filter((d) => d.state === DEER_DEAD && d.errand === 9);
  check('a kill is eaten away, it does not lie for ever', kills.every((d) => d.timer <= 26));
  console.log('hamlet rules: wolfhash ' + (world.deer.map((d) => d.state + ':' + Math.round(d.x * 100) + ':' + Math.round(d.y * 100) + ':' + d.hunger.toFixed(1)).reduce((h2: number, v: string) => { let m = h2; for (let c = 0; c < v.length; c++) m = Math.imul(m ^ v.charCodeAt(c), 16777619); return m; }, 2166136261) >>> 0) + ':' + world.rng + ':' + stateHash());
  // hungry or not, a pack keeps out of the village
  withWolves(1, 1, 11);
  const town = addBuilding(HOUSE, at(2, 7)); createResident(town);
  for (const p of world.people) p.state = ST_SLEEP + 100;
  let near = 0;
  for (let k = 0; k < 32 * 120; k++) { for (const w of wolvesOf()) w.hunger = 0; stepWorld(); if (k % 4 === 0) for (const w of wolvesOf()) for (const b of world.buildings) if (b.alive && Math.abs(tileX2(b.i) - w.x) + Math.abs(tileX2(b.j) - w.y) < 5) near++; }
  check('a fed pack keeps out of the village (' + near + ' samples within 5 units)', near === 0);
  // a hunted deer notices a hunter who walks upright and bolts; one who stays out of its alert radius is not noticed
  generate(4242, 16); world.people = [];
  const hh = addBuilding(HOUSE, at(2, 7)); createResident(hh);
  const hunter = world.people[0]; hunter.state = ST_SLEEP + 100;
  const prey = world.deer.filter((d) => d.species === 0)[0];
  const quarry = (d: Deer): void => { d.state = DEER_GRAZE; d.timer = 1e6; d.path = []; d.step = 0; d.thirst = 0; d.hunted = true; d.aware = 0; d.leader = -1; };
  quarry(prey); hunter.x = prey.x + 9.5; hunter.y = prey.y; world.tick = 0;
  for (let k = 0; k < 32 * 5; k++) stepWorld();
  check('a hunter outside the alert radius is not noticed', prey.hunted && prey.state !== DEER_FLEE && prey.aware === 0);
  quarry(prey); hunter.x = prey.x + 4.2; hunter.y = prey.y;
  let bolted = false;
  for (let k = 0; k < 32 * 4; k++) { stepWorld(); if (prey.state === DEER_FLEE) bolted = true; }
  check('a hunted deer that has noticed its hunter bolts', !prey.hunted && bolted);
  // rabbits keep to their burrow in winter, and the home range comes down from the hills
  generate(4242, 16); world.people = [];
  const rabbit = world.deer.filter((d) => d.species === SP_RABBIT)[0];
  let burrow = -1;
  for (let t = 0; t < world.size * world.size && burrow < 0; t++) if (isOpen(t) && Math.abs(tileI(t) - tileI(tileAt(rabbit.x, rabbit.y))) + Math.abs(tileJ(t) - tileJ(tileAt(rabbit.x, rabbit.y))) === 5 && !isOpenBlocked(t)) burrow = t;
  rabbit.home = burrow; rabbit.state = DEER_GRAZE; rabbit.timer = 0; rabbit.path = []; rabbit.step = 0; rabbit.leader = -1; rabbit.thirst = 0; rabbit.moves = 0;
  world.tick = 4800;
  let inside = false;
  for (let k = 0; k < 32 * 40 && !inside; k++) { world.tick = 4800 + (k % 100); stepWorld(); if (rabbit.state === DEER_REST && Math.abs(rabbit.x - tileX2(tileI(burrow))) + Math.abs(rabbit.y - tileX2(tileJ(burrow))) < 1.6) inside = true; }
  check('in winter a rabbit goes to its burrow and rests there', inside);
  world.biome[burrow] = BI_HILLS; rabbit.home = burrow; world.tick = 4800;
  dailyAnimals();
  check('in winter the home range comes down from the hills', world.biome[rabbit.home] !== BI_HILLS);
  // what the animals cost: 200 of them with a pack, timed (printed, not asserted: it depends on the engine)
  const cp = new TerrainParams(); cp.wolves = 1; cp.forestDensity = 1; cp.biomes = 0;
  generate(5, 48, cp); world.people = [];
  let extra = 0;
  for (let t = 0; t < world.size * world.size && world.deer.filter((d) => d.state !== DEER_GONE).length < 200; t += 3) if (isOpen(t)) { spawnDeer(t, extra++ % 3); }
  const t0 = Date.now();  // (0 under ZINC_DETERMINISTIC: the timing is read with the clock free)
  for (let k = 0; k < 320; k++) { world.tick++; updateDeer(1 / 32); }
  console.log('hamlet rules: animal update ' + ((Date.now() - t0) / 320).toFixed(3) + ' ms per tick for ' + world.deer.filter((d) => d.state !== DEER_GONE).length + ' animals, ' + wolvesOf().length + ' wolves');
}
// ---- residents: needs, mood, jobs, the daily round, newcomers and leavers ----
generate(555, 16); rich(); world.progression = false;
for (const t of [at(1, 8), at(2, 8), at(3, 8), at(4, 8), at(5, 8), at(6, 8), at(2, 7), at(4, 7), at(3, 9), at(5, 9)]) { world.tree[t] = 0; world.rock[t] = 0; }
for (let i = 1; i <= 6; i++) applyTool(TOOL_ROAD, tileIndex(i, 8));
const hA = addBuilding(HOUSE, at(2, 7)), hB = addBuilding(HOUSE, at(4, 7));
for (const h of [hA, hB]) { for (let n = 0; n < 4; n++) createResident(h); world.buildings[h].residents = 4; world.buildings[h].timer = 1e9; }
dailyMood();
check('people without a workplace anywhere are not jobless', world.jobless === 0 && world.people.every((p) => p.feel !== FEEL_JOBLESS));
applyTool(toolOf('lumberhut'), at(3, 9)); run(4);
dailyMood();
check('with workplaces filled, the rest are jobless: 8 people, 4 posts (2 cutters, 2 porters)', world.jobless === 50 && world.people.filter((p) => p.feel === FEEL_JOBLESS).length === 4);
check('the jobless hint appears', computeHints().some((h) => h.kind === 'jobless'));
check('a house\'s contentment moves at most 2 a day', Math.abs(world.buildings[hA].happy - 60) <= 4);
const worker = world.people.find((p) => p.job >= 0)!, idler = world.people.find((p) => p.job < 0)!;
check('a working person is better off than a jobless one', personTarget(worker, world.buildings[hA], true) > personTarget(idler, world.buildings[hA], true));
check('feelings: worst first', feelFrom(10, 0, true, true, true) === FEEL_ANGRY && feelFrom(60, 0, true, true, true) === FEEL_HOMELESS && feelFrom(60, 0, true, true, false) === FEEL_HUNGRY && feelFrom(60, 90, true, false, false) === FEEL_TIRED && feelFrom(60, 0, true, false, false) === FEEL_JOBLESS && feelFrom(60, 0, false, false, false) === FEEL_CONTENT);
check('thoughts are said in French', thoughtOf(FEEL_HUNGRY, '') === 'J’ai faim.' && thoughtOf(FEEL_JOBLESS, '') === 'Pas de travail pour moi.');
idler.mood = 20; idler.fatigue = 90; worker.mood = 80; worker.fatigue = 0;
check('discontent and tiredness slow the work', workPace(idler) < .6 && workPace(worker) === 1);
check('newcomers: faster when happy, none when unhappy', arrivalFactor(80) < 1 && arrivalFactor(55) === 1 && arrivalFactor(40) === 0 && arrivalFactor(45) === 1);
check('nobody leaves a small or content village; the unhappy leave', leavingToday(10, 5) === 0 && leavingToday(60, 40) === 0 && leavingToday(25, 40) >= 1);
{ // the daily round: sleep at home at night, up at dawn
  world.tick = 0; for (const p of world.people) { p.fatigue = 0; p.mood = 60; }
  const jobsBefore = world.people.filter((p) => p.job >= 0).length;
  run(15.5);                                                           // dusk
  const resting = world.people.filter((p) => p.state === ST_SLEEP || p.state === ST_HOME).length;
  check('at night people go home to sleep', resting >= 6);
  run(4.4);
  check('asleep, they recover', world.people.every((p) => p.fatigue < 40));
  run(1.2);
  check('at dawn they wake up and go back to what they do', world.people.every((p) => p.state !== ST_SLEEP && p.state !== ST_HOME));
  check('workers keep their job through the night', world.people.filter((p) => p.job >= 0).length === jobsBefore);
}
{ // newcomers and leavers follow the mood
  setStock(economy.resourceOf('fish'), 80);
  world.buildings[hA].level = 1; world.buildings[hB].level = 1;           // room for four each
  world.buildings[hA].timer = 1; world.buildings[hB].timer = 1; world.mood = 30;
  for (const p of world.people) p.mood = 15; for (const h of [hA, hB]) world.buildings[h].happy = 15;     // pinned low: the daily average is recomputed from these
  const n0 = population(); world.buildings[hA].residents = 2; world.buildings[hB].residents = 2; world.people.length = 4;   // room in both houses
  run(30);
  check('an unhappy village draws no newcomers', world.people.length === 4);
  world.mood = 80; world.buildings[hA].timer = 1; world.buildings[hB].timer = 1;
  for (const p of world.people) p.mood = 95; for (const h of [hA, hB]) world.buildings[h].happy = 95;
  run(40);
  check('a happy village does', world.people.length > 4 && n0 === 8);
  for (const p of world.people) p.mood = 5; for (const h of [hA, hB]) world.buildings[h].happy = 5;
  const crowd = world.people.length; world.news = [];
  for (let k = 0; k < 3; k++) dailyMood();
  check('an unhappy village loses people, and says so', world.people.length < crowd && world.news.some((l) => l.indexOf('quitte') >= 0 || l.indexOf('quittent') >= 0));
}
const moodHash = world.people.map((p) => Math.round(p.mood) + ':' + Math.round(p.fatigue)).join('.') + '|' + world.mood + '|' + world.jobless + '|' + world.deer.map((d) => d.state + ':' + d.age).join('.');
console.log('hamlet rules: moodhash ' + moodHash + ':' + world.rng);        // compared across the three engines by hamlet.sh
// ---- risks: fire, collapse and theft from daily counters; safety walkers reset them; none of it in a village without risks ----
{
  generate(777, 16); rich(); world.progression = false;
  for (let i = 0; i <= 12; i++) { world.tree[at(i, 7)] = 0; world.tree[at(i, 8)] = 0; world.tree[at(i, 9)] = 0; }
  for (let i = 1; i <= 12; i++) applyTool(TOOL_ROAD, at(i, 8));
  const FIRE = economy.serviceOf('fire'), RUIN = economy.risk.ruin, houses: number[] = [];
  for (const i of [2, 4, 6, 8]) { const h = addBuilding(HOUSE, at(i, 7)); for (let k = 0; k < 2; k++) createResident(h); world.buildings[h].residents = 2; world.buildings[h].timer = 1e9; houses.push(h); }
  const mill = addBuilding(economy.typeOf('sawmill'), at(3, 9)), store = addBuilding(economy.typeOf('storehouse'), at(5, 9)), forge = addBuilding(economy.typeOf('forge'), at(10, 9));
  const fresh = (): void => { for (const b of world.buildings) { b.fire = 0; b.damage = 0; b.crime = 0; } world.alerts = []; };
  const rngBefore = world.rng;
  for (let d = 0; d < 20; d++) dailyRisks();
  check('without risks nothing is counted and no random number is drawn', world.buildings.every((b) => b.fire === 0 && b.damage === 0) && world.rng === rngBefore);
  world.risks = true;
  for (const h of houses) world.buildings[h].residents = 0;                           // a hamlet of six: the grace period
  world.buildings[houses[0]].residents = 2; world.buildings[houses[1]].residents = 2; world.buildings[houses[2]].residents = 2;
  for (let d = 0; d < 20; d++) dailyRisks();
  check('below risks.minPopulation people the risks sleep', world.buildings.every((b) => b.fire === 0 && b.damage === 0 && b.crime === 0) && world.rng === rngBefore);
  for (const h of houses) world.buildings[h].residents = 5;                             // twenty: above the grace of risks.minPopulation
  world.mood = 40;
  for (let d = 0; d < 12; d++) dailyRisks();
  check('then the counters rise: fire on a slot day, wear and theft every day', world.buildings[mill].fire > 0 && world.buildings[mill].damage >= 12 && world.buildings[forge].crime === 24 && world.buildings[houses[0]].fire > 0);
  check('a hut does not wear out, the hall never burns', world.buildings[houses[0]].damage === 0 && world.buildings.every((b) => !b.fixed || (b.fire === 0 && b.damage === 0)));
  // a fire: the building becomes a burning ruin, its people flee, its goods are lost, an alert goes out
  fresh(); world.buildings[houses[3]].fire = economy.risk.fireAt + 1; const people = world.people.length;
  const hid = world.buildings[houses[3]].residents; dailyRisks();
  const burnt = world.buildings[houses[3]];
  check('past the threshold the building burns down to a ruin', burnt.type === RUIN && burnt.burn === economy.risk.burnDays && burnt.alive && burnt.residents === 0 && world.people.length === people - 2 && hid === 5);
  check('the fire is announced in French as urgent', world.alerts.length === 1 && world.alerts[0].kind === 'fire' && world.alerts[0].text.indexOf('Incendie') === 0 && world.alerts[0].tile === at(8, 7));
  // it spreads to the neighbours and leaves rubble after burnDays; the rubble is demolished like any building
  world.alerts = []; for (const b of world.buildings) if (!isRuin(b.type)) b.fire = 0;
  world.buildings[store].stock[WOOD] = 5; world.buildings[store].fire = 0;
  const neighbour = addBuilding(economy.typeOf('lumberhut'), at(9, 9)); world.buildings[neighbour].fire = 0;
  world.build[at(9, 7)] = -1;
  const next = addBuilding(economy.typeOf('claypit'), at(9, 7)); world.buildings[next].fire = 0;
  dailyRisks();
  check('a burning ruin sets its neighbours at risk', world.buildings[next].fire >= economy.risk.spread && world.buildings[houses[3]].burn === economy.risk.burnDays - 1);
  dailyRisks(); dailyRisks();
  check('it burns out, leaving rubble the demolish tool clears', burnt.burn === 0 && burnt.type === RUIN && world.alerts.some((a) => a.kind === 'rubble') && checkTool(TOOL_ERASE, at(8, 7)) === PLACE_OK && applyTool(TOOL_ERASE, at(8, 7)) === PLACE_OK && !burnt.alive && world.build[at(8, 7)] < 0);
  check('a ruin cannot be built', checkTool(TOOL_HOUSE + RUIN, at(8, 7)) !== PLACE_OK);
  // collapse and theft (the burnt house's people are gone: another house fills up again so the risks keep running)
  world.buildings[houses[0]].residents = 9;
  fresh(); world.buildings[mill].damage = 999; dailyRisks();
  check('worn out, a building collapses at once into rubble', world.buildings[mill].type === RUIN && world.buildings[mill].burn === 0 && world.alerts.some((a) => a.kind === 'collapse' && a.text.indexOf('Effondrement') === 0));
  fresh(); setStock(economy.resourceOf('tools'), 0); world.buildings[store].stock = world.buildings[store].stock.map((_v) => 0); world.buildings[store].stock[economy.resourceOf('coin')] = 6; world.buildings[store].crime = 99; world.mood = 40; const coins = world.buildings[store].stock[economy.resourceOf('coin')]; dailyRisks();
  for (let k = 0; k < 6000 && world.crime.outlaws.length > 0; k++) updateOutlaws(1 / 32);                // the theft is a robber walking in, taking, and running out
  check('a theft takes a little of the dearest goods, and says so', world.buildings[store].stock[economy.resourceOf('coin')] === coins - economy.risk.theft && world.buildings[store].crime <= 2 && world.alerts.some((a) => a.kind === 'theft'));
  world.mood = 80; fresh(); const before = world.buildings[store].crime; dailyRisks();
  check('a very happy village has no theft', world.buildings[store].crime === before);
  // the safety walkers: a fire walker's pass resets the counters within two tiles and puts a fire out
  fresh(); world.mood = 60; world.buildings[forge].fire = 50; world.buildings[store].fire = 50; world.buildings[store].damage = 40; world.buildings[store].crime = 20;
  coverAround(at(6, 8), FIRE);
  check('a fire walker resets the fire counter around him (not wear, not crime)', world.buildings[store].fire === 0 && world.buildings[forge].fire === 50 && world.buildings[store].damage === 40 && world.buildings[store].crime === 20);
  coverAround(at(10, 8), economy.serviceOf('repair')); coverAround(at(6, 8), economy.serviceOf('watch'));
  check('the repairman resets wear and the watchman theft', world.buildings[forge].damage === 0 && world.buildings[store].damage === 40 && world.buildings[store].crime === 0);
  const flames = addBuilding(economy.typeOf('claypit'), at(11, 9)); world.buildings[flames].type = RUIN; world.buildings[flames].burn = 2; world.alerts = [];
  coverAround(at(11, 8), FIRE);
  check('and puts out a burning ruin before it spreads', world.buildings[flames].burn === 0 && world.alerts.some((a) => a.kind === 'out'));
  // mood: a village with risks wants the fire post; without risks it does not care
  const offered = servicesOffered(); offered[FIRE] = 1;
  const h0 = world.buildings[houses[0]]; h0.cover[FIRE] = 0; world.risks = true;
  const bare = houseNeeds(h0, offered).target; h0.cover[FIRE] = 3; const covered = houseNeeds(h0, offered).target;
  world.risks = false; h0.cover[FIRE] = 0; const sandbox = houseNeeds(h0, offered).target;
  check('safety coverage feeds the mood only in a village with risks', bare < sandbox && sandbox < covered);
  world.risks = true;
  // hints: a high fire counter without a fire post asks for one, with one it says the walker comes too rarely
  fresh(); world.buildings[forge].fire = 30;
  const asks = computeHints().filter((h) => h.kind === 'fire_risk');
  check('a risky building with no fire post gets the fire_risk hint', asks.length === 1 && asks[0].tile === at(10, 9) && asks[0].reason === 'fire_risk:none');
  world.risks = false;
  check('and none in a village without risks', computeHints().every((h) => h.kind !== 'fire_risk'));
  world.risks = true;
  // the save keeps the counters, the ruins and the flag; an older save is refused
  world.buildings[forge].fire = 17; world.buildings[forge].damage = 5; world.buildings[forge].crime = 3; world.buildings[flames].burn = 1;
  for (const h of houses) if (world.buildings[h].alive && world.buildings[h].type === HOUSE) world.buildings[h].residents = world.people.filter((p) => p.home === h).length;   // as many residents as people, as a save has
  world.mood = 70;                                                                    // a loaded village starts at the neutral mood
  const saved = snapshot(), keep = stateHash();
  check('a save from before the risks is not loaded', !restore('H17' + saved.slice(saved.indexOf(';'))));
  check('the save round trip keeps counters, burning ruins and the risks flag', restore(saved) && stateHash() === keep && world.risks && world.buildings.some((b) => b.type === RUIN && b.burn === 1) && world.buildings.some((b) => b.fire === 17 && b.damage === 5 && b.crime === 3));
  check('the economy refuses a ruin that can be built and a safety service with no walker', bad('"buildable": false', '"buildable": true').join().indexOf('bad-risk') >= 0 && bad('"service": { "id": "fire", "walker": true, "range": 14 }', '"service": { "id": "fire", "radius": 4 }').join().indexOf('bad-service') >= 0);
  // a whole village with risks, run for forty days: identical on the three engines
  generate(2468, 16); rich(); world.risks = true;
  for (let i = 0; i <= 12; i++) { world.tree[at(i, 7)] = 0; world.tree[at(i, 8)] = 0; world.tree[at(i, 9)] = 0; }
  for (let i = 1; i <= 12; i++) applyTool(TOOL_ROAD, at(i, 8));
  for (const i of [2, 4, 6, 8, 10]) { const h = addBuilding(HOUSE, at(i, 7)); for (let k = 0; k < 3; k++) createResident(h); world.buildings[h].residents = 3; world.buildings[h].timer = 1e9; }
  addBuilding(economy.typeOf('sawmill'), at(3, 9)); addBuilding(economy.typeOf('forge'), at(7, 9)); addBuilding(economy.typeOf('storehouse'), at(5, 9));
  for (let d = 0; d < 40; d++) { for (let k = 0; k < DAY_TICKS; k++) stepWorld(); }
  let ruins = 0; for (const b of world.buildings) if (b.alive && isRuin(b.type)) ruins++;
  console.log('hamlet rules: riskhash ' + stateHash() + ':' + world.rng + ':' + ruins + ':' + world.buildings.map((b) => b.fire + '/' + b.damage + '/' + b.crime).join(','));
  check('forty days with risks keep the village going', world.tick === 40 * DAY_TICKS && population() >= 0);
  world.risks = false;
}
// ---- a gatherer with nothing in reach says so (it used to show "output full" with an empty hall) ----
{
  generate(1011, 16); rich(); world.progression = false; world.risks = false;
  for (let j = 6; j <= 10; j++) for (let i = 0; i <= 7; i++) { const keep = (j === 8 && i <= 5) || (i === 2 && j === 7) || (i === 3 && j === 9); world.tree[at(i, j)] = 0; world.rock[at(i, j)] = keep ? 0 : 1; world.build[at(i, j)] = -1; }
  for (let i = 1; i <= 5; i++) applyTool(TOOL_ROAD, at(i, 8));
  const h = addBuilding(HOUSE, at(2, 7)); createResident(h); createResident(h); world.buildings[h].residents = 2; world.buildings[h].timer = 1e9;
  const hut = addBuilding(economy.typeOf('lumberhut'), at(3, 9)); addBuilding(economy.typeOf('storehouse'), at(4, 7));
  run(40);
  check('a lumber hut walled in by rock reports that no tree is in reach, not "full"', world.buildings[hut].state === BS_NO_SOURCE && world.buildings[hut].stock.every((v) => v === 0) && whyIdle(hut).indexOf('Plus d’arbre') === 0);
  check('and the hint says to raze the way or move', computeHints().some((x) => x.kind === 'no_source' && x.tile === at(3, 9)) && hintText(computeHints().filter((x) => x.kind === 'no_source')[0]).indexOf('abattez') >= 0);
  world.rock[at(4, 9)] = 0; world.tree[at(4, 9)] = 1;               // a tree the road tile (4, 8) touches: the worker goes for it
  run(40);
  check('one tree in reach and the worker fells it, then reports the empty reach again', world.felledCount === 1 && world.buildings[hut].state === BS_NO_SOURCE);
}
// ---- public order: the peace rating, robbers a watchman catches, riots below a mood line, all gated by the risks flag ----
{
  generate(999, 16); rich(); world.progression = false; world.risks = true;
  for (let i = 0; i <= 12; i++) for (const j of [7, 8, 9]) { world.tree[at(i, j)] = 0; world.rock[at(i, j)] = 0; world.terrain[at(i, j)] = 0; }   // the street is whole: walkers keep to the roads
  for (let i = 1; i <= 12; i++) applyTool(TOOL_ROAD, at(i, 8));
  const houses: number[] = [];
  for (const i of [2, 4, 6, 8, 10]) { const h = addBuilding(HOUSE, at(i, 7)); for (let k = 0; k < 4; k++) createResident(h); world.buildings[h].residents = 4; world.buildings[h].timer = 1e9; houses.push(h); }
  const store = addBuilding(economy.typeOf('storehouse'), at(7, 9)), coin = economy.resourceOf('coin'), stockOf = (): number => world.buildings[store].stock[coin];
  world.buildings[store].stock[coin] = 20; world.mood = 70; world.jobless = 0; world.crime.heat = 0;
  const calm = computePeace(), gap = watchGap();
  check('with no guard post the whole village is a watch gap and costs peace', gap === 1 && calm === 100 - economy.risk.peace.gap);
  const POST = economy.serviceOf('watch'); for (const h of houses) world.buildings[h].cover[POST] = 3;
  addBuilding(economy.typeOf('watchpost'), at(3, 9));
  check('a guard post that covers the houses gives the peace back', watchGap() === 0 && computePeace() === 100);
  world.mood = 40; world.jobless = 50;
  check('a low mood and joblessness lower the peace', computePeace() < 100 - 30 && peaceText().indexOf('Paix : ') === 0);
  world.risks = false; dailyCrime();
  check('a village without risks is at peace, whatever the mood', computePeace() === 100 && world.crime.outlaws.length === 0);
  world.risks = true; world.mood = 70; world.jobless = 0;
  // a robber with nobody on watch takes goods and gets away
  check('a robber is sent for a building that holds goods', sendRobber(store) && world.crime.outlaws.length === 1 && world.crime.outlaws[0].role === ROLE_ROBBER);
  for (let k = 0; k < 9000 && world.crime.outlaws.length > 0; k++) updateOutlaws(1 / 32);
  check('the robber takes up to the loot, leaves by the gate, and the village feels it', stockOf() === 20 - economy.risk.theft && world.crime.outlaws.length === 0 && world.crime.robbed === 1 && world.crime.heat === economy.risk.peace.theftHeat);
  // a watchman on the road stops him: the goods come back
  world.buildings[store].stock[coin] = 20; world.alerts = []; world.news = [];
  const guard = new Person(); guard.role = ROLE_WATCHMAN; guard.x = tileX(at(6, 8)); guard.y = tileY(at(6, 8)); world.people.push(guard);
  check('a second robber is sent', sendRobber(store));
  for (let k = 0; k < 9000 && world.crime.outlaws.length > 0; k++) updateOutlaws(1 / 32);
  check('a watchman close to the road arrests him and the stock is whole', stockOf() === 20 && world.crime.caught === 1 && world.news.some((n) => n.indexOf('arrêté') >= 0));
  world.people = world.people.filter((p) => p !== guard);
  // riots: only when the mood is very low and the peace poor; one building is wrecked
  world.mood = 50; world.jobless = 0; world.crime.heat = 0; world.crime.lastRiot = -999; world.crime.lastRobbery = world.tick; world.crime.outlaws = [];
  for (const h of houses) world.buildings[h].cover[POST] = 0; world.tick += 40 * DAY_TICKS;
  dailyCrime();
  check('a bad mood that is not very low brings no riot', world.crime.outlaws.every((p) => p.role !== ROLE_RIOTER));
  world.mood = 10; world.jobless = 60; world.crime.lastRobbery = world.tick;
  dailyCrime();
  check('a very low mood and a poor peace bring rioters, once', world.crime.outlaws.length === 1 && world.crime.outlaws[0].role === ROLE_RIOTER && world.crime.riots === 1);
  const target = world.crime.outlaws[0].target, wearBefore = world.buildings[target].damage;
  for (let k = 0; k < 9000 && world.crime.outlaws.length > 0; k++) updateOutlaws(1 / 32);
  check('the rioters wreck their building and disperse', world.buildings[target].damage > wearBefore + 50 && world.crime.outlaws.length === 0 && world.alerts.some((a) => a.kind === 'riot'));
  world.crime.lastRiot = -999; world.crime.outlaws = []; world.difficulty = -1;
  world.risks = false; dailyCrime();
  check('and none of it in a village without risks', world.crime.outlaws.length === 0 && world.crime.peace === 100);
  world.risks = false;
}
// ---- determinism: ticks, the generator in the world, the state hash (hamlet.sh compares the printed hash across the three engines) ----
generate(1234, 16); rich();
for (const t of [at(2, 7), at(4, 7), at(5, 9), at(3, 9), at(1, 8), at(2, 8), at(3, 8), at(4, 8), at(5, 8), at(6, 8)]) { world.tree[t] = 0; }
for (let i = 1; i <= 6; i++) applyTool(TOOL_ROAD, tileIndex(i, 8));
applyTool(TOOL_HOUSE, tileIndex(2, 7)); applyTool(TOOL_HOUSE, tileIndex(4, 7)); applyTool(TOOL_SAWMILL, tileIndex(5, 9)); applyTool(TOOL_LODGE, tileIndex(3, 9));
for (let k = 0; k < 600; k++) stepWorld();
check('world.tick counts whole ticks', world.tick === 600 && Math.abs(world.time - 600 / 32) < 1e-6);
const hashed = stateHash();
console.log('hamlet rules: statehash ' + hashed);
const rngBefore = world.rng;
check('the save restores the state hash and the generator', restore(snapshot()) && stateHash() === hashed && world.rng === rngBefore);
// ---- map presets: deterministic on every engine, a plain default, every required deposit reachable on foot from the gate, params kept by a save ----
const defaultVillage = new TerrainParams(); defaultVillage.genStyle = GEN_CLUSTERED;   // the presets use the clustered generator
check('the first preset is the default village', JSON.stringify(PRESETS[0].params) === JSON.stringify(defaultVillage));
let presetHash = 2166136261;
for (const pr of PRESETS) for (const size of [24, 40]) {
  const copy = (): TerrainParams => { const q = new TerrainParams(); q.waterAmount = pr.params.waterAmount; q.river = pr.params.river; q.forestDensity = pr.params.forestDensity; q.rockDensity = pr.params.rockDensity; q.biome = pr.params.biome; q.coast = pr.params.coast; q.outcrop = pr.params.outcrop; q.flowers = pr.params.flowers; q.biomes = pr.params.biomes; return q; };
  generate(3, size, copy());
  const first = stateHash();
  for (let t = 0; t < size * size; t++) presetHash = Math.imul(presetHash ^ (world.terrain[t] + world.tree[t] * 4 + world.rock[t] * 64 + world.deco[t] * 1024 + world.lode[t] * 4096), 16777619);
  generate(3, size, copy());
  check('preset ' + pr.label + ' ' + size + ': the same seed gives the same village', stateHash() === first);
  const seen: number[] = Array.from({ length: size * size }, (): number => 0), queue: number[] = [world.gate];
  seen[world.gate] = 1;
  while (queue.length > 0) {
    const t = queue.pop() as number;
    for (let d = 0; d < 4; d++) { const v = neighbor(t, d); if (v >= 0 && seen[v] === 0 && world.terrain[v] === 0 && world.tree[v] === 0 && world.rock[v] === 0) { seen[v] = 1; queue.push(v); } }
  }
  let missing = '';
  for (let k = 0; k < economy.deposits.length; k++) {
    if (!economy.deposits[k].required || !economy.deposits[k].active) continue;
    let ok = false;
    for (let t = 0; t < size * size && !ok; t++) {
      if (world.rock[t] !== ROCK_DEPOSIT + k || Math.abs(tileI(t) - tileI(world.gate)) + Math.abs(tileJ(t) - tileJ(world.gate)) > LODE_REACH) continue;
      for (let d = 0; d < 4; d++) { const v = neighbor(t, d); if (v >= 0 && seen[v] === 1) ok = true; }
    }
    if (!ok) missing += ' ' + economy.deposits[k].resource;
  }
  check('preset ' + pr.label + ' ' + size + ': required deposits reachable from the gate' + missing, missing === '');
  const before = stateHash(), p = world.params;
  check('preset ' + pr.label + ' ' + size + ': a save keeps the params', restore(snapshot()) && stateHash() === before && world.params.coast === p.coast && world.params.outcrop === p.outcrop && world.params.river === p.river && world.params.biomes === p.biomes && world.params.waterAmount === p.waterAmount);
}
// ---- biomes and seasons: the default village is the biome generator; reeds, trails, fertile plains; biomes.json is checked; flowers sleep in winter ----
check('the default village is the biome generator, Classique the uniform scatter', new TerrainParams().biomes === 1 && PRESETS[PRESETS.length - 1].label === 'Classique' && PRESETS[PRESETS.length - 1].params.biomes === 0);
const BIOMES_TEXT = fs.readText('examples/hamlet/assets/biomes.json');
check('biomes.json is valid for the generator\'s biomes', parseBiomes(BIOMES_TEXT, BIOME_IDS).errors.length === 0);
check('biomes.json: a missing biome, a bad colour and a short season list are named', parseBiomes(BIOMES_TEXT.replace('"marsh"', '"swamp"'), BIOME_IDS).errors.some((e) => e.startsWith('unknown-biome')) && parseBiomes(BIOMES_TEXT.replace('[120, 170, 70]', '[120, 170, 700]'), BIOME_IDS).errors.some((e) => e.startsWith('bad-color')) && parseBiomes(BIOMES_TEXT.replace('"flowers": [1, 1, 0.4, 0]', '"flowers": [1, 1, 0.4]'), BIOME_IDS).errors.some((e) => e.startsWith('bad-seasons')));
let reedsOk = true, trailsOk = true, reeds = 0, trails = 0, plains = 0, plainsNearWater = true;
for (const seed of [3, 11, 99]) {
  const l = terrain(seed, 48, 48, new TerrainParams());
  for (let t = 0; t < 48 * 48; t++) {
    if (l.deco[t] === DECO_REEDS) { reeds++; if (l.wet[t] !== 2) reedsOk = false; }
    if (l.deco[t] === DECO_TRAIL) { trails++; if (l.forest[t] > 0 || l.rock[t] > 0 || l.water[t] > 0) trailsOk = false; }
    if (l.biome[t] === BI_PLAIN) { plains++; if (l.wet[t] === 2 || l.water[t] > 0) plainsNearWater = false; }
  }
}
check('reeds stand on the shore only, trails on open ground only, and the map has some of each', reedsOk && trailsOk && reeds > 0 && trails > 0);
check('fertile plains are open land, near water but not on the shore (marsh)', plains > 0 && plainsNearWater);
generate(3, 40, new TerrainParams());
check('a biome map is kept with the village (the same seed gives the same biomes)', world.biome.some((v) => v === BI_PLAIN || v === BI_MARSH) && world.biome.every((v) => v >= 0 && v < BIOME_IDS.length));
{ // a farm on fertile plain works faster; flowers around a hive count 0 in winter
  generate(3, 40, new TerrainParams()); rich();
  const farmDef = economy.buildings[economy.typeOf('farm')];
  const plain = world.biome.findIndex((v, t) => v === BI_PLAIN && world.build[t] < 0);
  const farm = addBuilding(economy.typeOf('farm'), plain);
  const fb = world.buildings[farm];
  check('a farm beside fertile plain gets the soil bonus, none without it', soilAround(fb, farmDef) > 0 && Math.abs(workScale(fb, farmDef) - (1 + soilAround(fb, farmDef) * farmDef.soil!.per)) < 1e-9);
  const hiveDef = economy.buildings[economy.typeOf('apiary')], meadow = world.deco.findIndex((v) => v === 1 || v === 2);
  if (meadow >= 0) {
    const hv = addBuilding(economy.typeOf('apiary'), meadow); world.tick = 0;
    const warm = flowersAround(world.buildings[hv], hiveDef);
    world.tick = Math.round(9 * 15 / (1 / 32));
    check('flowers count in spring and not at all in winter', warm > 0 && flowersAround(world.buildings[hv], hiveDef) === 0);
    world.tick = 0;
  }
}
console.log('hamlet rules: presethash ' + (presetHash >>> 0));
// ---- road laying: the L-shaped line, existing roads skipped, an obstacle ends it, the auto-route goes round ----
import { TERRAIN_GRASS, TERRAIN_WATER } from '../../../examples/hamlet/src/constants';
import { fieldFrom, pathTo, UNREACHABLE } from '../../../examples/hamlet/src/engine/path';
import { linePath, planRoad, costOf, refundOf, demolishRoad, isBridge, isPlaza } from '../../../examples/hamlet/src/rules/roadplan';
generate(7916, 24);
for (let j = 3; j <= 14; j++) for (let i = 3; i <= 14; i++) { const t = at(i, j); world.terrain[t] = TERRAIN_GRASS; world.tree[t] = 0; world.rock[t] = 0; world.build[t] = -1; world.road[t] = 0; }
const wide = linePath(at(4, 5), at(10, 7), false), tall = linePath(at(4, 5), at(6, 11), false), flipped = linePath(at(4, 5), at(10, 7), true);
check('the L runs along the longer side first, corner under the cursor', wide.length === 9 && wide[6] === at(10, 5) && wide[8] === at(10, 7) && tall[6] === at(4, 11) && tall[8] === at(6, 11));
check('a flip takes the other side first', flipped[2] === at(4, 7) && flipped[8] === at(10, 7) && wide.every((t, k) => k === 0 || t !== wide[k - 1]));
check('a line has no repeated tile and is one tile for a click', linePath(at(5, 5), at(5, 5), false).length === 1 && wide.every((t, k) => wide.indexOf(t) === k));
world.road[at(6, 5)] = 1; world.road[at(7, 5)] = 1;
const plan = planRoad(at(4, 5), at(10, 7), false, false);
check('existing road tiles are on the line but cost nothing', plan.tiles.length === 9 && plan.fresh.length === 7 && plan.blocked < 0 && plan.fresh.indexOf(at(6, 5)) < 0);
world.rock[at(9, 5)] = 1;
const cut = planRoad(at(4, 5), at(10, 7), false, false);
check('a blocked tile ends the line and is marked', cut.blocked === at(9, 5) && cut.tiles[cut.tiles.length - 1] === at(9, 5) && cut.fresh.length === 3);
const around = planRoad(at(4, 5), at(10, 7), false, true);
check('the auto-route goes round the rock and reaches the end', around.blocked < 0 && around.tiles[around.tiles.length - 1] === at(10, 7) && around.tiles.indexOf(at(9, 5)) < 0);
for (let k = 1; k < around.tiles.length; k++) if (Math.abs(tileI(around.tiles[k]) - tileI(around.tiles[k - 1])) + Math.abs(tileJ(around.tiles[k]) - tileJ(around.tiles[k - 1])) !== 1) { check('the auto-route is a chain of neighbours', false); break; }
const roadsBefore = world.road.join('');
buildRoad(around.fresh);
const roadHash = world.road.reduce((h, v, k) => (h * 31 + v * (k + 1)) | 0, 7);
check('laying the planned tiles joins start to end', around.tiles.every((t) => world.road[t] === 1) && world.road.join('') !== roadsBefore);
console.log('hamlet rules: roadhash ' + (roadHash >>> 0) + ':' + wide.join('.') + ':' + around.tiles.join('.'));
// ---- road cost, trees, bridges, plazas ----
world.rock[at(9, 5)] = 0; world.road.fill(0);
setStock(PLANK, 40); setStock(WOOD, 0);
check('a road costs a fraction of a plank a tile, the total rounded up', costOf([at(3, 3), at(4, 3), at(5, 3), at(6, 3)])[PLANK] === 2 && costOf([at(3, 3), at(4, 3), at(5, 3)])[PLANK] === 2);
world.tree[at(7, 3)] = 1;
check('a tree on the line costs a little more and does not stop it', planRoad(at(3, 3), at(10, 3), false, false).blocked < 0 && costOf([at(7, 3)])[PLANK] === 1);
const cleared = planRoad(at(3, 3), at(10, 3), false, false);
const clearedCost = costOf(cleared.fresh)[PLANK];
buildRoad(cleared.fresh.slice(0, cleared.built));
check('the road clears the tree and brings its wood', world.tree[at(7, 3)] === 0 && world.road[at(7, 3)] === 1 && world.stock[WOOD] === 1 && world.stock[PLANK] === 40 - clearedCost);
setStock(PLANK, 2);
const broke = planRoad(at(3, 6), at(12, 6), false, false);
check('the plan is capped by the stock: 4 tiles for 2 planks', broke.fresh.length === 10 && broke.built === 4 && broke.cost[PLANK] === 2);
setStock(PLANK, 0);
check('with no plank nothing is paid for', planRoad(at(3, 6), at(12, 6), false, false).built === 0 && checkTool(TOOL_ROAD, at(3, 6)) === PLACE_NO_STOCK);
setStock(PLANK, 100);
for (let j = 3; j <= 14; j++) for (let i = 8; i <= 10; i++) world.terrain[at(i, j)] = TERRAIN_WATER;
const over = planRoad(at(4, 8), at(14, 8), false, false), wet = over.fresh.filter((t) => world.terrain[t] === TERRAIN_WATER);
check('a road crosses water up to three tiles as a bridge', over.blocked < 0 && wet.length === 3 && costOf(wet)[PLANK] === 11);
buildRoad(over.fresh);
check('a bridge is a road on water that people can walk', isBridge(at(9, 8)) && !isBridge(at(7, 8)) && fieldFrom(at(4, 8)).dist[at(14, 8)] < UNREACHABLE && pathTo(fieldFrom(at(4, 8)), at(14, 8)).indexOf(at(9, 8)) >= 0);
const plankBefore = world.stock[PLANK];
demolishRoad(wet);
check('demolishing the bridge refunds half and removes it', world.road[at(9, 8)] === 0 && world.stock[PLANK] - plankBefore === 5 && refundOf(wet)[PLANK] === 5 && !isWalkable(at(9, 8)));
world.road.fill(0);
for (let j = 3; j <= 14; j++) world.terrain[at(11, j)] = TERRAIN_WATER;
const wide4 = planRoad(at(4, 8), at(14, 8), false, false);
check('four tiles of water stop the line, marked on the first', wide4.blocked === at(8, 8) && wide4.tiles[wide4.tiles.length - 1] === at(8, 8));
world.terrain[at(11, 8)] = TERRAIN_GRASS; for (let j = 3; j <= 14; j++) world.terrain[at(11, j)] = TERRAIN_GRASS;
const detour = planRoad(at(4, 8), at(14, 8), false, true);
check('the auto-route bridges when that is cheaper than a long way round', detour.blocked < 0 && detour.fresh.filter((t) => world.terrain[t] === TERRAIN_WATER).length === 3);
for (let j = 3; j <= 14; j++) world.terrain[at(11, j)] = TERRAIN_WATER;
const around4 = planRoad(at(4, 8), at(14, 8), false, true);
check('a river too wide is gone round, never bridged', around4.blocked < 0 && around4.fresh.every((t) => world.terrain[t] !== TERRAIN_WATER) && around4.tiles.length > 11);
for (let j = 3; j <= 14; j++) for (let i = 8; i <= 11; i++) world.terrain[at(i, j)] = TERRAIN_GRASS;
buildRoad([at(4, 12), at(5, 12), at(6, 12)]);
check('a straight road is no plaza', ![at(4, 12), at(5, 12), at(6, 12)].some((t) => isPlaza(t)));
const appealBefore = (() => { computeAppeal(); return world.appeal[at(5, 14)]; })();
buildRoad([at(4, 13), at(5, 13)]);
check('a 2 x 2 block of road is a plaza, its neighbours are not', [at(4, 12), at(5, 12), at(4, 13), at(5, 13)].every((t) => isPlaza(t)) && !isPlaza(at(6, 12)));
computeAppeal();
check('a plaza adds one appeal around it', world.appeal[at(5, 14)] - appealBefore === 1 || world.appeal[at(5, 14)] === economy.appealMax);
// ---- the city at scale: road networks, the labour numbers, roamers, storage orders, housing hysteresis, the sliced desirability pass, determinism ----
{
  generate(1234, 16); rich(); clearRow();
  for (let i = 1; i <= 7; i++) buildRoad([at(i, 8)]);
  world.road[at(12, 2)] = 1; world.netRev++;
  const gnet = gateNetwork();
  check('a road joined to the gate is one network with it, a lone tile is a network of its own', gnet >= 0 && netAt(at(3, 8)) === gnet && netAt(at(12, 2)) >= 0 && netAt(at(12, 2)) !== gnet && networkCount() >= 2);
  world.road[at(12, 2)] = 0; world.netRev++;
  const h0 = addBuilding(HOUSE, at(3, 7));
  run(4);
  const settler = world.people.filter((q) => q.role === ROLE_SETTLER)[0];
  check('a settler walks the road from the gate to the door, never across the land', settler !== undefined && settler.path.length > 2 && settler.path.every((t) => world.road[t] === 1));
  check('a house on the gate network is connected, one with no road is not', onGateNetwork(world.buildings[h0]) && !onGateNetwork(world.buildings[addBuilding(HOUSE, at(10, 12))]));
  // the labour numbers: a share of the residents is the pool, the rest is not asked to work
  economy.sim.labourShare = 100;
  labourVillage('lumberhut');
  let lab = labourStats();
  check('labour: three residents, six places: all three work, the empty places are a shortage and nobody is unemployed', lab.pool === 3 && lab.filled === 3 && lab.unemployed === 0 && lab.shortage === lab.jobs - 3 && lab.shortage > 0);
  economy.sim.labourShare = 50;
  labourVillage('lumberhut');
  lab = labourStats();
  check('labour: with half the residents in the pool one person works', lab.pool === 1 && employed() === 1 && lab.filled === 1);
  economy.sim.labourShare = 100;
  generate(1234, 16); rich(); clearRow(); world.tree[at(6, 9)] = 0;
  for (const [i, n] of [[2, 2], [4, 2], [6, 2]]) { const h = addBuilding(HOUSE, at(i, 7)); for (let k = 0; k < n; k++) createResident(h); world.buildings[h].residents = n; world.buildings[h].timer = 1e9; }
  applyTool(toolOf('lumberhut'), at(3, 9)); run(10);
  lab = labourStats();
  check('labour: six residents, a hut of two places and the hall\'s two porters: two are unemployed, no shortage', lab.pool === 6 && lab.filled === 4 && lab.unemployed === 2 && lab.shortage === 0);
  // the roamer: straight on, a rotating choice at a junction, houses within two tiles covered, the counter decays by the day
  generate(1234, 16); rich(); clearRow();
  for (const t of [at(4, 9), at(4, 10), at(4, 11), at(4, 6), at(4, 5), at(4, 4), at(2, 5)]) { world.tree[t] = 0; world.rock[t] = 0; }
  for (let i = 1; i <= 7; i++) buildRoad([at(i, 8)]);
  buildRoad([at(4, 9), at(4, 10), at(4, 11)]);
  const market = addBuilding(economy.typeOf('market'), at(6, 7)), MK = economy.serviceOf('market');
  const walkRound = (): number[] => { const w = new Person(); w.x = tileX(at(6, 8)); w.y = tileY(at(6, 8)); w.path = []; w.step = 0; return startRoam(w, world.buildings[market]) ? w.path.slice() : []; };
  const first = walkRound(), second = walkRound();
  check('a roamer goes straight on at a junction on its first pass and the building rotates the choice for the next walker', first.length > 6 && first[0] === at(5, 8) && first[1] === at(4, 8) && first[2] === at(3, 8) && second.length > 6 && second[1] === at(4, 8) && second[2] === at(4, 9));
  check('a round never leaves the roads and is as long as the service range', first.every((t) => world.road[t] === 1) && first.length === economy.buildings[economy.typeOf('market')].service!.range && second.every((t) => world.road[t] === 1));
  const near = addBuilding(HOUSE, at(4, 6)), far = addBuilding(HOUSE, at(2, 5));
  coverAround(at(4, 8), MK);
  check('a walker covers the houses within two tiles of its road tile and no farther', world.buildings[near].cover[MK] === COVER_DAYS && world.buildings[far].cover[MK] === 0);
  const seen: number[] = [];
  for (let d = 0; d < COVER_DAYS + 1; d++) { seen.push(world.buildings[near].cover[MK]); dailyServices(); }
  check('the coverage counter decays by one a day until the house is uncovered', seen.join(',') === COVER_DAYS + ',' + (COVER_DAYS - 1) + ',' + (COVER_DAYS - 2) + ',' + (COVER_DAYS - 3) && world.buildings[near].cover[MK] === 0);
  // cart-pushers go to the nearest accepting store; storage orders redirect them
  generate(1234, 16); rich(); clearRow(); world.tree[at(6, 9)] = 0; world.rock[at(6, 9)] = 0; world.tree[at(7, 9)] = 0; world.rock[at(7, 9)] = 0; world.tree[at(7, 8)] = 0; world.rock[at(7, 8)] = 0;
  for (const i of [2, 4]) { const h = addBuilding(HOUSE, at(i, 7)); for (let k = 0; k < 4; k++) createResident(h); world.buildings[h].residents = 4; world.buildings[h].timer = 1e9; }
  applyTool(toolOf('lumberhut'), at(3, 9));
  const nearStore = addBuilding(economy.typeOf('storehouse'), at(4, 9)), farStore = addBuilding(economy.typeOf('storehouse'), at(7, 9));
  const hallId = world.buildings.findIndex((b) => b.type === economy.hall);
  for (const b of world.buildings) if (b.alive && b.type === economy.typeOf('storehouse')) b.stock[WOOD] = 0;
  recount();
  run(150);
  const logsIn = (id: number): number => world.buildings[id].stock[WOOD];
  check('the cart goes to the nearest store with room', logsIn(nearStore) > 0 && logsIn(nearStore) >= logsIn(farStore));
  check('a store set to refuse a resource gets none of it while the others take it', setOrder(nearStore, WOOD, ORDER_REFUSE) && (() => { const before = logsIn(nearStore); run(150); return logsIn(nearStore) === before && logsIn(farStore) + logsIn(hallId) > 0; })());
  check('a store set to get a resource is filled from the others and never handed out', setOrder(nearStore, WOOD, ORDER_GET) && setOrder(farStore, WOOD, ORDER_REFUSE) && setOrder(hallId, WOOD, ORDER_REFUSE) && (() => { world.buildings[nearStore].stock[WOOD] = 0; recount(); run(150); return logsIn(nearStore) > 0; })());
  check('storage orders are for stores only', !setOrder(world.build[at(2, 7)], WOOD, ORDER_REFUSE) && orderOf(world.buildings[nearStore], WOOD) === ORDER_GET && orderOf(world.buildings[farStore], PLANK) === ORDER_ACCEPT);
  // housing: evolve after evolveDays days meeting the next level, fall back only after devolveDays days failing the own one with the margin slackened
  generate(1234, 16); rich();
  const hs = economy.buildings[HOUSE].housing!, home = addBuilding(HOUSE, at(5, 5)), hb = world.buildings[home], WATER = economy.serviceOf('water');
  const well = (on: boolean): void => { hb.cover[MK] = on ? 3 : 0; hb.cover[WATER] = on ? 3 : 0; };
  hb.fed[hs.eats[0]] = 99; hb.fed[hs.eats[1]] = 99; hb.residents = 0; well(true);
  world.appeal[at(5, 5)] = 3;
  dailyHousing();
  check('a house that meets the next level does not climb at once', hb.level === 0);
  dailyHousing();
  check('...it climbs after evolveDays days, and again after as many for the next level', hb.level === 1 && (() => { dailyHousing(); dailyHousing(); return hb.level === 2 && !housingReport(hb).top; })());
  world.appeal[at(5, 5)] = 1;
  for (let d = 0; d < hs.devolveDays + 3; d++) dailyHousing();
  check('hysteresis: a level kept inside the margin is not lost, however many days pass', hb.level === 2);
  world.appeal[at(5, 5)] = 0; well(true);
  for (let d = 0; d < hs.devolveDays - 1; d++) dailyHousing();
  check('...failing the own level falls back only after devolveDays days', hb.level === 2 && housingReport(hb).atRisk);
  dailyHousing();
  check('...then the level is lost', hb.level === 1);
  well(false);
  check('"what is missing" names the service the house lacks', housingReport(hb).missing.some((q) => q.id === 'water'));
  // the desirability pass spread over the day's last ticks gives what the pass at once gives
  generate(1234, 16); rich(); clearRow();
  for (const i of [2, 4, 6]) addBuilding(HOUSE, at(i, 7));
  addBuilding(economy.typeOf('market'), at(5, 9));
  run(20);
  const sliced = world.appeal.join(',');
  computeAppeal();
  check('the sliced desirability pass equals the whole-map pass', sliced === world.appeal.join(',') && world.appeal.some((v) => v !== 0));
  // determinism: the same ticks give the same village, on every engine (compared across the three by hamlet.sh)
  const city = (): number => {
    generate(77, 40); rich(); world.autosave = false;
    const j = 20, row: number[] = [];
    for (let i = 0; i <= 32; i++) { world.tree[at(i, j)] = 0; world.rock[at(i, j)] = 0; row.push(at(i, j)); }
    for (const dj of [-1, 1]) for (let i = 2; i < 30; i++) { world.tree[at(i, j + dj)] = 0; world.rock[at(i, j + dj)] = 0; }
    buildRoad(row);
    let n = 0;
    for (let i = 2; i < 30; i += 2) for (const dj of [-1, 1]) {
      const t = at(i, j + dj);
      if (n % 5 === 4) addBuilding(economy.typeOf(['lumberhut', 'sawmill', 'lodge', 'farm', 'storehouse', 'market'][Math.floor(n / 5) % 6]), t);
      else { const h = addBuilding(HOUSE, t); createResident(h); createResident(h); world.buildings[h].residents = 2; world.buildings[h].timer = 1e9; }
      n++;
    }
    run(65);
    return stateHash();
  };
  const cityA = city(), cityB = city();
  check('a city of houses and workshops replays to the same state hash', cityA === cityB && world.people.length > 20);
  console.log('hamlet rules: cityhash ' + cityA + ':' + world.people.filter((q) => q.job >= 0).length + ':' + labourStats().jobs);
}
const hashList = (list: number[]): number => { let h = 7; for (const v of list) h = (h * 31 + v) | 0; return h >>> 0; };
console.log('hamlet rules: roadhash2 ' + hashList(around4.tiles) + ':' + hashList(detour.tiles) + ':' + hashList(over.tiles) + ':' + hashList(broke.fresh) + ':' + hashList(world.road));
// ---- relief: seeded heights, flat footprints, slopes and cliffs for roads and walkers, bridges, saves ----
import { heightAt, isSlope, isCliff } from '../../../examples/hamlet/src/world/world';
import { PLACE_UNEVEN, PLACE_ROCKY, MOUNTAIN_LEVEL, MAX_HEIGHT, SLOPE_SPEED, TERRAIN_WATER as WATER_T, TERRAIN_GRASS as GRASS_T } from '../../../examples/hamlet/src/constants';
import { walk } from '../../../examples/hamlet/src/engine/path';
const MOUNTAINS = PRESETS[PRESETS.length - 3].params;
const levelsOf = (seed: number, size: number): number[] => terrain(seed, size, size, MOUNTAINS).level;
const lv1 = levelsOf(11, 64);
check('relief: the same seed gives the same heights, another seed other ones', lv1.join('') === levelsOf(11, 64).join('') && lv1.join('') !== levelsOf(12, 64).join(''));
check('relief: levels stay in 0..' + MAX_HEIGHT + ' and the mountains reach the rock', lv1.every((v) => v >= 0 && v <= MAX_HEIGHT) && Math.max(...lv1) >= MOUNTAIN_LEVEL + 2 && lv1.some((v) => v === 0));
let reliefHash = 2166136261;
for (const seed of [11, 12, 99]) for (const v of levelsOf(seed, 48)) reliefHash = Math.imul(reliefHash ^ v, 16777619);
console.log('hamlet rules: reliefhash ' + (reliefHash >>> 0));
const noRelief = new TerrainParams(); noRelief.relief = 0;
check('relief: relief 0 is a flat world, the default only rises gently', terrain(11, 64, 64, noRelief).level.every((v) => v === 0) && terrain(11, 64, 64, new TerrainParams()).level.every((v) => v <= 4));
generate(11, 64, MOUNTAINS);
let waterUp = 0, steep = 0, gateFlat = true, deposits = 0, highDeposits = 0, high = 0, land = 0;
for (let t = 0; t < 4096; t++) {
  if (world.terrain[t] === WATER_T && world.height[t] !== 0) waterUp++;
  if (world.terrain[t] === WATER_T) continue;
  land++; if (world.height[t] >= 5) high++;
  if (world.rock[t] >= ROCK_DEPOSIT) { deposits++; if (world.height[t] >= 5) highDeposits++; }
  const i = tileI(t), j = tileJ(t);
  for (const v of [i < 63 ? t + 1 : -1, j < 63 ? t + 64 : -1]) if (v >= 0 && world.terrain[v] !== WATER_T && world.height[t] < MOUNTAIN_LEVEL && world.height[v] < MOUNTAIN_LEVEL && isCliff(t, v)) steep++;
  if (Math.abs(i - tileI(world.gate)) + Math.abs(j - tileJ(world.gate)) <= 3 && world.height[t] !== 0) gateFlat = false;
}
check('relief: water only at level 0, no cliff below the rock, the gate in a flat valley', waterUp === 0 && steep === 0 && gateFlat);
check('relief: deposits crowd the mountains (' + highDeposits + ' of ' + deposits + ' on ' + high + ' of ' + land + ' tiles)', deposits >= 4 && highDeposits / deposits > high / land);
console.log('hamlet relief: seed 11, 64 x 64, hex levels, ~ water, * deposit');
for (let j = 0; j < 64; j++) { let row = ''; for (let i = 0; i < 64; i++) { const t = j * 64 + i; row += world.terrain[t] === WATER_T ? '~' : world.rock[t] >= ROCK_DEPOSIT ? '*' : world.height[t].toString(16); } console.log('hamlet relief: ' + row); }

// rules on a hand-made relief: a flat 12 x 12 village, then heights set tile by tile
generate(7916, 12);
const lay = (): void => { world.height.fill(0); for (let t = 0; t < 144; t++) { world.tree[t] = 0; world.rock[t] = 0; world.terrain[t] = GRASS_T; world.road[t] = 0; world.build[t] = -1; } world.road[world.gate] = 1; };
lay(); rich();
buildRoad([at(3, 5), at(3, 6), at(3, 7)]);
world.height[at(5, 5)] = 1;
check('relief: heightAt, a slope is a step of one level', heightAt(at(5, 5)) === 1 && isSlope(at(4, 5)) && isSlope(at(5, 5)) && !isCliff(at(5, 5), at(4, 5)) && !isSlope(at(1, 1)) && !isCliff(at(1, 1), at(2, 1)));
world.height[at(8, 8)] = 2;
check('relief: a cliff is two levels or more, both ways', isCliff(at(8, 8), at(9, 8)) && isCliff(at(9, 8), at(8, 8)) && !isSlope(at(9, 8)));
world.height[at(4, 5)] = 1;
check('relief: no house on a slope', checkTool(TOOL_HOUSE, at(2, 5)) === PLACE_OK && checkTool(TOOL_HOUSE, at(4, 6)) === PLACE_UNEVEN && checkTool(TOOL_HOUSE, at(4, 5)) === PLACE_UNEVEN);
check('relief: no house beside a cliff', checkTool(TOOL_HOUSE, at(9, 8)) === PLACE_UNEVEN && checkTool(TOOL_HOUSE, at(8, 8)) === PLACE_UNEVEN);
lay(); buildRoad([at(8, 2)]);
for (const t of [at(9, 2), at(9, 3), at(10, 2), at(10, 3), at(9, 1), at(9, 4), at(10, 1), at(10, 4), at(11, 2), at(11, 3), at(8, 2), at(8, 3), at(8, 1), at(8, 4)]) world.height[t] = 1;
check('relief: a flat plateau takes a house even above the valley', checkTool(TOOL_HOUSE, at(9, 2)) === PLACE_OK && checkTool(TOOL_ROAD, at(9, 3)) === PLACE_OK);
lay();
for (const t of [at(1, 9), at(1, 10), at(2, 9), at(2, 10), at(0, 9), at(0, 10), at(1, 8), at(1, 11)]) world.height[t] = MOUNTAIN_LEVEL;
check('relief: the rock of the mountains takes neither house nor road', checkTool(TOOL_HOUSE, at(1, 9)) === PLACE_ROCKY && checkTool(TOOL_ROAD, at(1, 9)) !== PLACE_OK && !isWalkable(at(1, 9)) && planRoad(at(1, 3), at(1, 9), false, false).blocked >= 0);
lay();
for (let i = 0; i < 12; i++) world.height[at(i, 2)] = Math.min(3, i);                           // a ramp: one level a tile up to level 3
const noCliffs = (tiles: number[]): boolean => { for (let k = 1; k < tiles.length; k++) if (isCliff(tiles[k - 1], tiles[k])) return false; return true; };
const rampPlan = planRoad(at(0, 2), at(8, 2), false, false);
check('relief: a road climbs one level a tile', rampPlan.blocked < 0 && rampPlan.tiles.length === 9);
world.height[at(1, 5)] = 1;
check('relief: a road on a slope costs 1.5 times', costOf([at(8, 8), at(9, 8), at(10, 8), at(11, 8)])[PLANK] === 2 && costOf([at(1, 5), at(0, 5), at(2, 5), at(1, 4)])[PLANK] === 3);
world.height[at(5, 2)] = 5;
check('relief: no road across a cliff', planRoad(at(0, 2), at(8, 2), false, false).blocked === at(5, 2) && noCliffs(planRoad(at(0, 2), at(8, 2), false, true).fresh));
lay();
for (let j = 0; j < 12; j++) world.height[at(6, j)] = 2;                                         // a wall across the map
const wall = fieldFrom(at(3, 5));
check('relief: a walker does not cross a cliff', wall.dist[at(9, 5)] >= UNREACHABLE && wall.dist[at(5, 5)] < UNREACHABLE);
world.height[at(6, 8)] = 1; world.height[at(5, 8)] = 1; world.height[at(7, 8)] = 1;
const gapDist = fieldFrom(at(3, 5)).dist[at(9, 5)];                                                   // the Field is one shared object: read each search before the next
lay();
const open = fieldFrom(at(3, 5));
const openDist = open.dist[at(9, 5)], openStep = open.dist[at(4, 5)];
check('relief: a ramp in the wall lets him through, the long way', gapDist < UNREACHABLE && gapDist > openDist);
world.height[at(4, 5)] = 1;
check('relief: a step up a slope costs 1.5 times', fieldFrom(at(3, 5)).dist[at(4, 5)] === openStep * 1.5);
const mover = (): Person => { const m = new Person(); m.x = tileX(at(3, 5)); m.y = tileY(at(3, 5)); m.path = [at(4, 5)]; m.step = 0; return m; };
lay(); const levelWalker = mover(); walk(levelWalker, .2, 2);
world.height[at(4, 5)] = 1; const slopeWalker = mover(); walk(slopeWalker, .2, 2);
check('relief: walkers are slower on a slope', slopeWalker.x > tileX(at(3, 5)) && slopeWalker.x - tileX(at(3, 5)) < (levelWalker.x - tileX(at(3, 5))) * (SLOPE_SPEED + .01));
// bridges: flat banks only
lay(); world.terrain[at(5, 6)] = WATER_T; world.terrain[at(6, 6)] = WATER_T;
check('relief: a bridge between flat banks', planRoad(at(2, 6), at(9, 6), false, false).blocked < 0);
world.height[at(3, 6)] = 1;
check('relief: no bridge from a sloping bank', planRoad(at(2, 6), at(9, 6), false, false).blocked >= 0);
lay(); world.terrain[at(5, 6)] = WATER_T; world.terrain[at(6, 6)] = WATER_T;
for (let i = 7; i < 12; i++) for (let j = 4; j < 9; j++) world.height[at(i, j)] = 1;
check('relief: no bridge between banks of two levels', planRoad(at(2, 6), at(9, 6), false, false).blocked >= 0);
// the save keeps the heights; one from before them loads flat
// ---- the market keeps a stock (fetched from the stores, handed out by its vendor), services of religion and entertainment, the fourth housing level, the save of orders and turns ----
{
  generate(1234, 16); rich(); clearRow();
  const SM = economy.resourceOf('smoked_meat'), BR = economy.resourceOf('bread'), MKT = economy.serviceOf('market'), RELIGION = economy.serviceOf('religion'), FUN = economy.serviceOf('entertainment');
  setStock(SM, 40); setStock(BR, 40);
  for (const i of [2, 4]) { const h = addBuilding(HOUSE, at(i, 7)); for (let k = 0; k < 4; k++) createResident(h); world.buildings[h].residents = 4; world.buildings[h].timer = 1e9; }
  const mk = addBuilding(economy.typeOf('market'), at(6, 7)), shop = world.buildings[mk], h1 = world.buildings[world.build[at(2, 7)]], h2 = world.buildings[world.build[at(4, 7)]];
  check('market: a new market is empty and covers no house', shop.stock.every((v) => v === 0) && h1.cover[MKT] === 0 && h2.cover[MKT] === 0);
  run(90);
  check('market: its buyer fetched goods from the stores (the stock left them)', shop.stock[SM] + shop.stock[BR] > 0 && world.stock[SM] + world.stock[BR] < 80);
  check('market: the vendor handed meals to the houses it passed, from the market and no store', h1.cover[MKT] > 0 && h1.fed[SM] + h1.fed[BR] > 0 && h2.fed[SM] + h2.fed[BR] > 0 && world.stock[SM] + world.stock[BR] + shop.stock[SM] + shop.stock[BR] >= 78 - 2 * 4);
  setStock(SM, 0); setStock(BR, 0); shop.stock.fill(0); h1.cover[MKT] = 0; h2.cover[MKT] = 0; h1.fed.fill(0); h2.fed.fill(0);
  run(60);
  check('market: with nothing to sell it covers nothing and feeds nobody', h1.cover[MKT] === 0 && h2.cover[MKT] === 0 && h1.fed.every((v) => v === 0));
  setStock(BR, 30); run(60);
  check('market: stocked again from the stores, it covers again', h1.cover[MKT] > 0 && shop.stock[BR] > 0);
  // religion and entertainment: a chapel's walker covers the houses it passes; the festival ground likewise; the tavern covers the houses within four tiles
  const chapel = addBuilding(economy.typeOf('chapel'), at(5, 9)), fest = addBuilding(economy.typeOf('theatre'), at(3, 9));
  for (const t of [at(5, 9), at(3, 9)]) { world.tree[t] = 0; }
  for (const i of [6, 7]) { const h = addBuilding(HOUSE, at(i, 9)); world.tree[at(i, 9)] = 0; for (let k = 0; k < 2; k++) createResident(h); world.buildings[h].residents = 2; world.buildings[h].timer = 1e9; }
  run(120);
  check('services: a chapel covers the houses on its round with religion, the festival ground with entertainment', world.buildings[chapel].alive && h1.cover[RELIGION] > 0 && h1.cover[FUN] > 0 && h2.cover[RELIGION] > 0);
  check('services: religion and entertainment are services of economy.json with their buildings', RELIGION >= 0 && FUN >= 0 && economy.buildings[economy.typeOf('chapel')].service!.service === RELIGION && economy.buildings[economy.typeOf('theatre')].service!.service === FUN && economy.buildings[economy.typeOf('tavern')].service!.service === FUN);
  // the fourth level (Manoir) asks religion and entertainment on top of market, water, three foods and appeal 4
  generate(1234, 16); rich();
  const hs3 = economy.buildings[HOUSE].housing!, villa = addBuilding(HOUSE, at(5, 5)), vb = world.buildings[villa];
  vb.residents = 0; vb.level = 2; world.appeal[at(5, 5)] = 4;
  for (let k = 0; k < 3; k++) vb.fed[hs3.eats[k]] = 99;
  for (const sv of [MKT, economy.serviceOf('water'), FUN]) vb.cover[sv] = 9;
  check('housing: a fourth level exists, and the report names religion as what is missing', hs3.levels.length === 4 && housingReport(vb).missing.length === 1 && housingReport(vb).missing[0].id === 'religion' && housingReport(vb).text.indexOf('culte') >= 0);
  dailyHousing(); dailyHousing();
  check('housing: without religion the house stays a Demeure', vb.level === 2);
  vb.cover[RELIGION] = 9; dailyHousing(); dailyHousing();
  check('housing: with all four services, three foods and appeal 4 it becomes a Manoir (capacity 8) and is the top', vb.level === 3 && capacityOf(vb) === 8 && housingReport(vb).top);
  // the save keeps the storage orders and the roamer's turn counter; H20 saves (no orders, no turns) still load
  const hall = world.buildings.findIndex((b) => b.type === economy.hall);
  setOrder(hall, WOOD, ORDER_REFUSE); vb.turn = 7;
  const kept = snapshot(), hashKept = stateHash();
  world.buildings[hall].orders = []; vb.turn = 0;
  check('save: orders and turns round-trip', restore(kept) && snapshot() === kept && stateHash() === hashKept && orderOf(world.buildings[hall], WOOD) === ORDER_REFUSE && world.buildings[world.build[at(5, 5)]].turn === 7);
  const old = kept.split(';'); old[0] = 'H20';
  old[4] = old[4].split(',').map((e) => e.split('.').slice(0, 9).join('.')).join(',');
  check('save: an H20 save loads with no orders and turn 0', restore(old.join(';')) && world.buildings[world.build[at(5, 5)]].turn === 0 && orderOf(world.buildings[hall], WOOD) === ORDER_ACCEPT);
}
// ---- labour pool below 100: the unemployed are the pool's adults without a job, never the whole village; a scarce pool starts every workshop ----
{
  const keepShare = economy.sim.labourShare;
  economy.sim.labourShare = 60;
  generate(1234, 16); rich(); clearRow();
  for (const t of [at(5, 9), at(3, 9), at(6, 7), at(2, 7), at(4, 7)]) { world.tree[t] = 0; world.rock[t] = 0; }
  for (const i of [2, 4, 6]) { const h = addBuilding(HOUSE, at(i, 7)); for (let k = 0; k < 2; k++) createResident(h); world.buildings[h].residents = 2; world.buildings[h].timer = 1e9; }
  const hutA = addBuilding(economy.typeOf('lumberhut'), at(3, 9)), hutB = addBuilding(economy.typeOf('lumberhut'), at(5, 9)), mill = addBuilding(economy.typeOf('sawmill'), at(7, 9));
  world.tree[at(7, 9)] = 0; world.rock[at(7, 9)] = 0;
  run(10);
  check('labour 60: the pool of three is spread, one hand to each workshop before a second to any', labourStats().pool === 3 && [hutA, hutB, mill].every((id) => world.buildings[id].workers === 1));
  dailyMood();
  const joblessNow = world.people.filter((p) => p.feel === FEEL_JOBLESS).length;
  check('labour 60: nobody outside the pool is jobless (the pool is full: 0 unemployed, 0 %)', labourStats().unemployed === 0 && world.jobless === 0 && joblessNow === 0);
  for (const i of [1, 3, 5, 7]) { world.tree[at(i, 7)] = 0; world.rock[at(i, 7)] = 0; const h = addBuilding(HOUSE, at(i, 7)); for (let k = 0; k < 3; k++) createResident(h); world.buildings[h].residents = 3; world.buildings[h].timer = 1e9; }
  run(10); dailyMood();
  const lost = labourStats();
  check('labour 60: with eighteen people the unemployed are the pool without a place, not every idle person', lost.unemployed >= 1 && lost.unemployed === 2 && world.jobless === Math.round(100 * 2 / 18) && world.people.filter((p) => p.feel === FEEL_JOBLESS).length === lost.unemployed);
  economy.sim.labourShare = keepShare;
}
generate(21, 32, MOUNTAINS);
world.height[at(4, 4)] = 3;
const withRelief = snapshot(), savedHeights = world.height.slice();
generate(1, 24, new TerrainParams());
check('relief: the save round-trips the heights', restore(withRelief) && world.size === 32 && world.height.join('') === savedHeights.join('') && Math.max(...world.height) > 0 && world.height[at(4, 4)] === 3);
const fields = withRelief.split(';');
fields[0] = 'H19'; fields.pop(); fields[10] = fields[10].split(',').slice(0, 10).join(',');
check('relief: a save from before the heights loads flat', restore(fields.join(';')) && world.size === 32 && world.height.every((v) => v === 0) && world.params.relief === 0);
console.log('hamlet rules: reliefsavehash ' + (stateHash() >>> 0));
console.log(failures === 0 ? 'hamlet rules: ALL PASS' : 'hamlet rules: ' + failures + ' FAIL');
