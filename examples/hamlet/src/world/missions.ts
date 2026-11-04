import { world } from './world';
import { economy, Goal, Sim, readSim, readGoal, amounts } from './economy';
import { TerrainParams } from '../gen/terrain';
import { PRESETS, presetIndex } from '../gen/presets';
import { MIN_SIZE, MAX_SIZE, TICK } from '../constants';
import { MONTH_SECONDS } from '../rules/season';
import { resetHolds } from '../rules/goals';
import { population } from '../engine/villagers';

// Missions as data (assets/missions/<id>.json, ordered by assets/missions/campaign.json), checked like the economy: `parseMission` returns the problems, each starting with its
// name (bad-json, bad-id, bad-map, bad-start, bad-difficulty, bad-sim, bad-building, bad-goal, bad-limit, bad-campaign); `loadMissions` throws with all of them. The format is in MISSIONS.md.
// A mission replaces the goals, the sim knobs and the start stock of the economy for its village (applyMission) and gives them back for a sandbox (applyMission('')).

export class Mission {
  id: string = ''; title: string = ''; briefing: string = '';
  preset: number = 0; seed: number = 1; size: number = 32; params: TerrainParams = new TerrainParams();
  difficulty: number = -1; start: number[] = []; sim: Sim = new Sim(); open: number[] = []; risks: boolean = false;
  limitYears: number = 0; losePeace: number = 0; goals: Goal[] = [];
}
/** The missions in campaign order. */
export const missions: Mission[] = [];

/** The map keys a mission may set over its preset (name -> the TerrainParams field and its largest value). */
const MAP_KEYS: string[] = ['water', 'river', 'forest', 'rock', 'relief', 'outcrop', 'flowers', 'coast', 'wolves'];

function readMap(m: any, into: Mission, errors: string[]): void {
  const where = 'mission ' + into.id + '.map';
  if (m === undefined || m === null || typeof m !== 'object') { errors.push('bad-map: ' + where + ' is missing'); return; }
  into.preset = m.preset === undefined ? 0 : presetIndex(String(m.preset));
  if (into.preset < 0) { errors.push('bad-map: ' + where + '.preset "' + String(m.preset) + '" is none of ' + PRESETS.map((p: any): string => p.label).join(', ')); into.preset = 0; }
  if (typeof m.seed !== 'number' || m.seed < 1 || m.seed !== Math.floor(m.seed)) errors.push('bad-map: ' + where + '.seed is a whole number from 1');
  else into.seed = m.seed as number;
  if (typeof m.size !== 'number' || m.size < MIN_SIZE || m.size > MAX_SIZE) errors.push('bad-map: ' + where + '.size is a number from ' + MIN_SIZE + ' to ' + MAX_SIZE);
  else into.size = m.size as number;
  const p = new TerrainParams(), q = PRESETS[into.preset].params;
  p.waterAmount = q.waterAmount; p.river = q.river; p.forestDensity = q.forestDensity; p.rockDensity = q.rockDensity; p.biome = q.biome; p.coast = q.coast; p.outcrop = q.outcrop; p.flowers = q.flowers; p.biomes = q.biomes; p.wolves = q.wolves; p.relief = q.relief; p.genStyle = q.genStyle;
  for (const key of Object.keys(m)) {
    if (key === 'preset' || key === 'seed' || key === 'size') continue;
    const v: any = m[key];
    if (MAP_KEYS.indexOf(key) < 0) { errors.push('bad-map: ' + where + '.' + key + ' is none of ' + MAP_KEYS.join(', ')); continue; }
    if (key === 'river') { if (typeof v !== 'boolean') errors.push('bad-map: ' + where + '.river is true or false'); else p.river = v as boolean; continue; }
    if (typeof v !== 'number' || v < 0 || v > (key === 'wolves' ? 2 : 1)) { errors.push('bad-map: ' + where + '.' + key + ' is a number from 0 to ' + (key === 'wolves' ? 2 : 1)); continue; }
    const n = v as number;
    if (key === 'water') p.waterAmount = n; else if (key === 'forest') p.forestDensity = n; else if (key === 'rock') p.rockDensity = n; else if (key === 'relief') p.relief = n;
    else if (key === 'outcrop') p.outcrop = n; else if (key === 'flowers') p.flowers = n; else if (key === 'coast') p.coast = n; else p.wolves = n;
  }
  into.params = p;
}

