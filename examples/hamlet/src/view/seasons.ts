import * as assets from 'zinc:assets';
import { BIOME_IDS } from '../gen/terrain';
import { GRASS_TONES } from '../palettes';
import { biomes, loadBiomes, Rgb } from '../world/biomes';
import { season } from '../rules/season';

// What the seasons paint (the numbers are assets/biomes.json): the ground's four greens per biome and season, the foliage of the trees, the ice. View only.
let loaded = false;
let tones: number[][][][] = [];                  // [biome][season][k] -> colour
/** Loads the file's text (a test hands it over; the game reads it from its assets). */
export function useBiomes(text: string): void {
  loadBiomes(text, BIOME_IDS);
  loaded = true;
  tones = biomes.biomes.map((b): number[][][] => b.grass.map((g): number[][] => GRASS_TONES.map((c: number[]): number[] => blend(c, g.tint, g.mix))));
}
export function ensureBiomes(): void { if (!loaded) useBiomes(assets.readText('biomes.json')); }
export function blend(a: Rgb, b: Rgb, k: number): Rgb { return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)]; }
/** The k-th green (0 dark .. 3 light) of a biome's ground in a season. */
export function groundTone(biome: number, s: number, k: number): Rgb { return tones[biome][s][k]; }
export function snowShare(biome: number, s: number): number { return biomes.biomes[biome].snow[s]; }
export function flowerShare(biome: number, s: number): number { return biomes.biomes[biome].flowers[s]; }
/** A pine's green in a season (frosted in winter). */
export function needleColor(green: Rgb, s: number): Rgb { return blend(green, biomes.needle[s].tint, biomes.needle[s].mix); }
export function reedColor(s: number): Rgb { return biomes.reeds[s]; }
/** The share of the water that is frozen (the shore first). */
export function iceShare(s: number): number { return biomes.iceAmount[s]; }
/** True when the deer wear their thick, pale winter coat. */
export function winterCoat(): boolean { return loaded && biomes.coat[season()] >= .5; }
export { biomes };
