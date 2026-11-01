// A seeded terrain generator: (seed, width, height, params) -> layers of tile classes. No game types in here, so another game can take the folder.
// Integer hash and value noise only (no sin): the same seed, size and params give the same layers on every engine and CPU.
import { hash, noise } from '../world/noise';

export const BIOME_MIXED = 0;      // pines and birches together
export const BIOME_PINE = 1;
export const BIOME_BIRCH = 2;
export const BIOME_MEADOW = 3;     // few trees, scattered

export class TerrainParams {
  waterAmount: number = .5;        // 0 none, .5 one pond, 1 a large lake
  river: boolean = false;          // a stream across the map, north to south, in the east half
  forestDensity: number = .5;      // 0 clearing .. 1 dense wood
  rockDensity: number = .5;
  biome: number = BIOME_MIXED;
  tile: number = 2;                // world units per tile (the pond is measured in them)
  clearI: number = -1; clearJ: number = -1; clearR: number = 0;   // tiles within this walking distance of (clearI, clearJ) get no tree, rock or flower
  edge: number = .985;             // beyond this superellipse radius the tiles are `outside` (the dissolved border of a diorama); 0 turns it off
}
/** One value per tile, row after row (index = j * width + i). */
export class TerrainLayers {
  width: number = 0; height: number = 0;
  outside: number[] = [];          // 1 beyond the border
  water: number[] = [];            // 1 water (pond, lake, river)
  wet: number[] = [];              // 2 on the shore (a water tile next to it), 1 two tiles away: where reeds and clay lie
  forest: number[] = [];           // 0 none, else the tree variant + 1 (1 to 4)
  rock: number[] = [];             // 0 none, else the rock variant + 1 (1 or 2)
  deco: number[] = [];             // 0 none, 1 and 2 flowers
  pondX: number = 0; pondY: number = 0; pondR: number = 0; offsetX: number = 0; offsetY: number = 0;   // the pond's blob, for drawing its shore per pixel
  riverI: number[] = [];           // the column of the river in each row (empty without a river)
}

/** Below 1 inside the pond: an irregular blob, continuous so a renderer can draw the shore per pixel. */
export function pondField(l: TerrainLayers, x: number, y: number): number {
  const dx = (x - l.pondX) * .9, dy = (y - l.pondY) * 1.1;
  return Math.sqrt(dx * dx + dy * dy) / l.pondR + (noise(x * .35 + l.offsetX, y * .35 + l.offsetY) - .5) * .55;
}

export function terrain(seed: number, w: number, h: number, p: TerrainParams): TerrainLayers {
  const l = new TerrainLayers(), n = w * h, ts = p.tile, halfX = w * ts / 2, halfY = h * ts / 2;
  l.width = w; l.height = h;
  const zeros = (): number[] => Array.from({ length: n }, (): number => 0);
  l.outside = zeros(); l.water = zeros(); l.wet = zeros(); l.forest = zeros(); l.rock = zeros(); l.deco = zeros();
  l.offsetX = hash(seed, 1) * 40; l.offsetY = hash(seed, 2) * 40;
  const pondI = Math.floor(w * (.42 + hash(seed, 3) * .33));
  const pondJ = hash(seed, 4) < .5 ? Math.floor(h * (.08 + hash(seed, 5) * .25)) : Math.floor(h * (.67 + hash(seed, 5) * .25));
  l.pondX = (pondI + .5) * ts - halfX; l.pondY = (pondJ + .5) * ts - halfY;
  l.pondR = (2.6 + hash(seed, 6) * 1.2) * (.5 + p.waterAmount);
  const forestAt = (centre: boolean): number => (centre ? .74 : .56) + (.5 - p.forestDensity) * .5 + (p.biome === BIOME_MEADOW ? .2 : 0);
  const rockAt = .94 + (.5 - p.rockDensity) * .12;
  for (let t = 0; t < n; t++) {
    const i = t % w, j = Math.floor(t / w), x = (i + .5) * ts - halfX, y = (j + .5) * ts - halfY;
    const ex = x / halfX, ey = y / halfY, edge = Math.sqrt(Math.sqrt(ex * ex * ex * ex + ey * ey * ey * ey));
    if (p.edge > 0 && edge > p.edge) { l.outside[t] = 1; continue; }
    if (p.waterAmount > 0 && pondField(l, x, y) < 1) { l.water[t] = 1; continue; }
    if (p.clearR > 0 && Math.abs(i - p.clearI) + Math.abs(j - p.clearJ) <= p.clearR) continue;   // the entrance stays clear
    const centre = i >= w * .25 && i <= w * .7 && j >= h * .25 && j <= h * .7;                  // the middle stays mostly open
    const forest = noise(i * .5 + l.offsetX, j * .5 + l.offsetY);
    if (forest > forestAt(centre) && hash(i + seed, j) > .3) {
      const v = hash(i, j + seed);
      l.forest[t] = p.biome === BIOME_PINE ? 1 + Math.floor(v * 3) : p.biome === BIOME_BIRCH ? 4 : 1 + Math.floor(v * 4);
    } else if (hash(i * 3 + seed, j * 7) > rockAt) l.rock[t] = 1 + Math.floor(hash(j, i) * 2);
    else { const d = hash(i * 5, j * 11 + seed); l.deco[t] = d > .9 ? 2 : d > .78 ? 1 : 0; }
  }
  if (p.river) carveRiver(l, seed, p);
  for (let t = 0; t < n; t++) if (l.water[t] === 0 && l.outside[t] === 0) {          // wetness: how close the shore is
    const i = t % w, j = Math.floor(t / w);
    let best = 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const a = i + di, b = j + dj, d = Math.abs(di) + Math.abs(dj);
      if (a < 0 || b < 0 || a >= w || b >= h || d === 0 || d > 2 || l.water[b * w + a] === 0) continue;
      best = Math.max(best, d === 1 ? 2 : 1);
    }
    l.wet[t] = best;
  }
  return l;
}

/** A stream from the north edge to the south edge in the east half: its column wanders with noise, two tiles wide. The clear zone keeps its trees off. */
function carveRiver(l: TerrainLayers, seed: number, p: TerrainParams): void {
  const w = l.width, h = l.height, base = w * (.62 + hash(seed, 11) * .2);
  for (let j = 0; j < h; j++) {
    const i0 = Math.floor(base + (noise(j * .22 + l.offsetX, 3.5) - .5) * w * .22);
    l.riverI.push(i0);
    for (let i = i0; i <= i0 + 1; i++) {
      if (i < 0 || i >= w) continue;
      const t = j * w + i;
      if (l.outside[t] === 1) continue;
      l.water[t] = 1; l.forest[t] = 0; l.rock[t] = 0; l.deco[t] = 0;
    }
  }
}
