// Headless rules of the hamlet: roads, arrivals, jobs, wood, meat, demolition and the save round trip. No window.
import { world, generate, tileIndex, isOpen, waterNeighbor, neighbor } from '../../../examples/hamlet/src/world/world';
import { applyTool, checkTool, addBuilding } from '../../../examples/hamlet/src/rules/build';
import { stepWorld } from '../../../examples/hamlet/src/engine/simulate';
import { updateNature } from '../../../examples/hamlet/src/engine/nature';
import { population, createResident } from '../../../examples/hamlet/src/engine/villagers';
import { seedFromText, parseSeedRequest } from '../../../examples/hamlet/src/world/seed';
import { snapshot, restore } from '../../../examples/hamlet/src/world/save';
import { stateHash } from '../../../examples/hamlet/src/world/hash';
import { TOOL_ROAD, TOOL_HOUSE, TOOL_ERASE, HOUSE, PLACE_NO_WATER, PLACE_OK, PLACE_NO_ROAD, ROLE_LUMBERJACK, ROLE_HUNTER, ROLE_NAMES, ST_TO_SITE, BS_ISOLATED } from '../../../examples/hamlet/src/constants';
import * as fs from 'zinc:fs';
import { economy, loadEconomy, parseEconomy, chainReport, Economy } from '../../../examples/hamlet/src/world/economy';
// the model ids of view/models.ts (a building's model sits at its own index; the scene checks it against the real list at start-up)
const MODEL_IDS: string[] = ['house', 'sawmill', 'lodge', 'fishery', 'storehouse', 'lumberhut', 'smokehouse', 'farm', 'mill', 'bakery', 'market'];
import { setStock } from '../../../examples/hamlet/src/rules/stock';
import { stockWithCarried, exportsOk } from '../../../examples/hamlet/src/engine/transport';
import { adviceLine } from '../../../examples/hamlet/src/hud';
import { toolOf } from '../../../examples/hamlet/src/rules/build';
import { housingReport, capacityOf } from '../../../examples/hamlet/src/rules/housing';
import { movePriority } from '../../../examples/hamlet/src/rules/labour';
import { computeHints } from '../../../examples/hamlet/src/rules/hints';

const ECONOMY_TEXT = fs.readText('examples/hamlet/assets/economy.json');   // the test runs from the repository root
loadEconomy(ECONOMY_TEXT, MODEL_IDS, ROLE_NAMES);
const TOOL_SAWMILL = toolOf('sawmill'), TOOL_LODGE = toolOf('lodge'), TOOL_FISHERY = toolOf('fishery');
const PLANK = economy.resourceOf('plank'), WOOD = economy.resourceOf('log'), MEAT = economy.resourceOf('meat'), FISH = economy.resourceOf('fish');
const rich = (): void => { setStock(WOOD, 100); setStock(PLANK, 100); };
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
check('normal mode does not regrow', world.tree.filter((v) => v > 0).length <= forest);
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
check('name@size sets the size, kept in range', parseSeedRequest('foret@32').size === 32 && parseSeedRequest('x@99').size === 32 && parseSeedRequest('x@3').size === 12 && parseSeedRequest('foret@32').seed === seedFromText('foret'));
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
for (let i = 1; i <= 6; i++) applyTool(TOOL_ROAD, at(i, 8));
check('the start stock lets the player build the first village', applyTool(TOOL_HOUSE, at(2, 7)) === PLACE_OK && applyTool(TOOL_HOUSE, at(4, 7)) === PLACE_OK && applyTool(toolOf('lumberhut'), at(3, 9)) === PLACE_OK && applyTool(TOOL_SAWMILL, at(5, 9)) === PLACE_OK);
check('the hut is paid in planks and logs', world.stock[PLANK] === 0 && world.stock[WOOD] === 20 - 2 - 6);
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
check('without fuel the smokehouse stops and says what it lacks', smoke.state === 2 && smoke.waitFor === WOOD && adviceLine().indexOf('attend') >= 0 && world.stock[SMOKED] + smoke.stock[SMOKED] === 0);
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
const start = allWood(), felled = world.felledCount;
run(80);
check('totals are conserved: every felled tree is one wood somewhere', allWood() === start + world.felledCount - felled && world.felledCount > felled + 5);
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
const stocked = world.stock[SMOKED2] + world.stock[BREAD2];
run(200);
check('the market and a meal lift the house to level 1: capacity grows', cabin.level === 1 && capacityOf(cabin) === 4 && world.stock[SMOKED2] + world.stock[BREAD2] < stocked);
check('level 2 still lacks appeal, and the report says so', cabin.level === 1 && housingReport(cabin).text.indexOf('agréable') >= 0 && computeHints().some((h) => h.kind === 'house_needs' && h.tile === at(2, 7)));
world.appeal[at(2, 7)] = 3;
run(120);
check('with water, two foods and appeal the house reaches level 2 (capacity 6)', cabin.level === 2 && capacityOf(cabin) === 6 && housingReport(cabin).top);
cabin.timer = 0; run(10);
applyTool(TOOL_ERASE, at(5, 9));
run(60);
check('hysteresis: three days without a market do not take the level away', cabin.level === 2);
cabin.cover[WATER] = 9999; world.appeal[at(2, 7)] = 3;
run(240);
check('after the devolve days the house falls back and the surplus residents leave', cabin.level < 2 && cabin.residents <= capacityOf(cabin) && world.people.filter((p) => p.home === hh).length === cabin.residents);
const saved = snapshot();
check('the levels survive a save round trip', restore(saved) && snapshot() === saved);
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
console.log(failures === 0 ? 'hamlet rules: ALL PASS' : 'hamlet rules: ' + failures + ' FAIL');