/** Reads and checks one mission file (`file` is its id: the file must be named after it). Needs the economy loaded. */
export function parseMission(text: string, file: string, into: Mission): string[] {
  const errors: string[] = [];
  let d: any = null;
  try { d = JSON.parse(text); } catch (error) { return ['bad-json: mission ' + file + ' is not valid JSON']; }
  if (d === null || typeof d !== 'object') return ['bad-json: mission ' + file + ' is not an object'];
  into.id = String(d.id === undefined ? '' : d.id); into.title = String(d.title === undefined ? '' : d.title); into.briefing = String(d.briefing === undefined ? '' : d.briefing);
  if (into.id === '' || into.id !== file) errors.push('bad-id: mission "' + into.id + '" must carry the id of its file "' + file + '"');
  if (into.title === '' || into.briefing === '') errors.push('bad-id: mission ' + into.id + ' needs a title and a briefing');
  readMap(d.map, into, errors);
  const dname = d.difficulty === undefined ? 'normal' : String(d.difficulty);
  into.difficulty = economy.difficulties.findIndex((l: any): boolean => l.id === dname);
  if (into.difficulty < 0) errors.push('bad-difficulty: mission ' + into.id + ' uses the unknown difficulty "' + dname + '"');
  const ids = economy.resources.map((r: any): string => r.id), names = economy.buildings.map((b: any): string => b.id);
  if (d.start !== undefined) { into.start = amounts(d.start, ids, 'mission ' + into.id + '.start', errors).map((v: number): number => v); if (into.start.every((v: number): boolean => v === 0)) errors.push('bad-start: mission ' + into.id + '.start holds nothing'); }
  into.sim = readSim(d.sim === undefined ? {} : d.sim, economy.campaignSim, 'mission ' + into.id + '.sim', errors);
  into.open = [];
  if (d.buildings !== undefined) {
    if (!Array.isArray(d.buildings)) errors.push('bad-building: mission ' + into.id + '.buildings is a list of building ids');
    else for (const b of d.buildings as string[]) { const k = names.indexOf(String(b)); if (k < 0) errors.push('bad-building: mission ' + into.id + ' opens the unknown building "' + String(b) + '"'); else into.open.push(k); }
  }
  into.risks = d.risks === true;
  into.limitYears = d.limitYears === undefined ? 0 : d.limitYears;
  if (typeof into.limitYears !== 'number' || into.limitYears < 0 || into.limitYears > 200) { errors.push('bad-limit: mission ' + into.id + '.limitYears is a number of years from 0 (none) to 200'); into.limitYears = 0; }
  into.losePeace = 0;
  if (d.lose !== undefined) {
    if (d.lose === null || typeof d.lose !== 'object' || (d.lose.peace !== undefined && (typeof d.lose.peace !== 'number' || d.lose.peace < 1 || d.lose.peace > 99))) errors.push('bad-limit: mission ' + into.id + '.lose is { "peace": 1 to 99 }');
    else if (d.lose.peace !== undefined) into.losePeace = d.lose.peace as number;
    if (into.losePeace > 0 && !into.risks) errors.push('bad-limit: mission ' + into.id + ' loses on peace but has no risks');
  }
  into.goals = [];
  if (!Array.isArray(d.goals) || d.goals.length === 0) errors.push('bad-goal: mission ' + into.id + ' needs a list of goals');
  else for (const g of d.goals as any[]) {
    const ref = typeof g === 'string' ? g : g !== null && typeof g === 'object' && g.ref !== undefined ? String(g.ref) : '';
    if (ref === '') { into.goals.push(readGoal(g, into.goals, names, ids, errors)); continue; }
    const base = economy.campaignGoals.find((o: Goal): boolean => o.id === ref);
    if (base === undefined) { errors.push('bad-goal: mission ' + into.id + ' takes the goal "' + ref + '", which economy.json does not have'); continue; }
    if (into.goals.some((o: Goal): boolean => o.id === ref)) { errors.push('bad-id: mission ' + into.id + ' has the goal "' + ref + '" twice'); continue; }
    const c = new Goal();
    c.id = base.id; c.title = base.title; c.text = base.text; c.unlock = base.unlock.slice(); c.give = base.give.slice(); c.when = base.when; c.final = typeof g === 'object' && g.final === true ? true : base.final;
    for (const r of base.requires) {
      const at = into.goals.findIndex((o: Goal): boolean => o.id === economy.campaignGoals[r].id);
      if (at < 0) errors.push('bad-goal: mission ' + into.id + ' takes "' + ref + '" without its required goal "' + economy.campaignGoals[r].id + '" before it'); else c.requires.push(at);
    }
    into.goals.push(c);
  }
  if (into.goals.length > 0 && !into.goals.some((o: Goal): boolean => o.final)) errors.push('bad-goal: mission ' + into.id + ' has no goal with "final": true, so it cannot be won');
  return errors;
}

