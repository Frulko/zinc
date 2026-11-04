// The village start guarantee: around the entrance there is always a connected, flat, tree- and rock-free area to build on (START_RADIUS tiles from the gate, at least `startNeed` buildable tiles),
// a grove within reach and water or fertile ground within reach. A map that lacks it is repaired, never rejected: first the trees and rocks near the gate are cleared, then a terrace is flattened
// (the foothill rule of the height pass lowers the ground around it), then a grove or a field is planted. No game types in here; works on any layers that have the fields below.
import { hash } from '../world/noise';
import { MOUNTAIN_LEVEL } from '../constants';

export const START_RADIUS = 12;     // Manhattan tiles from the gate
export const GROVE_REACH = 16;      // a grove (GROVE_TREES trees) lies within this many tiles of the gate, water or fertile ground within WATER_REACH
export const WATER_REACH = 24;
export const GROVE_TREES = 10;
export const FIELD_TILES = 6;
/** Trees wanted in the grove: ten, fewer on a tiny map (a third of its width). */
export function groveNeed(width: number): number { return Math.min(GROVE_TREES, Math.floor(width / 3)); }

/** The layers the guarantee reads and repairs (a TerrainLayers has them). */
export interface StartLayers { width: number; height: number; outside: number[]; water: number[]; forest: number[]; rock: number[]; deco: number[]; level: number[]; biome: number[]; }

/** Buildable tiles wanted: 60, a little more on a big map, never more than 45 % of the land that lies within the radius (a 12 x 12 map has little). */
export function startNeed(l: StartLayers, gi: number, gj: number): number {
  let land = 0;
  for (let j = Math.max(0, gj - START_RADIUS); j <= Math.min(l.height - 1, gj + START_RADIUS); j++) for (let i = Math.max(0, gi - START_RADIUS); i <= Math.min(l.width - 1, gi + START_RADIUS); i++) {
    const t = j * l.width + i;
    if (Math.abs(i - gi) + Math.abs(j - gj) <= START_RADIUS && l.outside[t] === 0 && l.water[t] === 0) land++;
  }
  return Math.min(60 + Math.max(0, (l.width - 24) >> 3), Math.floor(land * .45));
}

/** A land tile with a land neighbour on another level is not flat (water and the border do not count), as world.isFlat. */
function flat(l: StartLayers, i: number, j: number): boolean {
  const t = j * l.width + i;
  for (let d = 0; d < 4; d++) {
    const a = i + (d === 0 ? 1 : d === 1 ? -1 : 0), b = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
    if (a < 0 || b < 0 || a >= l.width || b >= l.height) continue;
    const u = b * l.width + a;
    if (l.outside[u] === 0 && l.water[u] === 0 && l.level[u] !== l.level[t]) return false;
  }
  return true;
}
/** Flat buildable tiles a walker from the gate reaches over bare ground of the gate's level, within the radius. */
export function startArea(l: StartLayers, gi: number, gj: number): number {
  const w = l.width, g = gj * w + gi, level = l.level[g], seen: number[] = Array.from({ length: w * l.height }, (): number => 0), queue: number[] = [g];
  seen[g] = 1;
  let count = 0;
  while (queue.length > 0) {
    const t = queue.pop() as number, i = t % w, j = Math.floor(t / w);
    if (l.forest[t] === 0 && l.rock[t] === 0 && flat(l, i, j)) count++;
    for (let d = 0; d < 4; d++) {
      const a = i + (d === 0 ? 1 : d === 1 ? -1 : 0), b = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (a < 0 || b < 0 || a >= w || b >= l.height || Math.abs(a - gi) + Math.abs(b - gj) > START_RADIUS) continue;
      const u = b * w + a;
      if (seen[u] === 1 || l.outside[u] === 1 || l.water[u] === 1 || l.forest[u] !== 0 || l.rock[u] !== 0 || l.level[u] !== level) continue;
      seen[u] = 1; queue.push(u);
    }
  }
  return count;
}
function clearObjects(l: StartLayers, gi: number, gj: number, r: number): void {
  for (let j = Math.max(0, gj - r); j <= Math.min(l.height - 1, gj + r); j++) for (let i = Math.max(0, gi - r); i <= Math.min(l.width - 1, gi + r); i++) {
    const t = j * l.width + i;
    if (Math.abs(i - gi) + Math.abs(j - gj) <= r && l.level[t] < MOUNTAIN_LEVEL) { l.forest[t] = 0; l.rock[t] = 0; }
  }
}
/** Levels the disc of radius r to the gate's level, then lowers the ground around it: no step above one level below the mountain rock (the height pass's foothill rule). */
function flatten(l: StartLayers, gi: number, gj: number, r: number): void {
  const w = l.width, h = l.height, lv = l.level, level = lv[gj * w + gi];
  for (let j = Math.max(0, gj - r); j <= Math.min(h - 1, gj + r); j++) for (let i = Math.max(0, gi - r); i <= Math.min(w - 1, gi + r); i++) {
    const t = j * w + i;
    if (Math.abs(i - gi) + Math.abs(j - gj) <= r && l.outside[t] === 0 && l.water[t] === 0) { lv[t] = level; l.forest[t] = 0; l.rock[t] = 0; }
  }
  for (let pass = 0; pass < 24; pass++) {
    let changed = false;
    for (let t = 0; t < w * h; t++) {
      if (lv[t] === 0 || lv[t] >= MOUNTAIN_LEVEL) continue;
      const i = t % w, j = Math.floor(t / w);
      let low = lv[t];
      if (i > 0) low = Math.min(low, lv[t - 1] + 1); if (i < w - 1) low = Math.min(low, lv[t + 1] + 1);
      if (j > 0) low = Math.min(low, lv[t - w] + 1); if (j < h - 1) low = Math.min(low, lv[t + w] + 1);
      if (low < lv[t]) { lv[t] = low; changed = true; }
    }
    if (!changed) break;
  }
}
/** Counts what lies within `reach` of the gate: trees, and (water tiles, plain tiles). */
function around(l: StartLayers, gi: number, gj: number, reach: number, plain: number): number[] {
  let trees = 0, water = 0, fields = 0;
  for (let j = Math.max(0, gj - reach); j <= Math.min(l.height - 1, gj + reach); j++) for (let i = Math.max(0, gi - reach); i <= Math.min(l.width - 1, gi + reach); i++) {
    const t = j * l.width + i, d = Math.abs(i - gi) + Math.abs(j - gj);
    if (d > reach) continue;
    if (d <= GROVE_REACH && l.forest[t] !== 0) trees++;
    if (l.water[t] === 1) water++;
    if (d <= GROVE_REACH && l.biome[t] === plain && l.water[t] === 0) fields++;
  }
  return [trees, water, fields];
}

