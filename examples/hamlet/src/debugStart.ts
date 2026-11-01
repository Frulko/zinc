import { env } from 'zinc:sys';
import { world } from './world/world';
import { act } from './ui/state';
import { PRESETS } from './gen/presets';
import { TerrainParams } from './gen/terrain';
import { TICK } from './constants';
import { trace } from './view/scenery';
import { MONTH_SECONDS } from './rules/season';

/**
 * For screenshots and tests only: ZINC_HAMLET_TRACE=1 prints the bake times. ZINC_HAMLET="seed,size,preset,month,x,y" (x and y optional: the point to look at, as a share of the half-width) starts that village (preset = index in PRESETS, month = 0 March .. 11 February) instead of the saved
 * one. Run it with ZINC_APP_DATA pointing at a scratch folder: the village is saved like any other.
 */
export function debugStart(): void {
  trace.on = env('ZINC_HAMLET_TRACE') === '1';
  const text = env('ZINC_HAMLET');
  if (text === '') return;
  const v = text.split(',').map((s: string): number => Number(s));
  const preset = PRESETS[Math.max(0, Math.min(PRESETS.length - 1, v.length > 2 ? v[2] : 0))];
  const params = new TerrainParams(), from = preset.params;
  params.waterAmount = from.waterAmount; params.river = from.river; params.forestDensity = from.forestDensity; params.rockDensity = from.rockDensity; params.biome = from.biome;
  params.coast = from.coast; params.outcrop = from.outcrop; params.flowers = from.flowers; params.biomes = from.biomes;
  act.newVillage(v[0], v.length > 1 ? v[1] : 24, false, false, params);
  if (v.length > 5) act.jump(v[4] * world.half, v[5] * world.half);
  if (v.length > 3) world.tick = Math.round(v[3] * MONTH_SECONDS / TICK) + 8;
}
