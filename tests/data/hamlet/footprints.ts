// Headless proof of the building footprints (economy.json "size": [w, h]): validator, placement rules, demolition, picking, the door, coverage from the edge, house growth and the save. No window.
import { world, generate as generateWith, tileIndex, tileI, tileJ, footprint, rectEdge, growSpot } from '../../../examples/hamlet/src/world/world';
import { applyTool, checkTool, addBuilding, toolOf } from '../../../examples/hamlet/src/rules/build';
import { snapshot, restore } from '../../../examples/hamlet/src/world/save';
import { stateHash } from '../../../examples/hamlet/src/world/hash';
import { stepWorld } from '../../../examples/hamlet/src/engine/simulate';
import { createResident } from '../../../examples/hamlet/src/engine/villagers';
import { doorOf, goalOf, onGateNetwork, edgeTiles } from '../../../examples/hamlet/src/engine/network';
import { spanGap, dailyServices } from '../../../examples/hamlet/src/engine/services';
import { dailyHousing } from '../../../examples/hamlet/src/engine/housing';
import { housingReport, Requirement } from '../../../examples/hamlet/src/rules/housing';
import { planPath, isWalkable } from '../../../examples/hamlet/src/engine/path';
import { setStock } from '../../../examples/hamlet/src/rules/stock';
import { buildRoad } from '../../../examples/hamlet/src/rules/roadplan';
import { TOOL_ROAD, TOOL_HOUSE, TOOL_ERASE, HOUSE, PLACE_OK, PLACE_BLOCKED, PLACE_NO_ROAD, PLACE_UNEVEN, ROLE_NAMES, ROCK_DEPOSIT } from '../../../examples/hamlet/src/constants';
import * as fs from 'zinc:fs';
import { economy, loadEconomy, parseEconomy, Economy, Housing } from '../../../examples/hamlet/src/world/economy';
import { TerrainParams } from '../../../examples/hamlet/src/gen/terrain';
import { Person, Building } from '../../../examples/hamlet/src/world/world';
import { MODEL_IDS } from '../../../examples/hamlet/src/view/models';

const TEXT = fs.readText('examples/hamlet/assets/economy.json');          // run from the repository root
loadEconomy(TEXT, MODEL_IDS, ROLE_NAMES);
let failures = 0;
function check(name: string, ok: boolean): void { console.log('hamlet footprints: ' + name + (ok ? ' PASS' : ' FAIL')); if (!ok) failures++; }
const at = (i: number, j: number): number => tileIndex(i, j);
const T = (id: string): number => toolOf(id), type = (id: string): number => economy.typeOf(id);
function fresh(): void {
  const p = new TerrainParams(); p.biomes = 0;
  generateWith(3, 24, p);
  world.autosave = false; world.progression = false; world.unlocked.fill(1);
  for (let t = 0; t < world.tree.length; t++) { world.tree[t] = 0; world.rock[t] = 0; world.deco[t] = 0; }
  for (let t = 0; t < world.height.length; t++) world.height[t] = 0;
  for (const k of [economy.resourceOf('plank'), economy.resourceOf('log'), economy.resourceOf('leather'), economy.resourceOf('stone')]) setStock(k, 500);
}
const roadRow = (j: number, from: number, to: number): void => { for (let i = from; i <= to; i++) applyTool(TOOL_ROAD, at(i, j)); };

