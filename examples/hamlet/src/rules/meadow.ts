import { world, Building, tileIndex } from '../world/world';
import { BuildingDef } from '../world/economy';
import { season, WINTER } from './season';
import { BI_PLAIN } from '../gen/terrain';

// Bees: a building with `offSeasons` does no work in those seasons (the hives sleep in winter) and one with `bloom` works faster the more flowers (world.deco)
// stand around it. Both are data of economy.json; the engine asks here when a work cycle starts.

/** The flower tiles within the building's bloom radius (a square of tiles), at most `max`. 0 for a building without bloom. */
export function flowersAround(b: Building, def: BuildingDef): number {
  if (def.bloom === null) return 0;
  const r = def.bloom.radius;
  let n = 0;
  for (let dj = -r; dj <= r + b.h - 1; dj++) for (let di = -r; di <= r + b.w - 1; di++) {
    const i = b.i + di, j = b.j + dj;
    if (i >= 0 && j >= 0 && i < world.size && j < world.size && flower(world.deco[tileIndex(i, j)])) n++;
  }
  return season() === WINTER ? 0 : Math.min(n, def.bloom.max);          // nothing flowers under the snow
}
const flower = (deco: number): boolean => deco === 1 || deco === 2;
/** The tiles of fertile plain within a farm's `soil` radius, at most `max` (0 for a building without soil). */
export function soilAround(b: Building, def: BuildingDef): number {
  if (def.soil === null) return 0;
  const r = def.soil.radius;
  let n = 0;
  for (let dj = -r; dj <= r + b.h - 1; dj++) for (let di = -r; di <= r + b.w - 1; di++) {
    const i = b.i + di, j = b.j + dj;
    if (i >= 0 && j >= 0 && i < world.size && j < world.size && world.biome[tileIndex(i, j)] === BI_PLAIN) n++;
  }
  return Math.min(n, def.soil.max);
}
/** True when the building's season is closed: no work cycle starts. */
export function resting(def: BuildingDef): boolean { return def.offSeasons.length > 0 && def.offSeasons.indexOf(season()) >= 0; }
/** How many times faster a work cycle runs here: 1 plus `per` for each flower. */
export function workScale(b: Building, def: BuildingDef): number { return 1 + (def.bloom === null ? 0 : flowersAround(b, def) * def.bloom.per) + (def.soil === null ? 0 : soilAround(b, def) * def.soil.per); }
