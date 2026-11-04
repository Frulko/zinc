import { HOUSE } from '../constants';
import { world } from '../world/world';
import { economy, Goal, Condition } from '../world/economy';
import { give } from './stock';
import { population } from '../engine/villagers';
import { labourStats } from './labour';

// Goals and progression as data (economy.json "goals"): each goal has conditions, and a reward when they hold: buildings unlocked, resources given.
// Goals are checked once a day (engine/day.ts); the reward goes through the command log (rules/commands.ts). A building named by a goal's `unlock` stays
// locked until that goal is done; the others are open from the start.

export function isUnlocked(type: number): boolean { return !world.progression || world.unlocked[type] !== 0; }
/** "Se débloque avec : Des planches" for a locked building, '' when it is open: the toolbar greys the building and shows this. */
export function lockText(type: number): string {
  if (isUnlocked(type)) return '';
  for (const g of economy.goals) if (g.unlock.indexOf(type) >= 0) return 'Se débloque avec l’objectif : ' + g.title;
  return '';
}
/** Days in a row a stock condition has held, per (goal, condition): goalReady runs once a day (engine/day.ts), so it keeps the count. Not saved: a loaded village counts again. */
let held: number[] = [];
export function resetHolds(): void { held = []; }
function holds(c: Condition): boolean {
  if (c.kind === 'population') return population() >= c.count;
  if (c.kind === 'stock') return world.stock[c.id] >= c.count;
  if (c.kind === 'jobs') return labourStats().filled >= c.count;
  if (c.kind === 'peace') return world.crime.peace >= c.count;
  if (c.kind === 'mood') return world.mood >= c.count;
  let n = 0;
  for (const b of world.buildings) {
    if (!b.alive || b.fixed) continue;
    if (c.kind === 'building' && b.type === c.id) n++;
    else if (c.kind === 'houses' && b.type === HOUSE && b.level >= c.level) n++;
  }
  return n >= c.count;
}
/** Is the goal open (not done, its required goals done) and are all its conditions true now (a stock condition with `days` for that many days in a row)? Called once a day per goal. */
export function goalReady(k: number): boolean {
  const g: Goal = economy.goals[k];
  if (world.goals[k] !== 0) return false;
  for (const r of g.requires) if (world.goals[r] === 0) return false;
  let ok = true;
  for (let n = 0; n < g.when.length; n++) {
    const c = g.when[n], at = k * 16 + n;
    while (held.length <= at) held.push(0);
    if (!holds(c)) { held[at] = 0; ok = false; continue; }
    if (c.days > 0) { held[at]++; if (held[at] < c.days) ok = false; }
  }
  return ok;
}
/** Days a stock condition still has to hold, for the goals panel ("tenir 3 jours"): 0 when it needs none or is satisfied. */
export function holdLeft(k: number, n: number): number {
  const c = economy.goals[k].when[n], at = k * 16 + n;
  return c.days > 0 ? Math.max(0, c.days - (at < held.length ? held[at] : 0)) : 0;
}
/** The line of a condition for the goals panel, with how far the village is: "Habitants 12 / 40". */
export function conditionText(c: Condition): string {
  if (c.kind === 'population') return 'Habitants ' + population() + ' / ' + c.count;
  if (c.kind === 'stock') return economy.resources[c.id].label + ' ' + Math.floor(world.stock[c.id]) + ' / ' + c.count + (c.days > 0 ? ' pendant ' + c.days + ' jours' : '');
  if (c.kind === 'jobs') return 'Emplois pourvus ' + labourStats().filled + ' / ' + c.count;
  if (c.kind === 'peace') return 'Paix ' + Math.floor(world.crime.peace) + ' / ' + c.count;
  if (c.kind === 'mood') return 'Humeur ' + Math.floor(world.mood) + ' / ' + c.count;
  let n = 0;
  for (const b of world.buildings) {
    if (!b.alive || b.fixed) continue;
    if (c.kind === 'building' && b.type === c.id) n++;
    else if (c.kind === 'houses' && b.type === HOUSE && b.level >= c.level) n++;
  }
  return c.kind === 'building' ? economy.buildings[c.id].label + ' ' + Math.min(n, c.count) + ' / ' + c.count : 'Maisons niveau ' + c.level + ' ' + Math.min(n, c.count) + ' / ' + c.count;
}
/** The reward of a goal (the `goal` command): marks it done, unlocks buildings, gives resources, and leaves a line for the news. False when it cannot apply. */
export function applyGoal(k: number): boolean {
  if (k < 0 || k >= economy.goals.length || world.goals[k] !== 0) return false;
  const g = economy.goals[k];
  world.goals[k] = 1;
  for (const t of g.unlock) world.unlocked[t] = 1;
  for (let r = 0; r < g.give.length; r++) if (g.give[r] > 0) give(r, g.give[r]);
  world.news.push('Objectif atteint : ' + g.title + '.' + (g.unlock.length > 0 ? ' Nouveau : ' + g.unlock.map((t: number): string => economy.buildings[t].label).join(', ') + '.' : ''));
  world.saveDirty = true;
  return true;
}
/** The goals worth showing: not done and open, then done ones, as [index, state] with state 0 open, 1 done, 2 waiting for another goal. */
export function goalList(): number[][] {
  return economy.goals.map((g: Goal, k: number): number[] => [k, world.goals[k] === 1 ? 1 : g.requires.every((r: number): boolean => world.goals[r] === 1) ? 0 : 2]);
}
/** The scenario is won when a goal marked final is done. */
export function scenarioWon(): boolean { return economy.goals.some((g: Goal, k: number): boolean => g.final && world.goals[k] === 1); }
