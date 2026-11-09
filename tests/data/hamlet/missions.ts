// Headless proofs of the missions: every file loads, the validator names its errors, a mission's map, stock, knobs and locks reach the village, the first goals play through,
// and the mission survives a save. No window. Run from the repository root.
import * as fs from 'zinc:fs';
import { world, generate } from '../../../examples/hamlet/src/world/world';
import { economy, loadEconomy } from '../../../examples/hamlet/src/world/economy';
import { missions, Mission, loadMissions, parseMission, applyMission, currentMission, limitTicks, missionLoss, timeLeftText } from '../../../examples/hamlet/src/world/missions';
import { snapshot, restore } from '../../../examples/hamlet/src/world/snapshot';
import { goalReady, conditionText, isUnlocked, lockText, holdLeft } from '../../../examples/hamlet/src/rules/goals';
import { applyTool, toolOf } from '../../../examples/hamlet/src/rules/build';
import { stepWorld } from '../../../examples/hamlet/src/engine/simulate';
import { createResident } from '../../../examples/hamlet/src/engine/villagers';
import { addBuilding } from '../../../examples/hamlet/src/rules/build';
import { setStock } from '../../../examples/hamlet/src/rules/stock';
import { TOOL_ROAD, HOUSE, PLACE_OK, ROLE_NAMES, MOUNTAIN_LEVEL, ROCK_DEPOSIT } from '../../../examples/hamlet/src/constants';
import { copyTerrainParams } from '../../../examples/hamlet/src/gen/terrain';
import { MODEL_IDS } from '../../../examples/hamlet/src/view/models';

const ASSETS = 'examples/hamlet/assets/';
let failures = 0;
function check(name: string, ok: boolean): void { console.log('hamlet missions: ' + name + (ok ? ' PASS' : ' FAIL')); if (!ok) failures++; }
const read = (path: string): string => fs.readText(ASSETS + path);
loadEconomy(read('economy.json'), MODEL_IDS, ROLE_NAMES);
world.autosave = false;

// ---- the files ----
loadMissions(read);
check('the campaign lists six missions in order', missions.length === 6 && missions[0].id === '01-premier-village' && missions[5].id === '06-survie');
check('every mission has a title, a briefing, goals and a final goal', missions.every((m: Mission): boolean => m.title !== '' && m.briefing.length > 80 && m.goals.length >= 5 && m.goals.some((g: any): boolean => g.final)));
check('mission 1 takes its goals from economy.json without copying them', missions[0].goals.map((g: any): string => g.id).join() === 'wood,planks,street,hunt,leather,square,growth' && missions[0].goals[6].final && missions[0].goals[1].requires[0] === 0 && missions[0].goals[6].when === economy.campaignGoals[economy.campaignGoals.findIndex((g: any): boolean => g.id === 'growth')].when);
check('the Cité missions retune the labour pool', missions[4].sim.labourShare === 60 && missions[0].sim.labourShare === economy.campaignSim.labourShare && missions[5].sim.labourShare === 70);

// ---- the validator: one broken mission per named error ----
const base = (): any => JSON.parse(read('missions/03-la-montagne.json'));
function errorsOf(change: (d: any) => void, file: string = '03-la-montagne'): string[] {
  const d = base(); change(d);
  return parseMission(JSON.stringify(d), file, new Mission());
}
const names = (list: string[]): string => list.map((e: string): string => e.split(':')[0]).join(',');
check('the unchanged file is clean', errorsOf((_d: any): void => {}).length === 0);
check('bad-json', names(parseMission('{ nope', 'x', new Mission())) === 'bad-json');
check('bad-id: a file named after another id, and a missing briefing', names(errorsOf((_d: any): void => {}, 'other')) === 'bad-id' && names(errorsOf((d: any): void => { d.briefing = ''; })) === 'bad-id');
check('bad-map: unknown preset, size out of range, unknown key, relief above 1', names(errorsOf((d: any): void => { d.map.preset = 'Lune'; })) === 'bad-map' && names(errorsOf((d: any): void => { d.map.size = 999; })) === 'bad-map' && names(errorsOf((d: any): void => { d.map.glacier = 1; })) === 'bad-map' && names(errorsOf((d: any): void => { d.map.relief = 2; })) === 'bad-map');
check('bad-start: an unknown resource', names(errorsOf((d: any): void => { d.start.gold = 5; })) === 'unknown-resource');
check('bad-difficulty', names(errorsOf((d: any): void => { d.difficulty = 'brutal'; })) === 'bad-difficulty');
check('bad-sim', names(errorsOf((d: any): void => { d.sim = { labourShare: 0 }; })) === 'bad-sim');
check('bad-building: an unknown id in the open list', names(errorsOf((d: any): void => { d.buildings = ['house', 'castle']; })) === 'bad-building');
check('bad-goal: no final goal, a goal that is not in economy.json, an unknown building in a condition, a requirement declared later', names(errorsOf((d: any): void => { for (const g of d.goals as any[]) g.final = false; })) === 'bad-goal'
  && names(errorsOf((d: any): void => { d.goals = [{ ref: 'wood', final: true }, 'dragon']; })) === 'bad-goal'
  && names(errorsOf((d: any): void => { d.goals[0].when = [{ building: 'castle' }]; })) === 'bad-goal'
  && names(errorsOf((d: any): void => { d.goals[0].requires = ['stone']; })) === 'bad-goal');
