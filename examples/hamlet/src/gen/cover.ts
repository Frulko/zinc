// The ground cover of a clustered map: the macro fields (patch noise, moisture, warmth, heights) say what each tile MAY be, Wave Function Collapse (gen/wfc.ts) picks what it IS
// so that neighbours are consistent: a dense wood never touches open ground (a ring of sparse trees lies between), scree and flowers never touch trees, reeds stay on the shore.
// Then the cover becomes trees, rocks and flowers, with one species mix per grove (a Worley region) instead of a dice per tile. No game types in here.
import { hash } from '../world/noise';
import { Wfc, symmetricRules } from './wfc';
import { worley } from './clusters';

export const CV_OPEN = 0, CV_BLOOM = 1, CV_EDGE = 2, CV_WOOD = 3, CV_SCREE = 4, CV_REED = 5;
export const M_OPEN = 1, M_BLOOM = 2, M_EDGE = 4, M_WOOD = 8, M_SCREE = 16, M_REED = 32;
/** Which covers may stand side by side. EDGE is the glue: every other cover may touch it, so every set that holds it can always be completed. */
export const COVER_RULES = symmetricRules(6, [
  [CV_OPEN, CV_BLOOM, CV_EDGE, CV_SCREE, CV_REED],            // open ground
  [CV_OPEN, CV_BLOOM, CV_EDGE, CV_REED],                       // a flower meadow
  [CV_OPEN, CV_BLOOM, CV_EDGE, CV_WOOD, CV_SCREE, CV_REED],   // the edge of a wood: sparse trees
  [CV_EDGE, CV_WOOD],                                          // dense wood
  [CV_OPEN, CV_EDGE, CV_SCREE],                                // scree: stones on high ground
  [CV_OPEN, CV_BLOOM, CV_EDGE, CV_REED],                       // reeds on a shore
]);

/** The layers the pass writes (a TerrainLayers has them). */
export interface CoverLayers { width: number; height: number; forest: number[]; rock: number[]; deco: number[]; }
/** What the biome pass knows of each tile: the sets of covers it allows (0: not a land tile that takes cover) and the fields that weigh them. */
export class CoverField {
  init: number[] = []; patch: number[] = []; bloom: number[] = []; warm: number[] = []; near: number[] = [];
  cover: number = .6;          // the patch value above which a tile is forest
  flowers: number = 0;         // 0..1: how full of flowers the meadows are
  pines: number = 0;           // the village's biome: 1 pines only, 2 birches only, 0 by region and warmth
  reeds: number = 3;           // the deco id of reeds
}

export const MIX_CELL = 14;      // tiles across a grove's region: one species mix per region
/** Tree variants of a tile (1..3 pines, 4 birch, 1..4 mixed): the grove's region and the warmth choose, the village's biome overrides (pines 1, birches 2). */
export function treeVariant(i: number, j: number, seed: number, warm: number, biome: number): number {
  const v = hash(i, j + seed);
  if (biome === 1) return 1 + Math.floor(v * 3);
  if (biome === 2) return 4;
  const zone = worley(i, j, MIX_CELL, seed + 91);
  if (warm < .36 || (warm < .6 && zone < .3)) return 1 + Math.floor(v * 3);          // a pine grove
  if (warm > .64 || (warm > .4 && zone > .75)) return 4;                             // a birch grove
  return 1 + Math.floor(v * 4);                                                      // a mixed wood
}

/** Solves the cover in chunks and writes forest, rock and deco on the tiles of the field. Returns the solver (its counters: restarts, forced). */
export function coverPass(l: CoverLayers, seed: number, f: CoverField): Wfc {
  const w = l.width, h = l.height;
  const weight = (t: number, tile: number): number => {
    const d = f.patch[t] - f.cover;
    if (tile === CV_WOOD) return Math.max(.15, 1 + d * 10);
    if (tile === CV_EDGE) return f.near[t] === 1 ? .04 : .55;
    if (tile === CV_OPEN) return f.bloom[t] > .55 ? .6 : 1.4;
    if (tile === CV_BLOOM) return f.bloom[t] > .55 ? 1 + f.flowers * 4 : .08;
    if (tile === CV_SCREE) return 1.4;
    return f.near[t] === 1 ? 5 : .3;                                                 // reeds crowd the water's edge
  };
  const wfc = new Wfc(w, h, COVER_RULES, f.init, weight, seed);
  wfc.solveAll(64);
  for (let t = 0; t < w * h; t++) {
    const c = wfc.tile(t);
    if (c < 0 || l.forest[t] !== 0 || l.rock[t] !== 0) continue;
    const i = t % w, j = Math.floor(t / w), r = hash(i * 5 + seed, j * 11), q = hash(i * 13, j * 17 + seed), tree = treeVariant(i, j, seed, f.warm[t], f.pines);
    if (c === CV_WOOD) { if (r < .93) l.forest[t] = tree; }
    else if (c === CV_EDGE) { if (r < .38) l.forest[t] = tree; else if (q > .93) l.deco[t] = 1; }
    else if (c === CV_BLOOM) l.deco[t] = r < .6 ? (q < .4 ? 1 : 2) : 0;
    else if (c === CV_SCREE) { if (r < .32) l.rock[t] = 1 + Math.floor(q * 2); }
    else if (c === CV_REED) { if (r < .8) l.deco[t] = f.reeds; else if (q > .9) l.deco[t] = 1; }
    else if (r < .012) l.forest[t] = tree;                                           // a lone tree in a meadow
    else if (r > .985) l.rock[t] = 1 + Math.floor(q * 2);
    else if (q > .97) l.deco[t] = 1;
  }
  return wfc;
}
