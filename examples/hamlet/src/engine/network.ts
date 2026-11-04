import { world, Building, neighbor, tileIndex, rectEdge } from '../world/world';
import { isWalkable } from './path';
import { economy } from '../world/economy';

// The road network, as in Augustus: every connected piece of road has an id (a flood fill, redone when a road or a building changes: world.netRev) and a building belongs to the network
// of the road at its door. Only the network that holds the entrance (the gate) lets people in and out; goods move only inside a network that holds a store. A building off the gate's
// network is idle and says so. The ids and the two flags per network are the whole result: nothing here walks per tick.

let builtRev = -1, cells = 0, count = 0;
let comp: number[] = [];                 // per tile: the id of its road network, -1: not a road
let queue: number[] = [];
let hasStore: number[] = [];             // per network: 1 when a store stands at its door
let gateNet = -1;

function build(): void {
  if (builtRev === world.netRev && cells === world.road.length) return;
  cells = world.road.length;
  if (comp.length !== cells) { comp = Array.from({ length: cells }, (): number => -1); queue = Array.from({ length: cells }, (): number => 0); }
  else for (let t = 0; t < cells; t++) comp[t] = -1;
  count = 0;
  for (let t = 0; t < cells; t++) {
    if (!world.road[t] || comp[t] >= 0) continue;
    let head = 0, tail = 0;
    queue[tail++] = t; comp[t] = count;
    while (head < tail) {
      const u = queue[head++];
      for (let d = 0; d < 4; d++) { const v = neighbor(u, d); if (v >= 0 && world.road[v] && comp[v] < 0) { comp[v] = count; queue[tail++] = v; } }
    }
    count++;
  }
  hasStore = Array.from({ length: count }, (): number => 0);
  for (const b of world.buildings) {
    if (!b.alive || !economy.buildings[b.type].store) continue;
    for (const v of edgeTiles(b)) if (comp[v] >= 0) hasStore[comp[v]] = 1;
  }
  gateNet = comp[world.gate];
  builtRev = world.netRev;
}
/** The tiles beside the footprint (4 directions, outside it), grouped by direction. For a 1 x 1 building they are its four neighbours in the order +x, -x, +y, -y. A door is any of them. */
export function edgeTiles(b: Building): number[] { return rectEdge(b.i, b.j, b.w, b.h); }
/** The network id of the road at the building's door (the lowest road network beside it, so the answer never depends on an order), or -1: no road reaches it. */
export function netOf(b: Building): number {
  if (builtRev !== world.netRev) build();
  let best = -1;
  for (const v of edgeTiles(b)) if (comp[v] >= 0 && (best < 0 || comp[v] < best)) best = comp[v];
  return best;
}
/** The road tile where people leave the building and enter it: the lowest road tile beside it, -1 when there is none. The tile a walker is spawned on. */
export function doorOf(b: Building): number {
  let best = -1;
  for (const v of edgeTiles(b)) if (world.road[v] && (best < 0 || v < best)) best = v;
  return best;
}
/** The tile a walker goes to for a building: its own tile when it is 1 x 1 (the walker stops beside it); a bigger one has no single tile to stand beside, so it is the road tile at its door (doorOf), else the first walkable tile beside it. */
export function goalOf(b: Building): number {
  const t = tileIndex(b.i, b.j);
  if (b.w * b.h === 1) return t;
  const door = doorOf(b);
  if (door >= 0 && isWalkable(door)) return door;
  for (const v of edgeTiles(b)) if (isWalkable(v)) return v;
  return t;
}
/** The id of the network holding the entrance. */
export function gateNetwork(): number { build(); return gateNet; }
/** How many separate road networks there are (for the debug panel). */
export function networkCount(): number { build(); return count; }
/** The network id of a road tile (-1: none). */
export function netAt(t: number): number { build(); return comp[t]; }
/** True when a road at the building's door leads to the entrance: the building is part of the village. */
export function onGateNetwork(b: Building): boolean {
  build();
  for (const v of edgeTiles(b)) if (comp[v] >= 0 && comp[v] === gateNet) return true;
  return false;
}
/** True when a road at the building's door leads to a store (goods can leave and enter). */
export function onStoreNetwork(b: Building): boolean {
  build();
  for (const v of edgeTiles(b)) if (comp[v] >= 0 && hasStore[comp[v]] === 1) return true;
  return false;
}
