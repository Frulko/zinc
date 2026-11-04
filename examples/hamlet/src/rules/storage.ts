import { ORDER_ACCEPT, ORDER_REFUSE, ORDER_GET } from '../constants';
import { world, Building } from '../world/world';
import { economy } from '../world/economy';

// Storage orders, simplified from Augustus: each store says, per resource, what it does with it. ACCEPT: cart-pushers may bring it and it is handed out; REFUSE: nobody brings it (what it holds is still
// handed out); GET: it takes it and keeps it (never handed out) and its own porters fetch it from the other stores. A store with no orders accepts everything.

/** The order of a store for a resource. */
export function orderOf(b: Building, k: number): number { return b.orders.length === 0 ? ORDER_ACCEPT : b.orders[k]; }
/** Sets the order of store `id` for resource `k`. False when the building is not a store. */
export function setOrder(id: number, k: number, order: number): boolean {
  const b = world.buildings[id];
  if (b === undefined || !b.alive || !economy.buildings[b.type].store || k < 0 || k >= economy.resources.length) return false;
  if (b.orders.length === 0) b.orders = economy.resources.map((): number => ORDER_ACCEPT);
  b.orders[k] = order; world.saveDirty = true;
  return true;
}
/** True when carts may bring k to this store. */
export function accepts(b: Building, k: number): boolean { return orderOf(b, k) !== ORDER_REFUSE; }
/** True when this store may be emptied of k (a "get" store keeps it). */
export function gives(b: Building, k: number): boolean { return orderOf(b, k) !== ORDER_GET; }
export const orderName = (order: number): string => order === ORDER_REFUSE ? 'refuse' : order === ORDER_GET ? 'get' : 'accept';
