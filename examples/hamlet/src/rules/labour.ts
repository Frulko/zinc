import { HOUSE, ROLE_PEDDLER, BS_OFF_NET } from '../constants';
import { world } from '../world/world';
import { economy } from '../world/economy';

// The labour pool: every workplace needs a fixed number of hands and the idle residents are handed out in the order of world.priority
// (building types, first = staffed first). Without staff a building produces nothing. The order is the player's: movePriority changes it.

/** Makes world.priority a permutation of the staffed building types (new types go last, in the toolbar order of economy.json: raw trades before their workshops). */
export function normalizePriority(): number[] {
  const staffed: number[] = [];
  for (let type = 0; type < economy.buildings.length; type++) if (type !== HOUSE && economy.buildings[type].workers > 0) staffed.push(type);
  const kept: number[] = world.priority.filter((type: number): boolean => staffed.indexOf(type) >= 0);
  const fresh: number[] = staffed.filter((type: number): boolean => kept.indexOf(type) < 0);
  fresh.sort((a: number, b: number): number => economy.buildings[a].order - economy.buildings[b].order || a - b);   // raw trades first, as the toolbar lists them
  for (const type of fresh) kept.push(type);
  world.priority = kept;
  return kept;
}
/** True while the player has not moved any type: the order is the toolbar's. Then a scarce pool is spread (one hand to each workshop before a second to any); once he orders, the order is strict. */
export function defaultPriority(): boolean {
  const list = normalizePriority(), sorted = list.slice();
  sorted.sort((a: number, b: number): number => economy.buildings[a].order - economy.buildings[b].order || a - b);
  return list.every((type: number, k: number): boolean => type === sorted[k]);
}
/** Where a type stands in the order (0 = staffed first). */
export function rankOf(type: number): number { const k = normalizePriority().indexOf(type); return k < 0 ? 1000 : k; }
/** Moves a type up (delta < 0) or down in the order. Returns the new rank. */
export function movePriority(type: number, delta: number): number {
  const list = normalizePriority(), from = list.indexOf(type);
  if (from < 0) return -1;
  const to = Math.max(0, Math.min(list.length - 1, from + delta));
  list.splice(from, 1); list.splice(to, 0, type);
  world.saveDirty = true;
  return to;
}
/** The order as labels, for a panel. */
export function priorityLabels(): string[] { return normalizePriority().map((type: number): string => economy.buildings[type].label); }

/** The people who can be given work: a share of the residents (economy.json sim.labourShare). */
export function labourPool(): number {
  let n = 0;
  for (const p of world.people) if (p.role !== ROLE_PEDDLER) n++;
  return Math.floor(n * economy.sim.labourShare / 100);
}
/** How many people hold a job now. */
export function employed(): number { let n = 0; for (const p of world.people) if (p.job >= 0) n++; return n; }
/** The labour market in numbers, for the top bar and the advisors: `pool` can work, `jobs` the places that could be filled (a building off the gate's network offers none), `filled` the places held;
 *  `unemployed` = pool left without a place, `shortage` = places nobody takes. One of the two is always 0. */
export class Labour { pool: number = 0; jobs: number = 0; filled: number = 0; unemployed: number = 0; shortage: number = 0; }
export function labourStats(): Labour {
  const l = new Labour();
  l.pool = labourPool();
  for (const b of world.buildings) {
    if (!b.alive || b.type === HOUSE || b.state === BS_OFF_NET) continue;
    l.jobs += economy.buildings[b.type].workers; l.filled += b.workers;
  }
  l.unemployed = Math.max(0, l.pool - l.filled); l.shortage = Math.max(0, l.jobs - l.filled);
  return l;
}