// the file: sizes read, and the validator
check('the storehouse is 2 x 2, the sawmill 2 x 1, the farm 3 x 3, the market 2 x 2, the theatre 3 x 3, the chapel 2 x 1', (() => {
  const s = (id: string): string => economy.buildings[type(id)].w + 'x' + economy.buildings[type(id)].h;
  return s('storehouse') === '2x2' && s('sawmill') === '2x1' && s('farm') === '3x3' && s('market') === '2x2' && s('theatre') === '3x3' && s('chapel') === '2x1' && s('mill') === '2x2' && s('tavern') === '2x2' && s('lumberhut') === '1x1';
})());
check('the Manoir needs 2 x 2, the other levels one tile', (() => { const l = (economy.buildings[HOUSE].housing as Housing).levels; return l[0].w === 1 && l[1].w === 1 && l[2].w === 1 && l[3].w === 2 && l[3].h === 2; })());
const bad = (from: string, to: string): string[] => parseEconomy(TEXT.split(from).join(to), MODEL_IDS, ROLE_NAMES, new Economy());
check('bad-size: a zero, a string, three numbers, a fraction and more than 4 are refused', bad('"size": [3, 3]', '"size": [0, 3]').some((e: string): boolean => e.startsWith('bad-size')) && bad('"size": [3, 3]', '"size": "big"').some((e: string): boolean => e.startsWith('bad-size')) && bad('"size": [3, 3]', '"size": [3, 3, 3]').some((e: string): boolean => e.startsWith('bad-size')) && bad('"size": [3, 3]', '"size": [1.5, 3]').some((e: string): boolean => e.startsWith('bad-size')) && bad('"size": [3, 3]', '"size": [5, 3]').some((e: string): boolean => e.startsWith('bad-size')));
check('a level without a size keeps the one before; a level may not shrink', bad('"label": "Maison", "capacity": 4', '"label": "Maison", "size": [2, 2], "capacity": 4').length === 0 && bad('"label": "Demeure", "capacity": 6', '"label": "Demeure", "size": [1, 1], "capacity": 6').length === 0 && bad('"label": "Maison", "capacity": 4', '"label": "Maison", "size": [2, 2], "capacity": 4').length === 0 && bad('"label": "Demeure", "capacity": 6', '"label": "Demeure", "size": [3, 3], "capacity": 6').some((e: string): boolean => e.startsWith('bad-size')));
check('the shipped file has no error', parseEconomy(TEXT, MODEL_IDS, ROLE_NAMES, new Economy()).length === 0);

// the hall: its 2 x 2 footprint stands above the gate, the gate road is its door
fresh();
{
  const hall = world.buildings[world.build[world.gate - 24 * 2]];
  check('the hall is a 2 x 2 above the entrance, every one of its tiles points to it', hall.w === 2 && hall.h === 2 && footprint(hall).length === 4 && footprint(hall).every((t: number): boolean => world.build[t] === world.buildings.indexOf(hall)) && doorOf(hall) === world.gate && onGateNetwork(hall));
}

// placement
fresh();
roadRow(10, 2, 14);
const sh = T('storehouse');
check('a storehouse beside the road on all-free ground is allowed', checkTool(sh, at(4, 8)) === PLACE_OK);
check('the road may touch any edge tile (the second row)', (() => { world.road[at(10, 5)] = 1; const ok = checkTool(sh, at(8, 4)); world.road[at(10, 5)] = 0; return ok === PLACE_OK && checkTool(sh, at(8, 2)) === PLACE_NO_ROAD; })());
check('without a road on any edge tile: no road', checkTool(sh, at(4, 5)) === PLACE_NO_ROAD);
check('a tree on the farthest tile blocks it', (() => { world.tree[at(5, 9)] = 1; const c = checkTool(sh, at(4, 8)); world.tree[at(5, 9)] = 0; return c === PLACE_BLOCKED; })());
check('a rock, a road and a deposit block it too', (() => { world.rock[at(5, 8)] = 1; const a = checkTool(sh, at(4, 8)); world.rock[at(5, 8)] = 0; world.rock[at(4, 9)] = ROCK_DEPOSIT; const b = checkTool(sh, at(4, 8)); world.rock[at(4, 9)] = 0; return a === PLACE_BLOCKED && b === PLACE_BLOCKED && checkTool(sh, at(4, 9)) === PLACE_BLOCKED; })());
check('the footprint stays on the map', checkTool(sh, at(23, 8)) === PLACE_BLOCKED && checkTool(toolOf('farm'), at(22, 8)) === PLACE_BLOCKED);
check('a step on any tile of the footprint is uneven', (() => { world.height[at(5, 9)] = 1; const c = checkTool(sh, at(4, 8)); world.height[at(5, 9)] = 0; return c === PLACE_UNEVEN; })());
check('a building on top of another is refused', (() => { applyTool(T('lumberhut'), at(5, 9)); return checkTool(sh, at(4, 8)) === PLACE_BLOCKED; })());
applyTool(TOOL_ERASE, at(5, 9));
const before = world.stock[economy.resourceOf('plank')];
check('placing it pays once and claims four tiles', applyTool(sh, at(4, 8)) === PLACE_OK && world.stock[economy.resourceOf('plank')] < before + 1 && [at(4, 8), at(5, 8), at(4, 9), at(5, 9)].every((t: number): boolean => world.build[t] === world.build[at(4, 8)] && world.build[t] >= 0));
const store = world.buildings[world.build[at(4, 8)]];
check('its road is its door: pathing goes to a road tile beside it, not the anchor', doorOf(store) === at(4, 10) && goalOf(store) === at(4, 10) && isWalkable(goalOf(store)) && onGateNetwork(store) === false);
check('a walker finds a path to the door of a building whose road is on the far side', (() => { roadRow(10, 2, 14); const p = new Person(); p.x = 0; p.y = 0; const start = at(12, 10); const t = start; p.x = (12 + .5) * 2 - world.half; p.y = (10 + .5) * 2 - world.half; return planPath(p, goalOf(store)) && p.path.length > 0 && p.path[p.path.length - 1] === goalOf(store) && t >= 0; })());
check('picking: any tile of it names it, erasing from the far tile demolishes it whole', (() => {
  const id = world.build[at(5, 9)];
  const named = id >= 0 && id === world.build[at(4, 8)];
  const code = applyTool(TOOL_ERASE, at(5, 9));
  return named && code === PLACE_OK && !world.buildings[id].alive && [at(4, 8), at(5, 8), at(4, 9), at(5, 9)].every((t: number): boolean => world.build[t] === -1);
})());
check('the ground is free again: it can be placed there', checkTool(sh, at(4, 8)) === PLACE_OK);

