import * as assets from 'zinc:assets';
import { BIOME_IDS } from '../gen/terrain';
import { GRASS_TONES } from '../palettes';
import { biomes, loadBiomes, Rgb } from '../world/biomes';
import { monthIndex } from '../rules/season';

// What the seasons paint (the numbers are assets/biomes.json): the ground's four greens per biome and season, the foliage of the trees, the ice. View only.
let loaded = false;
let tones: number[][][][] = [];                  // [biome][month][k] -> colour
/** The month of the year, 0 March .. 11 February: the season phase is continuous, the view steps it a month at a time (a month is 15 s of game time). */
export function monthStep(): number { return monthIndex() % 12; }
/** Where a month sits among the four seasons, 0 to 4: the middle of spring (April) is 0, summer 1, autumn 2, winter 3. */
function phaseOf(m: number): number { return ((m + 11) % 12) / 3; }
/** A value given per season (spring, summer, autumn, winter) at a month: a smooth blend of the two seasons around it. */
export function mix(v: number[], m: number): number { const p = phaseOf(m), s = Math.floor(p), f = p - s; return v[s % 4] * (1 - f) + v[(s + 1) % 4] * f; }
export function mixColor(v: Rgb[], m: number): Rgb { const p = phaseOf(m), s = Math.floor(p), f = p - s; return blend(v[s % 4], v[(s + 1) % 4], f); }
/** Loads the file's text (a test hands it over; the game reads it from its assets). */
export function useBiomes(text: string): void {
  loadBiomes(text, BIOME_IDS);
  loaded = true;
  tones = biomes.biomes.map((b): number[][][] => {
    const out: number[][][] = [];
    for (let m = 0; m < 12; m++) {
      const tint = mixColor(b.grass.map((g): Rgb => g.tint), m), k = mix(b.grass.map((g): number => g.mix), m);
      out.push(GRASS_TONES.map((c: number[]): number[] => blend(c, tint, k)));
    }
    return out;
  });
}
export function ensureBiomes(): void { if (!loaded) useBiomes(assets.readText('biomes.json')); }
export function blend(a: Rgb, b: Rgb, k: number): Rgb { return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)]; }
/** The k-th green (0 dark .. 3 light) of a biome's ground in a month. */
export function groundTone(biome: number, m: number, k: number): Rgb { return tones[biome][m][k]; }
export function snowShare(biome: number, m: number): number { return mix(biomes.biomes[biome].snow, m); }
export function flowerShare(biome: number, m: number): number { return mix(biomes.biomes[biome].flowers, m); }
/** A pine's green in a month (frosted as winter comes). */
export function needleColor(green: Rgb, m: number): Rgb { return blend(green, mixColor(biomes.needle.map((g): Rgb => g.tint), m), mix(biomes.needle.map((g): number => g.mix), m)); }
export function reedColor(m: number): Rgb { return mixColor(biomes.reeds, m); }
/** The share of the water that is frozen (the shore first): it grows through autumn and winter and thaws in spring. */
export function iceShare(m: number): number { return mix(biomes.iceAmount, m); }
/** The broad-leaved tree's foliage in a month: crown colours, blossom and the share of leaves still on (they thin out in autumn and bud in spring). */
export function broadAt(m: number): { crown: Rgb; light: Rgb; blossom: number; leaves: number } {
  return { crown: mixColor(biomes.broad.map((b): Rgb => b.crown), m), light: mixColor(biomes.broad.map((b): Rgb => b.light), m), blossom: mix(biomes.broad.map((b): number => b.blossom), m), leaves: mix(biomes.broad.map((b): number => b.leaves), m) };
}
/** True when the deer wear their thick, pale winter coat. */
export function winterCoat(): boolean { return loaded && mix(biomes.coat, monthStep()) >= .5; }
export { biomes };
