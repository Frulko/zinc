import {
  HOUSE, FISHERY, TOOL_ROAD, TOOL_ERASE, TOOL_HOUSE, BUILDING_COST, PLACE_OK, PLACE_BLOCKED, PLACE_NO_ROAD, PLACE_NO_WOOD, PLACE_NO_WATER,
} from '../constants';
import { world, tileI, tileJ, tileIndex, neighbor, isOpen, waterNeighbor } from '../world/world';
import { releaseWorkers, removeResidents } from '../engine/villagers';

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
  const type = tool - TOOL_HOUSE;
  if (type === FISHERY && waterNeighbor(t) < 0) return PLACE_NO_WATER;
  if (!hasRoadNeighbor(t)) return PLACE_NO_ROAD;
  return world.wood >= BUILDING_COST[type] ? PLACE_OK : PLACE_NO_WOOD;
}

export function addBuilding(type: number, t: number): number {
  const id = world.buildings.length;
  world.buildings.push({ type, i: tileI(t), j: tileJ(t), alive: true, residents: 0, workers: 0, timer: 2 });
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
    const type = tool - TOOL_HOUSE;
    world.wood -= BUILDING_COST[type];
    addBuilding(type, t);
  }
  world.revision++; world.saveDirty = true;
  return PLACE_OK;
}
