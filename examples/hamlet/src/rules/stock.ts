import { world } from '../world/world';
import { economy } from '../world/economy';

/** What the village holds of every resource, in the order of economy.json. */
export function totals(): number[] { return world.stock; }
export function canPay(cost: number[]): boolean {
  for (let k = 0; k < cost.length; k++) if (world.stock[k] < cost[k]) return false;
  return true;
}
export function pay(cost: number[]): void { for (let k = 0; k < cost.length; k++) world.stock[k] -= cost[k]; }
/** What is still missing to pay `cost` (0 where there is enough). */
export function lacking(cost: number[]): number[] { return cost.map((c: number, k: number): number => Math.max(0, c - world.stock[k])); }
export function add(list: number[]): void { for (let k = 0; k < list.length; k++) world.stock[k] += list[k]; }
export const resourceCount = (): number => economy.resources.length;
