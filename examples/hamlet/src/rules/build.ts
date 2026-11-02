import { TERRAIN_GRASS, HOUSE, TOOL_ROAD, TOOL_ERASE, TOOL_HOUSE, PLACE_OK, PLACE_BLOCKED, PLACE_NO_ROAD, PLACE_NO_STOCK, PLACE_NO_WATER, PLACE_NO_LODE, PLACE_LOCKED, PLACE_UNEVEN, PLACE_ROCKY, MOUNTAIN_LEVEL, ROCK_DEPOSIT } from '../constants';
import { world, newBuilding, recount, tileIndex, tileI, tileJ, rectEdge, footprint, isOpen, waterNeighbor, heightAt, isFlat } from '../world/world';
import { economy } from '../world/economy';
import { releaseWorkers, removeResidents } from '../engine/villagers';
import { canPay, pay } from './stock';
import { isUnlocked } from './goals';
import { costOf, buildRoad, demolishRoad } from './roadplan';

/** The tool that places a building type. */
export function toolOf(id: string): number { return TOOL_HOUSE + economy.typeOf(id); }

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
  if (tool === TOOL_ROAD) return world.terrain[t] === TERRAIN_GRASS && heightAt(t) < MOUNTAIN_LEVEL && world.rock[t] === 0 && world.build[t] < 0 && world.road[t] === 0 ? (canPay(costOf([t])) ? PLACE_OK : PLACE_NO_STOCK) : PLACE_BLOCKED;   // a tree is cleared by the road
  const def = economy.buildings[tool - TOOL_HOUSE];
  const i = tileI(t), j = tileJ(t), tiles: number[] = [];
  if (i + def.w > world.size || j + def.h > world.size) return PLACE_BLOCKED;       // the footprint stays on the map
  for (let dj = 0; dj < def.h; dj++) for (let di = 0; di < def.w; di++) tiles.push(tileIndex(i + di, j + dj));
  for (const u of tiles) if (!isOpen(u)) return PLACE_BLOCKED;                         // no tree, rock, road, building or water on any tile
  for (const u of tiles) if (heightAt(u) >= MOUNTAIN_LEVEL) return PLACE_ROCKY;
  for (const u of tiles) if (!isFlat(u)) return PLACE_UNEVEN;                          // flat: every tile of the footprint on one level, as is what touches it
  if (!def.buildable) return PLACE_BLOCKED;
  if (def.gather === 'shore' && !tiles.some((u: number): boolean => waterNeighbor(u) >= 0)) return PLACE_NO_WATER;
  if (!isUnlocked(tool - TOOL_HOUSE)) return PLACE_LOCKED;
  if (def.lode >= 0 && !lodeNear(t, def.lode)) return PLACE_NO_LODE;
  if (def.needsRoad && !rectEdge(i, j, def.w, def.h).some((v: number): boolean => world.road[v] !== 0)) return PLACE_NO_ROAD;
  return canPay(def.cost) ? PLACE_OK : PLACE_NO_STOCK;
}

export function addBuilding(type: number, t: number, w: number = economy.buildings[type].w, h: number = economy.buildings[type].h): number { return newBuilding(type, t, w, h); }
export function destroyBuilding(id: number): void {
  const b = world.buildings[id];
  if (b.type === HOUSE) removeResidents(id); else releaseWorkers(id);
  b.alive = false; for (const u of footprint(b)) if (world.build[u] === id) world.build[u] = -1;
  world.netRev++;
}

/** Applies a tool to a tile. Returns PLACE_OK when something changed, else the reason. */
export function applyTool(tool: number, t: number): number {
  const code = checkTool(tool, t);
  if (code !== PLACE_OK) return code;
  if (tool === TOOL_ERASE) {
    if (world.build[t] >= 0) destroyBuilding(world.build[t]); else if (world.road[t]) demolishRoad([t]); else { world.tree[t] = 0; world.claimed[t] = 0; }
  } else if (tool === TOOL_ROAD) {
    buildRoad([t]);
  } else {
    pay(economy.buildings[tool - TOOL_HOUSE].cost);
    addBuilding(tool - TOOL_HOUSE, t);
  }
  recount();
  world.revision++; world.saveDirty = true;
  return PLACE_OK;
}