// the edge helpers
check('rectEdge of a 2 x 1 is its six neighbours; of a 1 x 1 the four in order +x -x +y -y', rectEdge(5, 5, 2, 1).length === 6 && rectEdge(5, 5, 1, 1).join() === [at(6, 5), at(4, 5), at(5, 6), at(5, 4)].join());
check('spanGap: the distance between nearest tiles of two spans', spanGap(3, 1, 3, 1) === 0 && spanGap(6, 1, 3, 1) === 3 && spanGap(1, 1, 3, 2) === 2 && spanGap(4, 1, 3, 2) === 0 && spanGap(5, 1, 3, 2) === 1);

// coverage from the edge: a standing service building of 2 x 2 reaches a house by the distance from its nearest tile (the tavern is a service building of a radius)
fresh();
{
  roadRow(10, 2, 14);
  const r = economy.buildings[type('tavern')].service;
  const tv = addBuilding(type('tavern'), at(8, 8));
  world.buildings[tv].workers = 2;
  const reach = r === null ? 0 : r.radius;
  const house = addBuilding(HOUSE, at(Math.min(20, 8 + 1 + reach), 8)), far = addBuilding(HOUSE, at(Math.min(22, 8 + 2 + reach), 9));
  const s = r === null ? -1 : r.service;
  dailyServices();
  check('a house within the radius of the footprint edge is covered, one tile farther is not', s >= 0 && reach > 0 && world.buildings[house].cover[s] > 0 && world.buildings[far].cover[s] === 0 || reach === 0);
}

// growth: the Manoir takes 2 x 2 when the ground around is free, and waits when it is not
fresh();
{
  roadRow(10, 2, 14);
  const h = addBuilding(HOUSE, at(5, 9));
  const b = world.buildings[h];
  b.level = 2;
  const lv3 = (economy.buildings[HOUSE].housing as Housing).levels[3];
  check('a house at level 2 can grow into free ground', growSpot(b, lv3.w, lv3.h) >= 0);
  // evolve for real: all needs met by hand
  b.level = 2;
  for (const k of (economy.buildings[HOUSE].housing as Housing).levels[3].services) b.cover[k] = 9;
  const eat = (economy.buildings[HOUSE].housing as Housing).eats; for (let k = 0; k < 3; k++) b.fed[eat[k]] = 9;
  for (let t = 0; t < world.appeal.length; t++) world.appeal[t] = 8;
  dailyHousing(); dailyHousing(); dailyHousing();
  check('the Manoir grows to 2 x 2: level 3, four tiles pointing at it, no tile left behind', b.level === 3 && b.w === 2 && b.h === 2 && footprint(b).every((t: number): boolean => world.build[t] === h) && footprint(b).length === 4);
  const tiles = footprint(b);
  b.cover.fill(0);
  for (let k = 0; k < 6; k++) dailyHousing();
  check('it falls back to level 2 and gives the tiles back (1 x 1 on its anchor)', b.level < 3 && b.w === 1 && b.h === 1 && world.build[at(b.i, b.j)] === h && tiles.filter((t: number): boolean => world.build[t] === h).length === 1);
}
fresh();
{
  roadRow(10, 2, 14);
  const h = addBuilding(HOUSE, at(5, 9)), b = world.buildings[h];
  b.level = 2;
  for (const u of [at(6, 9), at(6, 8), at(5, 8), at(4, 9), at(4, 8), at(6, 10)]) world.tree[u] = 1;      // trees around: no 2 x 2 free
  const lv3 = (economy.buildings[HOUSE].housing as Housing).levels[3];
  check('with trees on every side it cannot grow', growSpot(b, lv3.w, lv3.h) === -1);
  check('and its report names the space', (() => { b.level = 2; const r = housingReport(b); return r.next.some((q: Requirement): boolean => q.id === 'space' && !q.met); })());
}

