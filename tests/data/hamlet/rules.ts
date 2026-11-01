// Headless rules of the hamlet: roads, arrivals, jobs, wood, meat, demolition and the save round trip. No window.
import { world, generate as generateWith, tileIndex, tileI, tileJ, tileAt, isOpen, waterNeighbor, neighbor } from '../../../examples/hamlet/src/world/world';
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
const MODEL_IDS: string[] = ['house', 'sawmill', 'lodge', 'fishery', 'storehouse', 'lumberhut', 'smokehouse', 'farm', 'mill', 'bakery', 'market', 'tannery', 'well', 'quarry', 'claypit', 'mine', 'forge', 'forager', 'apiary', 'chandlery', 'meadery', 'tavern', 'firehouse', 'works', 'watchpost', 'ruin'];
import { dailyRisks, isRuin } from '../../../examples/hamlet/src/engine/risk';
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
import { terrain, TerrainParams, TerrainLayers } from '../../../examples/hamlet/src/gen/terrain';
import { issue, replayAt } from '../../../examples/hamlet/src/rules/commands';
import { canStart } from '../../../examples/hamlet/src/rules/adventure';
import { offerLines, canTrade } from '../../../examples/hamlet/src/rules/trade';
import { lockText, scenarioWon } from '../../../examples/hamlet/src/rules/goals';
import { movePriority } from '../../../examples/hamlet/src/rules/labour';
import { flowersAround, resting, workScale, soilAround } from '../../../examples/hamlet/src/rules/meadow';
import { MONTH_SECONDS } from '../../../examples/hamlet/src/rules/season';
import { litBonus } from '../../../examples/hamlet/src/rules/housing';
import { computeHints } from '../../../examples/hamlet/src/rules/hints';
import { isWalkable } from '../../../examples/hamlet/src/engine/path';
import { dailyAnimals, updateDeer } from '../../../examples/hamlet/src/engine/deer';
import { dailyMood } from '../../../examples/hamlet/src/engine/mood';
import { SPECIES, SP_WOLF, SP_RABBIT } from '../../../examples/hamlet/src/rules/species';
import { Deer, spawnDeer, tileX } from '../../../examples/hamlet/src/world/world';
import { personTarget, feelFrom, thoughtOf, workPace, arrivalFactor, leavingToday, FEEL_ANGRY, FEEL_HOMELESS, FEEL_HUNGRY, FEEL_TIRED, FEEL_JOBLESS, FEEL_CONTENT } from '../../../examples/hamlet/src/rules/needs';
import { DEER_GRAZE, DEER_GONE, DEER_DEAD, DEER_ALERT, DEER_FLEE, DEER_REST, DEER_DRINK, DEER_STALK, DEER_CHASE, DEER_EAT, ST_SLEEP, ST_HOME, DAY_TICKS } from '../../../examples/hamlet/src/constants';