/**
 * Makes the start guarantee hold. Returns what it took (+ 16 when the map failed the guarantee before the repair): 0 nothing, 1 trees and rocks cleared, 2 a terrace flattened; `+ 4` when a grove was planted, `+ 8` when fertile ground was made.
 * `plain` is the biome id of fertile ground. The clear zone round the gate (the entrance) is the centre: (gi, gj).
 */
export function ensureStart(l: StartLayers, seed: number, gi: number, gj: number, plain: number): number {
  const want = startNeed(l, gi, gj), trigger = want + Math.ceil(want * .3), need = want + Math.ceil(want * .6);          // a margin: the deposit patches, the hall and the trees of the cover pass take tiles after the terrain
  let took = startArea(l, gi, gj) < want ? 16 : 0;           // 16: the map failed the guarantee before the repair
  if (startArea(l, gi, gj) < trigger) {
    let ok = false;
    for (let r = 5; r <= START_RADIUS && !ok; r++) { clearObjects(l, gi, gj, r); ok = startArea(l, gi, gj) >= need; }
    took |= 1;
    for (let r = 6; r <= START_RADIUS && !ok; r++) { flatten(l, gi, gj, r); ok = startArea(l, gi, gj) >= need; took = (took & 16) | 2; }
  }
  const [trees, water, fields] = around(l, gi, gj, WATER_REACH, plain);
  const groves = groveNeed(l.width);
  if (trees < groves) {                      // a grove just beyond the start area (13 to 16 tiles) so the start keeps its room
    let planted = 0;
    for (let d = l.width < 20 ? 7 : START_RADIUS + 1; d <= GROVE_REACH && planted < groves - trees; d++) for (let j = Math.max(0, gj - d); j <= Math.min(l.height - 1, gj + d) && planted < groves - trees; j++) for (let i = Math.max(0, gi - d); i <= Math.min(l.width - 1, gi + d) && planted < groves - trees; i++) {
      const t = j * l.width + i;
      if (Math.abs(i - gi) + Math.abs(j - gj) !== d || l.outside[t] === 1 || l.water[t] === 1 || l.forest[t] !== 0 || l.rock[t] !== 0 || l.level[t] >= MOUNTAIN_LEVEL || hash(i * 7 + seed, j * 13) > .75) continue;
      l.forest[t] = 1 + Math.floor(hash(i, j + seed) * 4); l.deco[t] = 0; planted++;
      if (startArea(l, gi, gj) < want) { l.forest[t] = 0; planted = 1e9; }                 // a tree that would eat the start area is not planted, and the planting stops
    }
    took += 4;
  }
  if (water === 0 && fields < FIELD_TILES) {      // no water in reach: a patch of fertile ground on the flat free tiles at 8 to 12 tiles
    let made = 0;
    for (let d = 8; d <= START_RADIUS && made < FIELD_TILES * 2; d++) for (let j = Math.max(0, gj - d); j <= Math.min(l.height - 1, gj + d) && made < FIELD_TILES * 2; j++) for (let i = Math.max(0, gi - d); i <= Math.min(l.width - 1, gi + d) && made < FIELD_TILES * 2; i++) {
      const t = j * l.width + i;
      if (Math.abs(i - gi) + Math.abs(j - gj) !== d || l.outside[t] === 1 || l.water[t] === 1 || l.level[t] >= MOUNTAIN_LEVEL) continue;
      l.biome[t] = plain; made++;
    }
    took += 8;
  }
  return took;
}
