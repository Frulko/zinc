import { HOUSE } from '../constants';
import { world } from '../world/world';
import { economy, Goal, Condition } from '../world/economy';
import { give } from './stock';
import { population } from '../engine/villagers';

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
function holds(c: Condition): boolean {
  if (c.kind === 'population') return population() >= c.count;
  if (c.kind === 'stock') return world.stock[c.id] >= c.count;
  let n = 0;
  for (const b of world.buildings) {
    if (!b.alive || b.fixed) continue;
    if (c.kind === 'building' && b.type === c.id) n++;
    else if (c.kind === 'houses' && b.type === HOUSE && b.level >= c.level) n++;
  }
  return n >= c.count;
}
/** Is the goal open (not done, its required goals done) and are all its conditions true now? */
export function goalReady(k: number): boolean {
  const g: Goal = economy.goals[k];
  if (world.goals[k] !== 0) return false;
  for (const r of g.requires) if (world.goals[r] === 0) return false;
  for (const c of g.when) if (!holds(c)) return false;
  return true;
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