check('bad-goal: a condition that is none of the known kinds', names(errorsOf((d: any): void => { d.goals[0].when = [{ weather: 3 }]; })) === 'bad-goal');
check('bad-goal: a campaign goal taken without its required goal', names(errorsOf((d: any): void => { d.goals = ['wood', 'street']; })).indexOf('bad-goal') === 0);
check('bad-limit: a limit outside the range, a peace loss without risks', names(errorsOf((d: any): void => { d.limitYears = 900; })) === 'bad-limit' && names(errorsOf((d: any): void => { d.lose = { peace: 20 }; })) === 'bad-limit');
let thrown = '';
try { loadMissions((p: string): string => p === 'missions/campaign.json' ? '{ "missions": ["01-premier-village", "01-premier-village", "ghost"] }' : read(p)); } catch (error) { thrown = error.message; }
check('bad-campaign: a mission listed twice, a file that is missing', thrown.indexOf('bad-campaign') >= 0 && thrown.indexOf('listed twice') >= 0 && thrown.indexOf('ghost') >= 0 && missions.length === 6);

// ---- a mission reaches the village ----
function begin(m: Mission): void { applyMission(m.id); world.difficulty = m.difficulty; generate(m.seed, m.size, copyTerrainParams(m.params)); world.progression = true; world.risks = m.risks; }
begin(missions[0]);
check('mission 1 opens the wood trades only, the rest waits for its goals', world.mission === missions[0].id && world.goals.length === 7 && isUnlocked(economy.typeOf('lumberhut')) && isUnlocked(economy.typeOf('sawmill')) && !isUnlocked(economy.typeOf('lodge')) && !isUnlocked(economy.typeOf('tavern')) && lockText(economy.typeOf('lodge')).indexOf('Des planches') >= 0 && lockText(economy.typeOf('tavern')) === '');
begin(missions[1]);
check('mission 2 starts with its own stock', world.buildings[0].stock[economy.resourceOf('bread')] === 8 && world.stock[economy.resourceOf('plank')] === 26);
begin(missions[4]);
check('mission 5 runs the economy with its sim knobs, a sandbox gives them back', economy.sim.labourShare === 60 && world.size === 64 && (applyMission(''), economy.sim.labourShare === economy.campaignSim.labourShare && world.mission === '' && economy.goals === economy.campaignGoals));
for (const k of [2, 5]) {
  begin(missions[k]);
  let high = 0, deposits = 0;
  for (let t = 0; t < world.size * world.size; t++) { if (world.height[t] >= MOUNTAIN_LEVEL) high++; if (world.rock[t] >= ROCK_DEPOSIT) deposits++; }
  check('mission ' + (k + 1) + ' is a mountain map with ore and stone in reach (' + high + ' mountain tiles, ' + deposits + ' deposits)', high > world.size && deposits >= 3);
}
for (const m of missions) { begin(m); check(m.id + ': the map has water-free land and the hall stands', world.terrain.filter((v: number): boolean => v === 0).length > world.size * world.size / 3 && world.buildings.length >= 1); }