// the save: the anchor is kept and the grid points to it from every tile; an old save with something in the way loads 1 x 1
fresh();
roadRow(10, 2, 14);
applyTool(T('storehouse'), at(4, 8)); applyTool(T('farm'), at(8, 6)); applyTool(T('lumberhut'), at(12, 9)); applyTool(T('chapel'), at(10, 8));
for (let k = 0; k < 40; k++) stepWorld();
const text = snapshot(), listed = world.buildings.filter((b: Building): boolean => b.alive).map((b: Building): string => b.type + ':' + b.i + ':' + b.j + ':' + b.w + 'x' + b.h).join();
check('the save lists a bigger building once, by its anchor', text.split(';')[4].split(',').filter((e: string): boolean => e.split('.')[0] === String(type('storehouse'))).length === 2 && text.indexOf('.' + at(4, 8) + '.') > 0);
const ok = restore(text);
check('it restores: same buildings, same footprints, same grid', ok && world.buildings.filter((b: Building): boolean => b.alive && economy.buildings[b.type].w * economy.buildings[b.type].h > 1).every((b: Building): boolean => footprint(b).every((t: number): boolean => world.build[t] === world.buildings.indexOf(b))));
check('every building keeps its type, anchor and size', (() => { const now = world.buildings.filter((b: Building): boolean => b.alive).map((b: Building): string => b.type + ':' + b.i + ':' + b.j + ':' + b.w + 'x' + b.h).join(); if (now !== listed) console.log(listed + ' / ' + now); return now === listed; })());
{
  fresh();
  roadRow(10, 2, 14);
  addBuilding(type('lumberhut'), at(5, 8), 1, 1);                    // an older village: the next tile holds another building
  addBuilding(type('sawmill'), at(4, 8), 1, 1);
  const old = 'H21' + snapshot().slice(3);               // the version before the footprints
  const good = restore(old);
  const saw = world.buildings.filter((b: Building): boolean => b.type === type('sawmill'))[0];
  check('an old save with a building where the footprint would go loads, the sawmill stays 1 x 1 and nothing is lost', good && saw.w === 1 && saw.h === 1 && world.buildings.filter((b: Building): boolean => b.alive && b.type === type('lumberhut')).length === 1 && world.build[at(5, 8)] >= 0 && world.build[at(4, 8)] >= 0 && world.build[at(5, 8)] !== world.build[at(4, 8)]);
}
{
  fresh();
  const p = new TerrainParams(); p.biomes = 0; generateWith(3, 24, p);                  // the rocks the generator puts back when a save loads: take two free tiles of its own
  let spot = -1;
  for (let i = 2; i < 20 && spot < 0; i++) if (world.terrain[at(i, 9)] === 0 && world.terrain[at(i + 1, 9)] === 0 && world.rock[at(i, 9)] === 0 && world.rock[at(i + 1, 9)] === 0) spot = at(i, 9);
  fresh();
  roadRow(10, 2, 14);
  addBuilding(type('sawmill'), spot, 1, 1);                           // the next tile is free: it takes its 2 x 1 on load
  const good = restore('H21' + snapshot().slice(3));
  const saw = world.buildings.filter((b: Building): boolean => b.type === type('sawmill'))[0];
  check('an old 1 x 1 save with room takes the footprint of today', good && spot >= 0 && saw.w === 2 && saw.h === 1 && world.build[spot + 1] === world.build[spot]);
}

// a village of footprints runs: a few days of play, the same hash twice
function play(): number {
  fresh();
  roadRow(10, 1, 14);
  applyTool(T('storehouse'), at(4, 8)); applyTool(T('lumberhut'), at(8, 9));
  for (let i = 0; i < 3; i++) applyTool(TOOL_HOUSE, at(2 + i * 2, 11));
  for (let k = 0; k < 32 * 60; k++) stepWorld();
  return stateHash();
}
const a = play(), b2 = play();
check('a village with footprints replays to the same hash', a === b2);
console.log('hamlet footprints: hash ' + a);
console.log(failures === 0 ? 'hamlet footprints: ALL PASS' : 'hamlet footprints: ' + failures + ' FAILED');
