import { HOUSE, TOOL_ROAD, TOOL_ERASE, TOOL_HOUSE, PLACE_OK, PLACE_BLOCKED, PLACE_NO_ROAD, PLACE_NO_STOCK, PLACE_NO_WATER, PLACE_NO_LODE, PLACE_LOCKED, ROCK_DEPOSIT } from '../constants';
import { world, newBuilding, recount, tileIndex, tileI, tileJ, neighbor, isOpen, waterNeighbor } from '../world/world';
import { economy } from '../world/economy';
import { releaseWorkers, removeResidents } from '../engine/villagers';
import { canPay, pay } from './stock';
import { isUnlocked } from './goals';

/** The tool that places a building type. */
export function toolOf(id: string): number { return TOOL_HOUSE + economy.typeOf(id); }

function hasRoadNeighbor(t: number): boolean {
  for (let d = 0; d < 4; d++) { const v = neighbor(t, d); if (v >= 0 && world.road[v]) return true; }
  return false;
}

/** A deposit of kind k within 8 tiles (Manhattan) of the tile: a gatherer built farther has nothing to work. */
function lodeNear(t: number, k: number): boolean {
  const i = tileI(t), j = tileJ(t);
  for (let u = 0; u < world.rock.length; u++) if (world.rock[u] === ROCK_DEPOSIT + k && Math.abs(tileI(u) - i) + Math.abs(tileJ(u) - j) <= 8) return true;
  return false;
}
/** Why a tool cannot act on a tile (PLACE_OK when it can). */
export function checkTool(tool: number, t: number): number {
  if (t < 0) return PLACE_BLOCKED;
  if (tool === TOOL_ERASE) return ((world.build[t] >= 0 && !world.buildings[world.build[t]].fixed) || (world.road[t] && t !== world.gate) || world.tree[t] > 0) ? PLACE_OK : PLACE_BLOCKED;   // a tree can be razed: it brings nothing
  if (!isOpen(t)) return PLACE_BLOCKED;
  if (tool === TOOL_ROAD) return PLACE_OK;
  const def = economy.buildings[tool - TOOL_HOUSE];
  if (!def.buildable) return PLACE_BLOCKED;
  if (def.gather === 'shore' && waterNeighbor(t) < 0) return PLACE_NO_WATER;
  if (!isUnlocked(tool - TOOL_HOUSE)) return PLACE_LOCKED;
  if (def.lode >= 0 && !lodeNear(t, def.lode)) return PLACE_NO_LODE;
  if (def.needsRoad && !hasRoadNeighbor(t)) return PLACE_NO_ROAD;
  return canPay(def.cost) ? PLACE_OK : PLACE_NO_STOCK;
}

export function addBuilding(type: number, t: number): number { return newBuilding(type, t); }
export function destroyBuilding(id: number): void {
  const b = world.buildings[id];
  if (b.type === HOUSE) removeResidents(id); else releaseWorkers(id);
  b.alive = false; world.build[tileIndex(b.i, b.j)] = -1;
}

/** Applies a tool to a tile. Returns PLACE_OK when something changed, else the reason. */
export function applyTool(tool: number, t: number): number {
  const code = checkTool(tool, t);
  if (code !== PLACE_OK) return code;
  if (tool === TOOL_ERASE) {
    if (world.build[t] >= 0) destroyBuilding(world.build[t]); else if (world.road[t]) world.road[t] = 0; else { world.tree[t] = 0; world.claimed[t] = 0; }
  } else if (tool === TOOL_ROAD) {
    world.road[t] = 1; world.deco[t] = 0;
  } else {
    pay(economy.buildings[tool - TOOL_HOUSE].cost);
    addBuilding(tool - TOOL_HOUSE, t);
  }
  recount();
  world.revision++; world.saveDirty = true;
  return PLACE_OK;
}