// ---- the first goals of mission 1 play through ----
begin(missions[0]);
const run = (seconds: number): void => { for (let k = 0; k < seconds * 32; k++) stepWorld(); };
const row = world.gate + 0;
for (let i = 0; i < world.size; i++) for (let dj = -3; dj <= 3; dj++) { const t = row + i + dj * world.size; if (t >= 0 && t < world.size * world.size && Math.floor(t / world.size) === Math.floor((row + dj * world.size) / world.size)) { world.tree[t] = 0; world.rock[t] = 0; } }
let roads = 0;
for (let i = 1; i <= 8; i++) if (applyTool(TOOL_ROAD, row + i) === PLACE_OK) roads++;
let hut = -1, home = -1;
for (let i = 1; i <= 8 && (hut < 0 || home < 0); i++) {
  if (hut < 0 && applyTool(toolOf('lumberhut'), row + i - world.size) === PLACE_OK) hut = row + i - world.size;
  else if (home < 0 && applyTool(toolOf('house'), row + i + world.size) === PLACE_OK) home = row + i + world.size;
}
check('scripted opening: a road, a house and a lumber hut stand', roads >= 6 && hut >= 0 && home >= 0);
const gh = world.build[home];
createResident(gh); createResident(gh); world.buildings[gh].residents = 2; world.buildings[gh].timer = 1e9;
run(25);
check('the wood goal is reached in the daily slice and logged', world.goals[0] === 1 && world.log.length >= 1 && world.log[0].type === 'goal');
let mill = -1;
for (let i = 1; i <= 8 && mill < 0; i++) if (applyTool(toolOf('sawmill'), row + i + world.size) === PLACE_OK || applyTool(toolOf('sawmill'), row + i - world.size) === PLACE_OK) mill = i;
setStock(economy.resourceOf('plank'), 20);
run(22);
check('then the planks goal opens the lodge', world.goals[1] === 1 && isUnlocked(economy.typeOf('lodge')));
const saved = snapshot(), progressed = world.goals.join('');
applyMission(''); generate(5, 16);
check('the save carries the mission: goals, locks and knobs come back', restore(saved).ok() && world.mission === missions[0].id && world.goals.join('') === progressed && economy.goals.length === 7 && snapshot() === saved);
const m3 = missions[2];
begin(m3); world.tick = 500; const saved3 = snapshot();
applyMission(''); generate(9, 16);
check('another mission survives the round trip too (a sandbox village loads as a sandbox)', restore(saved3).ok() && currentMission() === m3 && economy.goals.length === 5 && snapshot() === saved3 && (applyMission(''), generate(9, 16), restore(snapshot()).ok() && world.mission === '' && economy.goals.length === economy.campaignGoals.length));

function crowd(n: number): void { const t = world.gate + 3 * world.size; world.terrain[t] = 0; world.tree[t] = 0; world.rock[t] = 0; world.buildings[addBuilding(HOUSE, t)].residents = n; }
// ---- the new condition kinds, held stocks, the time limit ----
begin(missions[1]);
const bread = economy.resourceOf('bread'), reserve = economy.goals.findIndex((g: any): boolean => g.id === 'reserve');
world.goals[0] = 1; world.goals[1] = 1; world.goals[2] = 1;
setStock(bread, 40);
check('a stock held for days: three days in a row, then the goal is ready', !goalReady(reserve) && !goalReady(reserve) && holdLeft(reserve, 0) === 1 && goalReady(reserve));
setStock(bread, 10);
check('a day under the line starts the count over', !goalReady(reserve) && holdLeft(reserve, 0) === 3);
check('the goals panel words a condition with its progress', conditionText(economy.goals[reserve].when[0]) === 'Pain 10 / 30 pendant 3 jours');
begin(missions[5]);
const calm = economy.goals.findIndex((g: any): boolean => g.id === 'calm');
for (let k = 0; k < calm; k++) world.goals[k] = 1;
world.crime.peace = 50; crowd(30);
check('peace and mood conditions read the village', !goalReady(calm) && conditionText(economy.goals[calm].when[0]) === 'Paix 50 / 60' && (world.crime.peace = 80, goalReady(calm)));
begin(missions[4]);
check('a mission with a limit loses when the time is up, never once won', limitTicks() > 0 && missionLoss(false) === '' && timeLeftText().indexOf('90 ans') === 0 && (world.tick = limitTicks(), missionLoss(false) !== '' && missionLoss(true) === '' && timeLeftText() === '0 mois'));
begin(missions[5]);
world.crime.peace = 10; crowd(20);
check('a mission loses when the peace falls under its floor', missionLoss(false).indexOf('paix') >= 0 && (world.crime.peace = 60, missionLoss(false) === ''));
applyMission('');
check('the sandbox has no mission, no limit', currentMission() === null && limitTicks() === 0 && missionLoss(false) === '' && timeLeftText() === '');

console.log(failures === 0 ? 'hamlet missions: ALL PASS' : 'hamlet missions: ' + failures + ' FAIL');
