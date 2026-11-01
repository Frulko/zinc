// A seeded terrain generator: (seed, width, height, params) -> layers of tile classes. No game types in here, so another game can take the folder.
// Integer hash and value noise only (no sin): the same seed, size and params give the same layers on every engine and CPU.
import { hash, noise } from '../world/noise';

export const BIOME_MIXED = 0;      // pines and birches together
export const BIOME_PINE = 1;
export const BIOME_BIRCH = 2;
export const BIOME_MEADOW = 3;     // few trees, scattered

/** What a land tile is, for the ground, the trees' colours of each season and the farms: the names are the keys of assets/biomes.json, in this order. */
export const BI_MEADOW = 0, BI_FOREST = 1, BI_PINE = 2, BI_GROVE = 3, BI_HILLS = 4, BI_MARSH = 5, BI_PLAIN = 6, BI_COAST = 7;
export const BIOME_IDS: string[] = ['meadow', 'forest', 'pine', 'grove', 'hills', 'marsh', 'plain', 'coast'];
export const DECO_REEDS = 3;       // deco ids: 1 and 2 flowers, 3 reeds on a marsh shore, 4 a game trail (ground only)
export const DECO_TRAIL = 4;

export class TerrainParams {
  waterAmount: number = .5;        // 0 none, .5 one pond, 1 a large lake
  river: boolean = false;          // a stream across the map, north to south, in the east half
  forestDensity: number = .5;      // 0 clearing .. 1 dense wood
  rockDensity: number = .5;
  biome: number = BIOME_MIXED;
  tile: number = 2;                // world units per tile (the pond is measured in them)
  clearI: number = -1; clearJ: number = -1; clearR: number = 0;   // tiles within this walking distance of (clearI, clearJ) get no tree, rock or flower
  coast: number = 0;               // 0 none, up to 1: a sea along the south edge (the wider, the deeper)
  outcrop: number = 0;             // 0 none, up to 1: clusters of rock outcrops that displace the trees (mountain country)
  flowers: number = 0;             // 0 the default, up to 1: meadows full of flowers
  biomes: number = 1;              // 1: forests, meadows, marsh and rocky hills come from moisture, warmth and height fields (clumps and clearings); 0: the uniform scatter of the first villages
  wolves: number = 0;              // 0 none; 1 a pack or two in forest country (and only there); 2 the same, and they can maul a villager alone at night
  edge: number = .985;             // beyond this superellipse radius the tiles are `outside` (the dissolved border of a diorama); 0 turns it off
}
/** A copy: the generator writes the entrance into the params it is given, so a shared set (a preset) must not be passed as is. */
export function copyTerrainParams(p: TerrainParams): TerrainParams {
  const q = new TerrainParams();
  q.waterAmount = p.waterAmount; q.river = p.river; q.forestDensity = p.forestDensity; q.rockDensity = p.rockDensity; q.biome = p.biome; q.tile = p.tile; q.clearI = p.clearI; q.clearJ = p.clearJ; q.clearR = p.clearR;
  q.coast = p.coast; q.outcrop = p.outcrop; q.flowers = p.flowers; q.biomes = p.biomes; q.edge = p.edge; q.wolves = p.wolves;
  return q;
}
/** One value per tile, row after row (index = j * width + i). */
export class TerrainLayers {
  width: number = 0; height: number = 0;
  outside: number[] = [];          // 1 beyond the border
  water: number[] = [];            // 1 water (pond, lake, river)
  wet: number[] = [];              // 2 on the shore (a water tile next to it), 1 two tiles away: where reeds and clay lie
  forest: number[] = [];           // 0 none, else the tree variant + 1 (1 to 4)
  rock: number[] = [];             // 0 none, else the rock variant + 1 (1 or 2)
  deco: number[] = [];             // 0 none, 1 and 2 flowers, 3 reeds, 4 a game trail
  biome: number[] = [];            // BI_*: the kind of ground of every tile
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
  l.outside = zeros(); l.water = zeros(); l.wet = zeros(); l.forest = zeros(); l.rock = zeros(); l.deco = zeros(); l.biome = zeros();
  l.offsetX = hash(seed, 1) * 40; l.offsetY = hash(seed, 2) * 40;
  const pondI = Math.floor(w * (.42 + hash(seed, 3) * .33));
  const pondJ = hash(seed, 4) < .5 ? Math.floor(h * (.08 + hash(seed, 5) * .25)) : Math.floor(h * (.67 + hash(seed, 5) * .25));
  l.pondX = (pondI + .5) * ts - halfX; l.pondY = (pondJ + .5) * ts - halfY;
  l.pondR = (2.6 + hash(seed, 6) * 1.2) * (.5 + p.waterAmount) * Math.max(1, w / 32);   // a big map gets a bigger pond
  if (p.waterAmount <= 0) l.pondR = .001;                        // no pond: a renderer that paints the blob finds it empty
  const forestAt = (centre: boolean): number => (centre ? .74 : .56) + (.5 - p.forestDensity) * .5 + (p.biome === BIOME_MEADOW ? .2 : 0);
  const rockAt = .94 + (.5 - p.rockDensity) * .12;
  for (let t = 0; t < n; t++) {
    const i = t % w, j = Math.floor(t / w), x = (i + .5) * ts - halfX, y = (j + .5) * ts - halfY;
    const ex = x / halfX, ey = y / halfY, edge = Math.sqrt(Math.sqrt(ex * ex * ex * ex + ey * ey * ey * ey));
    if (p.edge > 0 && edge > p.edge) { l.outside[t] = 1; continue; }
    if (p.coast > 0 && j > h * (.9 - p.coast * .14) + (noise(i * .3 + l.offsetX, 7.7) - .5) * h * .1) { l.water[t] = 1; continue; }
    if (p.waterAmount > 0 && pondField(l, x, y) < 1) { l.water[t] = 1; continue; }
    if (p.clearR > 0 && Math.abs(i - p.clearI) + Math.abs(j - p.clearJ) <= p.clearR) continue;   // the entrance stays clear
    if (p.biomes > 0) continue;                                                              // the biome pass below fills the land
    if (p.outcrop > 0 && noise(i * .35 + l.offsetX + 50, j * .35 + l.offsetY) > 1 - p.outcrop * .32 && hash(i * 13 + seed, j) > .35) { l.rock[t] = 1 + Math.floor(hash(j, i + seed) * 2); continue; }
    const centre = i >= w * .25 && i <= w * .7 && j >= h * .25 && j <= h * .7;                  // the middle stays mostly open
    const forest = noise(i * .5 + l.offsetX, j * .5 + l.offsetY);
    if (forest > forestAt(centre) && hash(i + seed, j) > .3) {
      const v = hash(i, j + seed);
      l.forest[t] = p.biome === BIOME_PINE ? 1 + Math.floor(v * 3) : p.biome === BIOME_BIRCH ? 4 : 1 + Math.floor(v * 4);
    } else if (hash(i * 3 + seed, j * 7) > rockAt) l.rock[t] = 1 + Math.floor(hash(j, i) * 2);
    else { const d = hash(i * 5, j * 11 + seed); l.deco[t] = d > .9 - p.flowers * .2 ? 2 : d > .78 - p.flowers * .3 ? 1 : 0; }
  }
  if (p.river) carveRiver(l, seed, p);
  if (p.biomes > 0) { biomePass(l, seed, p); gameTrails(l, seed, p); }
  for (let t = 0; t < n; t++) if (l.water[t] === 0 && l.outside[t] === 0) {          // wetness: how close the shore is
    const i = t % w, j = Math.floor(t / w);
    let best = 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const a = i + di, b = j + dj, d = Math.abs(di) + Math.abs(dj);
      if (a < 0 || b < 0 || a >= w || b >= h || d === 0 || d > 2 || l.water[b * w + a] === 0) continue;
      best = Math.max(best, d === 1 ? 2 : 1);
    }
    l.wet[t] = best;
    if (best === 2 && l.biome[t] === BI_MEADOW) l.biome[t] = BI_MARSH;
    if (best > 0 && p.coast > 0 && j > h * .7) { l.biome[t] = BI_COAST; if (l.deco[t] === DECO_REEDS) l.deco[t] = 0; }    // the sea shore is sand, not marsh
  }
  return l;
}

