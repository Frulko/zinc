import { world, recount } from '../world/world';
import { economy } from '../world/economy';

/** The village's stores, in building order (the hall first). */
function storeList(): number[] {
  const out: number[] = [];
  for (let id = 0; id < world.buildings.length; id++) if (world.buildings[id].alive && economy.buildings[world.buildings[id].type].store) out.push(id);
  return out;
}
export function canPay(cost: number[]): boolean {
  for (let k = 0; k < cost.length; k++) if (world.stock[k] < cost[k]) return false;
  return true;
}
/** Takes up to n of a resource out of the stores (the hall first). Returns what was taken. */
export function take(k: number, n: number): number {
  let left = n;
  for (const id of storeList()) {
    const b = world.buildings[id], got = Math.min(left, b.stock[k]);
    b.stock[k] -= got; left -= got;
  }
  recount();
  return n - left;
}
export function pay(cost: number[]): void { for (let k = 0; k < cost.length; k++) take(k, cost[k]); }
/** Puts n of a resource in the hall (a gift: the start of a test, a reward). */
export function give(k: number, n: number): void {
  for (const id of storeList()) { world.buildings[id].stock[k] += n; break; }
  recount();
}
/** Sets what the village holds of a resource: the other stores are emptied of it, the hall holds it. */
export function setStock(k: number, n: number): void {
  const ids = storeList();
  for (const id of ids) world.buildings[id].stock[k] = 0;
  if (ids.length > 0) world.buildings[ids[0]].stock[k] = n;
  recount();
}
