import { HOUSE } from '../constants';
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