/** Reads `missions/campaign.json` ({ "missions": [ids] }) and every mission it lists through `read` (the file's text by its path under assets/). Throws with all the problems. */
export function loadMissions(read: (path: string) => string): void {
  const errors: string[] = [], list: Mission[] = [];
  let order: any = null;
  try { order = JSON.parse(read('missions/campaign.json')); } catch (error) { throw new Error('missions: campaign.json is not valid JSON'); }
  if (order === null || !Array.isArray(order.missions)) throw new Error('missions: bad-campaign: campaign.json needs { "missions": [ids] }');
  for (const id of order.missions as string[]) {
    if (list.some((m: Mission): boolean => m.id === String(id))) { errors.push('bad-campaign: mission "' + String(id) + '" is listed twice'); continue; }
    let text = '';
    try { text = read('missions/' + String(id) + '.json'); } catch (error) { errors.push('bad-campaign: mission "' + String(id) + '" has no file'); continue; }
    const m = new Mission();
    for (const e of parseMission(text, String(id), m)) errors.push(e);
    list.push(m);
  }
  if (errors.length > 0) throw new Error('missions: ' + errors.join('; '));
  missions.length = 0;
  for (const m of list) missions.push(m);
}

export function missionOf(id: string): Mission | null { for (const m of missions) if (m.id === id) return m; return null; }
/** The mission this village plays, null in a sandbox. */
export function currentMission(): Mission | null { return world.mission === '' ? null : missionOf(world.mission); }

/** Gives the economy a mission's goals, sim knobs and start (before `generate`, which reads them); '' (or an unknown id) gives the economy.json ones back: the sandbox. */
export function applyMission(id: string): void {
  const m = missionOf(id);
  world.mission = m === null ? '' : m.id;
  economy.goals = m === null ? economy.campaignGoals : m.goals; economy.sim = m === null ? economy.campaignSim : m.sim;
  economy.startOverride = m === null ? [] : m.start.slice(); economy.openAtStart = m === null ? [] : m.open.slice();
  resetHolds();
}

/** Ticks of the mission's time limit, 0 when it has none. */
export function limitTicks(): number { const m = currentMission(); return m === null || m.limitYears <= 0 ? 0 : Math.round(m.limitYears * 12 * MONTH_SECONDS / TICK); }
/** "12 ans et 3 mois" left, '' without a limit. */
export function timeLeftText(): string {
  const lim = limitTicks();
  if (lim === 0) return '';
  const months = Math.max(0, Math.ceil((lim - world.tick) * TICK / MONTH_SECONDS)), y = Math.floor(months / 12), mo = months % 12;
  return y > 0 ? y + (y > 1 ? ' ans' : ' an') + (mo > 0 ? ' et ' + mo + ' mois' : '') : mo + ' mois';
}
/** Why the mission is lost right now ('' when it is not): the time is up, or the peace is gone. The empty village is the Ending's own rule. */
export function missionLoss(won: boolean): string {
  const m = currentMission();
  if (m === null || won) return '';
  const lim = limitTicks();
  if (lim > 0 && world.tick >= lim) return 'Le temps est écoulé : l’objectif n’a pas été atteint à temps.';
  if (m.losePeace > 0 && world.risks && world.crime.peace < m.losePeace && population() >= 16) return 'La paix est perdue : le hameau sombre dans le désordre.';
  return '';
}
