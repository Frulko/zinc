// Headless proofs of the attention hints: one tiny constructed village per kind. No window.
import { world, generate, tileIndex, Person } from '../../../examples/hamlet/src/world/world';
import { addBuilding } from '../../../examples/hamlet/src/rules/build';
import { computeHints, Hint, MAX_HINTS, HINT_NO_ROAD, HINT_IDLE_WORKERS, HINT_NO_INPUT, HINT_FULL_OUTPUT, HINT_DELIVER_HERE, HINT_BUILD_NEXT } from '../../../examples/hamlet/src/rules/hints';
import { economy, loadEconomy } from '../../../examples/hamlet/src/world/economy';
import { MODEL_IDS } from '../../../examples/hamlet/src/view/models';
import { ROLE_NAMES, ROLE_SETTLER, BS_WAITING, BS_FULL } from '../../../examples/hamlet/src/constants';
import * as fs from 'zinc:fs';

loadEconomy(fs.readText('examples/hamlet/assets/economy.json'), MODEL_IDS, ROLE_NAMES);   // the test runs from the repository root
const HOUSE_TYPE = economy.typeOf('house'), SAWMILL = economy.typeOf('sawmill'), WOOD = economy.resourceOf('wood');
let failures = 0;
function check(name: string, ok: boolean): void { console.log('hamlet hints: ' + name + (ok ? ' PASS' : ' FAIL')); if (!ok) failures++; }
const kinds = (): string[] => computeHints().map((h: Hint): string => h.kind);
const has = (kind: string, tile: number): boolean => computeHints().some((h: Hint): boolean => h.kind === kind && h.tile === tile);
function fresh(): void {
  world.autosave = false; generate(7916, 12);
  for (let t = 0; t < world.size * world.size; t++) { world.tree[t] = 0; world.rock[t] = 0; }
}
const at = (i: number, j: number): number => tileIndex(i, j);

fresh();
check('a new village points at the gate', has(HINT_BUILD_NEXT, world.gate) && computeHints().length === 1);

const lone = at(6, 3);
const house = addBuilding(HOUSE_TYPE, lone);
check('a building with no road gets no_road, and the first-run hint is gone', has(HINT_NO_ROAD, lone) && kinds().indexOf(HINT_BUILD_NEXT) < 0);
world.road[at(6, 4)] = 1;
check('the hint disappears when the road is there', !has(HINT_NO_ROAD, lone));

const mill = addBuilding(SAWMILL, at(8, 3));
world.road[at(8, 4)] = 1;
const b = world.buildings[mill];
b.state = BS_WAITING; b.waitFor = WOOD; world.stock[WOOD] = 0;
check('a producer waiting for something no store holds gets no_input', has(HINT_NO_INPUT, at(8, 3)));
world.stock[WOOD] = 5;
check('the same wait with the resource in a store is deliver_here', has(HINT_DELIVER_HERE, at(8, 3)) && !has(HINT_NO_INPUT, at(8, 3)));
b.state = BS_FULL; b.waitFor = -1;
check('a full producer gets full_output', has(HINT_FULL_OUTPUT, at(8, 3)));
b.state = 0;
check('a calm producer gets nothing', !has(HINT_FULL_OUTPUT, at(8, 3)) && !has(HINT_NO_INPUT, at(8, 3)));

const idle = new Person();
idle.role = ROLE_SETTLER; idle.job = -1; idle.home = house; world.people.push(idle);
check('an idle resident and a site with no workers get idle_workers on the site', has(HINT_IDLE_WORKERS, at(8, 3)));
b.workers = economy.buildings[SAWMILL].workers;
check('with the site staffed the idle resident points at its house', has(HINT_IDLE_WORKERS, lone) && !has(HINT_IDLE_WORKERS, at(8, 3)));

fresh();
for (let k = 0; k < 20; k++) addBuilding(HOUSE_TYPE, at(2 + (k % 8), 1 + Math.floor(k / 8) * 3));
const many = computeHints();
let sorted = true;
for (let k = 1; k < many.length; k++) if (many[k].severity > many[k - 1].severity) sorted = false;
check('at most ' + MAX_HINTS + ' hints, most severe first', many.length === MAX_HINTS && sorted);

console.log(failures === 0 ? 'hamlet hints: ALL PASS' : 'hamlet hints: ' + failures + ' FAIL');