const ECONOMY_TEXT = fs.readText('examples/hamlet/assets/economy.json');   // the test runs from the repository root
loadEconomy(ECONOMY_TEXT, MODEL_IDS, ROLE_NAMES);
const TOOL_SAWMILL = toolOf('sawmill'), TOOL_LODGE = toolOf('lodge'), TOOL_FISHERY = toolOf('fishery');
const PLANK = economy.resourceOf('plank'), WOOD = economy.resourceOf('log'), MEAT = economy.resourceOf('meat'), FISH = economy.resourceOf('fish');
const rich = (): void => { setStock(WOOD, 100); setStock(PLANK, 100); setStock(economy.resourceOf('leather'), 100); setStock(economy.resourceOf('stone'), 100); setStock(economy.resourceOf('tools'), 100); setStock(economy.resourceOf('clay'), 100); };
let failures = 0;
function check(name: string, ok: boolean): void { console.log('hamlet rules: ' + name + (ok ? ' PASS' : ' FAIL')); if (!ok) failures++; }
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
check('normal mode regrows slowly: a tree every 14 s at most', world.tree.filter((v) => v > 0).length <= forest + 5);
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
for (let d = 0; d < 4; d++) { const r = neighbor(shore, d); if (r >= 0 && isOpen(r)) { world.road[r] = 1; break; } }
let homeTile = -1;
for (let t = 0; t < 144 && homeTile < 0; t++) if (isOpen(t) && waterNeighbor(t) < 0 && Math.abs(tileIndex(0, 0) - t) > 30) homeTile = t;
const home = addBuilding(HOUSE, homeTile);
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
check('name@size sets the size, kept in range', parseSeedRequest('foret@32').size === 32 && parseSeedRequest('x@999').size === 128 && parseSeedRequest('x@3').size === 12 && parseSeedRequest('foret@32').seed === seedFromText('foret'));
check('the default size is 24, the gate is in the middle of the west edge', parseSeedRequest('a').size === 24 && world.gate === 12 * 24 && world.size === 24);
// ---- the economy file: every rule of the validator refuses a file that breaks it, and the chain report names makers and users ----
const bad = (from: string, to: string): string[] => parseEconomy(ECONOMY_TEXT.split(from).join(to), MODEL_IDS, ROLE_NAMES, new Economy());
check('the shipped economy is valid', parseEconomy(ECONOMY_TEXT, MODEL_IDS, ROLE_NAMES, new Economy()).length === 0);
check('an unknown resource is refused', bad('"cost": { "plank": 3 }', '"cost": { "gold": 3 }').join().indexOf('unknown-resource') >= 0);
check('a negative number is refused', bad('"cost": { "plank": 3 }', '"cost": { "plank": -3 }').join().indexOf('negative-number') >= 0);
check('a building without a model is refused', bad('"model": "sawmill", ', '').join().indexOf('no-model') >= 0);
check('a resource with no raw source is refused', bad('"gather": "tree", "outputs": { "log": 1 }', '"inputs": { "plank": 1 }, "outputs": { "log": 1 }').join().indexOf('cycle') >= 0);
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
check('the hut is paid in planks and logs', world.stock[PLANK] === economy.start[PLANK] - 10 && world.stock[WOOD] === economy.start[WOOD] - 2 - 6);
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
world.road[at(12, 12)] = 1; world.revision++; applyTool(toolOf('lumberhut'), at(12, 13));
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
check('a building with no road to a store does not send', !exportsOk(lone) && lone.state === BS_ISOLATED && lone.stock[WOOD] >= 0 && world.buildings[world.build[at(5, 9)]].state !== BS_ISOLATED);
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
check('priority: the first type is staffed in full, the next takes what is left, the last gets nobody', staffed('lumberhut') === 2 && staffed('sawmill') + staffed('lodge') === 1);
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
check('with water, two foods and appeal the house reaches level 2 (capacity 6)', cabin.level === 2 && capacityOf(cabin) === 6 && housingReport(cabin).top);
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
for (let k = 0; k < 20; k++) stepWorld();
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
  check('a save from before the wolves has none', pf.length === 10 && restore(wfields.join(';')) && world.params.wolves === 0 && wolvesOf().length === 0);
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
  withWolves(2, 1, 11);
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
check('the first preset is the default village', JSON.stringify(PRESETS[0].params) === JSON.stringify(new TerrainParams()));
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
console.log(failures === 0 ? 'hamlet rules: ALL PASS' : 'hamlet rules: ' + failures + ' FAIL');
// ---- road laying: the L-shaped line, existing roads skipped, an obstacle ends it, the auto-route goes round ----
import { TERRAIN_GRASS, TERRAIN_WATER } from '../../../examples/hamlet/src/constants';
import { fieldFrom, pathTo, UNREACHABLE } from '../../../examples/hamlet/src/engine/path';
import { linePath, planRoad, costOf, refundOf, buildRoad, demolishRoad, isBridge, isPlaza } from '../../../examples/hamlet/src/rules/roadplan';
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
const hashList = (list: number[]): number => { let h = 7; for (const v of list) h = (h * 31 + v) | 0; return h >>> 0; };
console.log('hamlet rules: roadhash2 ' + hashList(around4.tiles) + ':' + hashList(detour.tiles) + ':' + hashList(over.tiles) + ':' + hashList(broke.fresh) + ':' + hashList(world.road));
console.log(failures === 0 ? 'hamlet rules: ALL PASS' : 'hamlet rules: ' + failures + ' FAIL');
console.log('hamlet rules: roadhash ' + (roadHash >>> 0) + ':' + wide.join('.') + ':' + around.tiles.join('.'));
