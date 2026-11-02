import { TERRAIN_WATER } from '../constants';
import { world, tileIndex, tileI, tileJ } from '../world/world';
import { economy, AppealSource } from '../world/economy';
import { isPlaza } from './roadplan';

// Desirability: a grid of numbers, one per tile. Trees and water raise it, industry lowers it, each as rings of decreasing value around its source (data:
// economy.json "desirability" for the terrain, `appeal` on a building). It is recomputed in the daily slice, never per tick; houses read it to evolve.

/** Adds rings (value for distance 1, 2, ...) around tile (i, j), distance being the number of steps on the grid (diamond shaped rings). */
function stamp(grid: number[], i: number, j: number, rings: number[]): void {
  const n = rings.length, size = world.size;
  for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
    const d = Math.abs(di) + Math.abs(dj);
    if (d < 1 || d > n) continue;
    const x = i + di, y = j + dj;
    if (x >= 0 && y >= 0 && x < size && y < size) grid[y * size + x] += rings[d - 1];
  }
}
/** Stamps the terrain sources of tiles [from, to) into the grid. */
function stampTiles(grid: number[], from: number, to: number): void {
  const sources: AppealSource[] = economy.appeal;
  for (let t = from; t < to && sources.length > 0; t++) {
    for (const s of sources) {
      const here = s.kind === 'tree' ? world.tree[t] > 0 : s.kind === 'water' ? world.terrain[t] === TERRAIN_WATER : s.kind === 'plaza' ? isPlaza(t) : world.rock[t] > 0;
      if (here) stamp(grid, tileI(t), tileJ(t), s.rings);
    }
  }
}
/** The buildings' rings, then the clamp: the grid is final. */
function finish(grid: number[]): void {
  for (const b of world.buildings) if (b.alive && economy.buildings[b.type].appeal.length > 0) stamp(grid, b.i, b.j, economy.buildings[b.type].appeal);
  const max = economy.appealMax;
  for (let t = 0; t < grid.length; t++) grid[t] = Math.max(-max, Math.min(max, grid[t]));
  world.appeal = grid;
}
/** Recomputes world.appeal from the terrain and the buildings, at once (a loaded village, a test). */
export function computeAppeal(): void {
  const grid: number[] = Array.from({ length: world.size * world.size }, (): number => 0);
  stampTiles(grid, 0, grid.length);
  finish(grid);
}
// The daily pass spread over the last `economy.sim.appealSlices` ticks of a day: slice k of n stamps its share of the tiles into a scratch grid, the last one adds the buildings and installs it, just before the
// houses read it at the day's end. The result is the one computeAppeal gives; no tick pays for the whole map.
let scratch: number[] = [];
export function appealSlice(k: number, n: number): void {
  const size = world.size * world.size;
  if (k === 0 || scratch.length !== size) scratch = Array.from({ length: size }, (): number => 0);
  stampTiles(scratch, Math.floor(size * k / n), Math.floor(size * (k + 1) / n));
  if (k === n - 1) { const grid = scratch; scratch = []; finish(grid); }
}
/** The tiles worth showing in the overlay: their tile and value (positive pleasant, negative unpleasant). */
export function appealTiles(): number[][] {
  const out: number[][] = [];
  for (let t = 0; t < world.appeal.length; t++) if (world.terrain[t] === 0 && world.appeal[t] !== 0) out.push([t, world.appeal[t]]);
  return out;
}
/** The value on a building's tile, for a panel. */
export function appealAtBuilding(i: number, j: number): number { return world.appeal[tileIndex(i, j)]; }