/** A stream from the north edge to the south edge in the east half: its column wanders with noise, two tiles wide. The clear zone keeps its trees off. */
function carveRiver(l: TerrainLayers, seed: number, p: TerrainParams): void {
  const w = l.width, h = l.height, base = w * (.62 + hash(seed, 11) * .2);
  for (let j = 0; j < h; j++) {
    const i0 = Math.floor(base + (noise(j * .22 + l.offsetX, 3.5) - .5) * w * .22);
    l.riverI.push(i0);
    for (let i = i0; i <= i0 + 1 + (p.biomes > 0 && j > h * .55 ? 1 : 0); i++) {      // it widens downstream
      if (i < 0 || i >= w) continue;
      const t = j * w + i;
      if (l.outside[t] === 1) continue;
      l.water[t] = 1; l.forest[t] = 0; l.rock[t] = 0; l.deco[t] = 0;
    }
  }
}

/** Manhattan distance to the nearest water tile, capped at 9 (two passes over the grid). */
function waterDistance(l: TerrainLayers): number[] {
  const w = l.width, h = l.height, d: number[] = Array.from({ length: w * h }, (_v: number, t: number): number => l.water[t] === 1 ? 0 : 9);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const t = j * w + i; if (i > 0) d[t] = Math.min(d[t], d[t - 1] + 1); if (j > 0) d[t] = Math.min(d[t], d[t - w] + 1); }
  for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) { const t = j * w + i; if (i < w - 1) d[t] = Math.min(d[t], d[t + 1] + 1); if (j < h - 1) d[t] = Math.min(d[t], d[t + w] + 1); }
  return d;
}
/**
 * Biomes from three smooth fields (moisture, warmth, height) and the distance to water, per land tile: rocky hills on high ground, bare shore and marsh by the water,
 * forest in clumps with glades and a thin edge, birch groves where it is warm, pines where it is cold, meadow with flowers elsewhere, a lone tree or rock now and then.
 * Most tiles stay empty: the forest density only changes how much of the map the clumps cover.
 */
