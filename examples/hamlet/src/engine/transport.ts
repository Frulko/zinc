import { ST_FETCH, ST_BRING, ST_SEEK, BS_WAITING, BS_ISOLATED, BS_FULL, BATCH, ORDER_GET, HOUSE } from '../constants';
import { world, Person, Building, tileIndex, tileAt, neighbor, recount } from '../world/world';
import { economy, BuildingDef, Housing } from '../world/economy';
import { accepts, gives } from '../rules/storage';
import { onStoreNetwork } from './network';
import { fieldFrom, approachTile, planPath, pathBusy, owePath, UNREACHABLE, ESCAPE } from './path';

// Goods move in loads: a worker (a porter, or a worker fetching an input or hauling its own output) walks to the building that holds them, takes a batch,
// walks to the building that keeps them and puts them down. The batch is promised on both sides first (src.reserved, dst.incoming), so a load is never taken twice
// and a store never promises more room than it has. Loads only leave and enter buildings joined by road to a store.

const tileOf = (b: Building): number => tileIndex(b.i, b.j);
const isStore = (b: Building): boolean => economy.buildings[b.type].store;

// ---- which buildings the road joins to a store (engine/network.ts) ----
/** True when a road leads from the building to a store (it can send and receive goods). */
export function exportsOk(b: Building): boolean { return onStoreNetwork(b); }

// ---- loads ----
const room = (b: Building, k: number): number => economy.buildings[b.type].stockCap - b.stock[k] - b.incoming[k];
const spare = (b: Building, k: number): number => b.stock[k] - b.reserved[k];

/** Promises `n` of k from building src to building dst to the person, and sends it to src. False when it cannot go. */
export function startTransport(p: Person, src: number, dst: number, k: number, n: number): boolean {
  p.src = src; p.dst = dst; p.res = k; p.want = n; p.carry = 0; p.load = 0; p.state = ST_FETCH;
  world.buildings[src].reserved[k] += n; world.buildings[dst].incoming[k] += n;
  if (!planPath(p, tileOf(world.buildings[src]))) { cancelTransport(p); p.state = ST_SEEK; return false; }
  return true;
}
/** Gives the promises of a transport back (the person stopped: building torn down, worker released). The load in hand is lost. */
export function cancelTransport(p: Person): void {
  if (p.res >= 0 && (p.state === ST_FETCH || p.src >= 0)) {
    if (p.state === ST_FETCH) world.buildings[p.src].reserved[p.res] -= p.want;
    world.buildings[p.dst].incoming[p.res] -= p.want;
  }
  p.src = -1; p.dst = -1; p.res = -1; p.want = 0; p.carry = 0; p.load = 0;
}
/** The person reached the building that holds the goods: takes the batch and goes on to where it is kept. */
export function pickUp(p: Person): void {
  const src = world.buildings[p.src], dst = world.buildings[p.dst];
  const got = src.alive ? Math.min(p.want, src.stock[p.res]) : 0;
  if (src.alive) { src.stock[p.res] -= got; src.reserved[p.res] -= p.want; }
  dst.incoming[p.res] -= p.want - got; p.want = got;
  if (got < 1 || !dst.alive || !planPath(p, tileOf(dst))) { dst.incoming[p.res] -= got; if (src.alive) src.stock[p.res] += got; p.src = -1; p.dst = -1; p.res = -1; p.want = 0; p.state = ST_SEEK; p.carry = 0; p.load = 0; recount(); return; }
  p.carry = p.res + 1; p.load = got; p.state = ST_BRING;
  recount();
}
/** The person reached the destination: puts the load down. */
export function putDown(p: Person): void {
  const dst = world.buildings[p.dst];
  if (dst.alive) { dst.stock[p.res] += p.load; dst.incoming[p.res] -= p.want; }
  p.src = -1; p.dst = -1; p.res = -1; p.want = 0; p.carry = 0; p.load = 0; p.state = ST_SEEK;
  world.saveDirty = true; recount();
}

