// Visual events the simulation raises and the view plays (view/fx.ts): a blow on a tree, a tree felled, chips from a rock or sparks from a forge, a catch. They are
// not part of the world state, the save or the hash: the simulation only appends, the view empties the list each frame, and a headless run (nobody drains) keeps
// the last few. Everything is a plain number so a rule never needs the renderer.
export const FX_LEAVES = 0, FX_FELL = 1, FX_CHIPS = 2, FX_SPLASH = 3;
// Palettes of FX_CHIPS (`m`).
export const CHIP_STONE = 0, CHIP_CLAY = 1, CHIP_ORE = 2, CHIP_BERRY = 3, CHIP_SPARK = 4, CHIP_CHAFF = 5, CHIP_SAWDUST = 6, CHIP_FLOUR = 7, CHIP_DUST = 8;

export interface FxEvent { kind: number; x: number; y: number; a: number; n: number; m: number; }
export const fxQueue: FxEvent[] = [];
const FX_KEEP = 64;

/** `x`, `y`: where; `a`: heading (FX_FELL, FX_SPLASH) or particle count (FX_CHIPS); `n`: the tile (trees); `m`: tree variant or chip palette. */
export function emitFx(kind: number, x: number, y: number, a: number = 0, n: number = 0, m: number = 0): void {
  if (fxQueue.length >= FX_KEEP) fxQueue.shift();
  fxQueue.push({ kind, x, y, a, n, m });
}

/** What working each deposit kind (the order of `deposits` in economy.json: stone, clay, ore, berries) throws up per blow: particle count and palette, the sound, and the
 *  palette of the cloud when it is used up. Plain data: a new deposit is one more row. */
export interface LodeFx { chips: number; palette: number; dust: number; sound: string; volume: number; }
export const LODE_FX: LodeFx[] = [
  { chips: 6, palette: CHIP_STONE, dust: CHIP_DUST, sound: 'hammer', volume: .45 },
  { chips: 5, palette: CHIP_CLAY, dust: CHIP_CLAY, sound: 'wood', volume: .35 },
  { chips: 8, palette: CHIP_ORE, dust: CHIP_SPARK, sound: 'hammer', volume: .55 },
  { chips: 4, palette: CHIP_BERRY, dust: CHIP_BERRY, sound: 'soft', volume: .3 },
];