function biomePass(l: TerrainLayers, seed: number, p: TerrainParams): void {
  const w = l.width, h = l.height, dw = waterDistance(l), ox = l.offsetX, oy = l.offsetY;
  const cover = .62 - (p.forestDensity - .5) * .5 + (p.biome === BIOME_MEADOW ? .12 : 0);        // the patch noise above this is forest
  const hills = .66 - (p.rockDensity - .5) * .3;
  for (let t = 0; t < w * h; t++) {
    if (l.outside[t] === 1 || l.water[t] === 1) continue;
    const i = t % w, j = Math.floor(t / w);
    if (p.clearR > 0 && Math.abs(i - p.clearI) + Math.abs(j - p.clearJ) <= p.clearR) continue;
    const moist = noise(i * .07 + ox + 100, j * .07 + oy), warm = noise(i * .06 + ox + 200, j * .06 + oy + 50), high = noise(i * .08 + ox + 300, j * .08 + oy + 80) + (p.outcrop > 0 ? p.outcrop * .12 : 0);
    const patch = noise(i * .16 + ox + 400, j * .16 + oy) * .7 + noise(i * .45 + ox, j * .45 + oy + 400) * .3 + (moist - .5) * .25 - (dw[t] <= 3 ? (4 - dw[t]) * .07 : 0);   // trees thin out toward water
    const near = dw[t];
    if (near <= 1) {                                                                              // the shore and the marsh: open ground, reeds at the water's edge
      l.biome[t] = BI_MARSH;
      if (near === 1) l.deco[t] = hash(i + seed, j * 3) > .55 ? DECO_REEDS : hash(i * 7, j + seed) > .85 ? 1 : 0;
      continue;
    }
    if (high > hills) {                                                                           // rocky hills: outcrops and scree
      l.biome[t] = BI_HILLS;
      if (noise(i * .4 + ox + 500, j * .4 + oy) > .5 && hash(i * 3 + seed, j * 7) > .45) l.rock[t] = 1 + Math.floor(hash(j, i) * 2);
      else if (patch > cover + .08 && hash(i + seed, j) > .6) l.forest[t] = p.biome === BIOME_BIRCH ? 4 : 1 + Math.floor(hash(i, j + seed) * 3);
      continue;
    }
    if (patch > cover - .03) l.biome[t] = p.biome === BIOME_PINE || warm < .38 && p.biome !== BIOME_BIRCH ? BI_PINE : p.biome === BIOME_BIRCH || warm > .62 ? BI_GROVE : BI_FOREST;   // the ground under a clump follows its trees
    else if (dw[t] >= 2 && dw[t] <= 5 && moist > .4 && high < hills - .08) l.biome[t] = BI_PLAIN;     // fertile plain: open, damp, near water (the farms like it)
    if (patch > cover && hash(i + seed, j) > (patch > cover + .08 ? .2 : .55)) {                  // forest: dense inside a clump, ragged on its edge
      const v = hash(i, j + seed);
      l.forest[t] = p.biome === BIOME_PINE ? 1 + Math.floor(v * 3) : p.biome === BIOME_BIRCH ? 4 : warm < .38 ? 1 + Math.floor(v * 3) : warm > .62 ? 4 : 1 + Math.floor(v * 4);
      continue;
    }
    const r = hash(i * 5 + seed, j * 11);
    if (hash(i * 13, j * 17 + seed) > .985) l.forest[t] = p.biome === BIOME_PINE ? 1 + Math.floor(hash(j, i + seed) * 3) : p.biome === BIOME_BIRCH ? 4 : 1 + Math.floor(hash(j, i + seed) * 4);   // a lone tree
    else if (hash(i * 19 + seed, j * 23) > .99) l.rock[t] = 1 + Math.floor(r * 2);
    else {                                                                                       // flowers and bushes come in meadows, not on every free tile
      const bloom = noise(i * .22 + ox + 600, j * .22 + oy) > .55 ? .12 + p.flowers * .2 : .02;
      l.deco[t] = r < bloom * .35 ? 1 : r < bloom && moist > .3 ? 2 : 0;
    }
  }
}