/** The store with room for k that the person reaches soonest (or -1). */
function nearestStore(p: Person, k: number): number {
  const field = fieldFrom(tileAt(p.x, p.y), UNREACHABLE, ESCAPE); owePath();
  let best = -1, bestCost = UNREACHABLE;
  for (let id = 0; id < world.buildings.length; id++) {
    const b = world.buildings[id];
    if (!b.alive || !isStore(b) || room(b, k) < 1 || !accepts(b, k) || !exportsOk(b)) continue;
    const a = approachTile(field, tileOf(b));
    if (a >= 0 && field.dist[a] < bestCost) { bestCost = field.dist[a]; best = id; }
  }
  return best;
}
/** The worker carries its own building's output to a store (the building is full). False when no store can take it. */
export function haulOut(p: Person, siteId: number): boolean {
  if (pathBusy()) return false;                      // see path.ts: the searches of the last ticks are still owed
  const site = world.buildings[siteId], def = economy.buildings[site.type];
  if (!exportsOk(site)) return false;
  for (let k = 0; k < def.outputs.length; k++) {
    if (def.outputs[k] === 0 || spare(site, k) < 1) continue;
    const dst = nearestStore(p, k);
    if (dst < 0) continue;
    return startTransport(p, siteId, dst, k, Math.min(spare(site, k), BATCH, room(world.buildings[dst], k)));
  }
  return false;
}
/** A porter looks for a producer holding goods and a store with room: the nearest load. */
export function findLoad(p: Person): boolean {
  if (pathBusy()) return false;
  let any = false;
  for (const b of world.buildings) if (b.alive && !isStore(b)) for (let k = 0; k < b.stock.length; k++) if (economy.buildings[b.type].outputs[k] > 0 && spare(b, k) >= 1) any = true;
  if (!any) return fetchForStore(p);
  const field = fieldFrom(tileAt(p.x, p.y), UNREACHABLE, ESCAPE); owePath();
  let bestId = -1, bestRes = -1, bestCost = UNREACHABLE;
  for (let id = 0; id < world.buildings.length; id++) {
    const b = world.buildings[id];
    if (!b.alive || isStore(b) || !exportsOk(b)) continue;
    const a = approachTile(field, tileOf(b));
    if (a < 0 || field.dist[a] >= bestCost) continue;
    for (let k = 0; k < b.stock.length; k++) {
      if (economy.buildings[b.type].outputs[k] === 0 || spare(b, k) < 1) continue;
      bestCost = field.dist[a]; bestId = id; bestRes = k; break;
    }
  }
  if (bestId < 0) return fetchForStore(p);
  const src = world.buildings[bestId], dst = nearestStore(p, bestRes);
  if (dst < 0) { src.state = BS_FULL; return false; }
  return startTransport(p, bestId, dst, bestRes, Math.min(spare(src, bestRes), BATCH, room(world.buildings[dst], bestRes)));
}
/** A porter with no producer to empty serves the stores that "get" a resource: it carries it from the nearest other store that holds some and gives it. */
function fetchForStore(p: Person): boolean {
  if (pathBusy()) return false;
  for (let id = 0; id < world.buildings.length; id++) {
    const want = world.buildings[id];
    if (!want.alive || !isStore(want) || want.orders.length === 0 || !exportsOk(want)) continue;
    for (let k = 0; k < want.stock.length; k++) {
      if (want.orders[k] !== ORDER_GET || room(want, k) < 1) continue;
      const field = fieldFrom(tileAt(p.x, p.y), UNREACHABLE, ESCAPE); owePath();
      let best = -1, bestCost = UNREACHABLE;
      for (let o = 0; o < world.buildings.length; o++) {
        const b = world.buildings[o];
        if (o === id || !b.alive || !isStore(b) || spare(b, k) < 1 || !gives(b, k) || !exportsOk(b)) continue;
        const a = approachTile(field, tileOf(b));
        if (a >= 0 && field.dist[a] < bestCost) { bestCost = field.dist[a]; best = o; }
      }
      if (best >= 0) return startTransport(p, best, id, k, Math.min(spare(world.buildings[best], k), BATCH, room(want, k)));
    }
  }
  return false;
}
/** The store that holds k and may give it, the one the person reaches soonest (or -1). */
function nearestGiver(p: Person, k: number): number {
  const field = fieldFrom(tileAt(p.x, p.y), UNREACHABLE, ESCAPE); owePath();
  let best = -1, bestCost = UNREACHABLE;
  for (let id = 0; id < world.buildings.length; id++) {
    const b = world.buildings[id];
    if (!b.alive || !isStore(b) || spare(b, k) < 1 || !gives(b, k) || !exportsOk(b)) continue;
    const a = approachTile(field, tileOf(b));
    if (a >= 0 && field.dist[a] < bestCost) { bestCost = field.dist[a]; best = id; }
  }
  return best;
}
/** The goods a market keeps: the ones houses eat or burn. */
const marketGoods = (): number[] => { const h = economy.buildings[HOUSE].housing as Housing; return h.eats.concat(h.uses); };
/** True when the market holds some good to hand out. */
export function marketStocked(b: Building): boolean { for (const k of marketGoods()) if (b.stock[k] - b.reserved[k] >= 1) return true; return false; }
/** The buyer of a market (its vendor, between two rounds) fetches a good the market holds under half its cap from the nearest store that has it. False when nothing is wanted or to be had. */
export function restock(p: Person, siteId: number): boolean {
  const site = world.buildings[siteId], cap = economy.buildings[site.type].stockCap;
  if (!exportsOk(site)) { site.state = BS_ISOLATED; return false; }
  for (const k of marketGoods()) {
    const have = site.stock[k] + site.incoming[k];
    if (have * 2 >= cap) continue;
    const from = nearestGiver(p, k);
    if (from >= 0) return startTransport(p, from, siteId, k, Math.min(cap - have, spare(world.buildings[from], k), BATCH));
  }
  return false;
}
/** A worker fetches what its building lacks from the nearest store that has it. False when it cannot (the building waits: state and waitFor say why). */
export function fetchInput(p: Person, siteId: number): boolean {
  if (pathBusy()) return false;
  const site = world.buildings[siteId], def = economy.buildings[site.type];
  for (let k = 0; k < def.inputs.length; k++) {
    const want = def.inputs[k] * 2 - site.stock[k] - site.incoming[k];
    if (def.inputs[k] === 0 || site.stock[k] >= def.inputs[k] || want < 1) continue;
    if (!exportsOk(site)) { site.state = BS_ISOLATED; return false; }
    const best = nearestGiver(p, k);
    if (best < 0) { site.state = BS_WAITING; site.waitFor = k; return false; }
    return startTransport(p, best, siteId, k, Math.min(want, spare(world.buildings[best], k), BATCH));
  }
  return false;
}
/** True when every good the building makes has reached its stock target in the village's stores: the workshop idles and keeps its inputs where they are (a sawmill stops eating logs when the planks sit at the cap). */
export function atTarget(def: BuildingDef): boolean {
  let any = false;
  for (let k = 0; k < def.outputs.length; k++) {
    if (def.outputs[k] <= 0) continue;
    const t = economy.resources[k].target;
    if (t <= 0 || world.stock[k] < t) return false;
    any = true;
  }
  return any;
}
/** Does the building have room for what one cycle makes? */
export function hasRoomFor(b: Building, out: number[]): boolean {
  const cap = economy.buildings[b.type].stockCap;
  for (let k = 0; k < out.length; k++) if (out[k] > 0 && b.stock[k] + out[k] > cap) return false;
  return true;
}
/** Does the building hold a full batch of something it makes? */
export function readyBatch(b: Building, out: number[]): boolean {
  for (let k = 0; k < out.length; k++) if (out[k] > 0 && spare(b, k) >= BATCH) return true;
  return false;
}
/** What a building holds counting the loads on their way to it in porters' hands (a save or a hash must not lose them). */
export function stockWithCarried(id: number): number[] {
  const out = world.buildings[id].stock.slice();
  if (carriedTick !== world.tick || carriedPeople !== world.people.length) {       // one pass over the people per tick, not one per building
    carriedTick = world.tick; carriedPeople = world.people.length; carriedLoads = new Map<number, number[]>();
    for (const p of world.people) if (p.state === ST_BRING && p.res >= 0 && p.dst >= 0) {
      let row = carriedLoads.get(p.dst);
      if (row === undefined) { row = economy.resources.map((): number => 0); carriedLoads.set(p.dst, row); }
      row[p.res] += p.load;
    }
  }
  const row = carriedLoads.get(id);
  if (row !== undefined) for (let k = 0; k < out.length; k++) out[k] += row[k];
  return out;
}
let carriedTick = -1, carriedPeople = -1, carriedLoads: Map<number, number[]> = new Map<number, number[]>();
