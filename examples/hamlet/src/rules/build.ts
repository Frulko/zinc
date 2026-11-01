import { HOUSE, TOOL_ROAD, TOOL_ERASE, TOOL_HOUSE, PLACE_OK, PLACE_BLOCKED, PLACE_NO_ROAD, PLACE_NO_STOCK, PLACE_NO_WATER } from '../constants';
import { world, Building, tileI, tileJ, tileIndex, neighbor, isOpen, waterNeighbor } from '../world/world';
import { economy, Resource } from '../world/economy';
import { releaseWorkers, removeResidents } from '../engine/villagers';
import { canPay, pay } from './stock';

/** The tool that places a building type. */
export function toolOf(id: string): number { return TOOL_HOUSE + economy.typeOf(id); }

function hasRoadNeighbor(t: number): boolean {
  for (let d = 0; d < 4; d++) { const v = neighbor(t, d); if (v >= 0 && world.road[v]) return true; }
  return false;
}

/** Why a tool cannot act on a tile (PLACE_OK when it can). */
export function checkTool(tool: number, t: number): number {
  if (t < 0) return PLACE_BLOCKED;
  if (tool === TOOL_ERASE) return (world.build[t] >= 0 || (world.road[t] && t !== world.gate)) ? PLACE_OK : PLACE_BLOCKED;
  if (!isOpen(t)) return PLACE_BLOCKED;
  if (tool === TOOL_ROAD) return PLACE_OK;
  const def = economy.buildings[tool - TOOL_HOUSE];
  if (def.gather === 'shore' && waterNeighbor(t) < 0) return PLACE_NO_WATER;
  if (def.needsRoad && !hasRoadNeighbor(t)) return PLACE_NO_ROAD;
  return canPay(def.cost) ? PLACE_OK : PLACE_NO_STOCK;
}

export function addBuilding(type: number, t: number): number {
  const id = world.buildings.length;
  const b = new Building();
  b.type = type; b.i = tileI(t); b.j = tileJ(t); b.stock = economy.resources.map((_r: Resource): number => 0);
  world.buildings.push(b);
  world.build[t] = id; world.deco[t] = 0;
  return id;
}
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
    if (world.build[t] >= 0) destroyBuilding(world.build[t]); else world.road[t] = 0;
  } else if (tool === TOOL_ROAD) {
    world.road[t] = 1; world.deco[t] = 0;
  } else {
    pay(economy.buildings[tool - TOOL_HOUSE].cost);
    addBuilding(tool - TOOL_HOUSE, t);
  }
  world.revision++; world.saveDirty = true;
  return PLACE_OK;
}