/**
 * Game trails: the paths deer wear between the woods and the water. A walker leaves a start tile of open ground and steps downhill along the distance to water (with a
 * little noise) until it is at the shore; the empty tiles it crosses become trail (ground only: nothing stands on them, nothing is counted).
 */
function gameTrails(l: TerrainLayers, seed: number, p: TerrainParams): void {
  const w = l.width, h = l.height, dw = waterDistance(l), starts = 1 + Math.floor(w * h / 220);
  for (let k = 0; k < starts; k++) {
    let t = Math.floor(hash(k * 3 + seed, 31) * w * h), steps = 0;
    if (l.outside[t] === 1 || l.water[t] === 1 || dw[t] < 4 || l.biome[t] === BI_HILLS) continue;
    while (dw[t] > 1 && steps < 16) {
      const i = t % w, j = Math.floor(t / w);
      let best = -1, bestScore = 1e9;
      for (let d = 0; d < 4; d++) {
        const a = i + (d === 0 ? 1 : d === 1 ? -1 : 0), b = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (a < 0 || b < 0 || a >= w || b >= h) continue;
        const u = b * w + a, score = dw[u] + hash(u + k * 101, seed + steps) * 1.6;
        if (l.outside[u] === 0 && score < bestScore) { bestScore = score; best = u; }
      }
      if (best < 0) break;
      t = best; steps++;
      const i2 = t % w, j2 = Math.floor(t / w);
      if (l.deco[t] === 0 && l.forest[t] === 0 && l.rock[t] === 0 && l.water[t] === 0 && !(p.clearR > 0 && Math.abs(i2 - p.clearI) + Math.abs(j2 - p.clearJ) <= p.clearR)) l.deco[t] = DECO_TRAIL;
    }
  }
}
