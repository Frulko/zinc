// Map presets of the new-village form: a name and the generator's request. The first one is the default village (the biome generator: forests, meadows, marsh and hills in
// clumps); Classique is the uniform scatter of the first villages.
import { TerrainParams, BIOME_MIXED, BIOME_PINE, BIOME_BIRCH, BIOME_MEADOW } from './terrain';

export class Preset { label: string = ''; params: TerrainParams = new TerrainParams(); }
function preset(label: string, set: (p: TerrainParams) => void): Preset { const r = new Preset(); r.label = label; set(r.params); return r; }

export const PRESETS: Preset[] = [
  preset('Vallée', (_p: TerrainParams): void => {}),
  preset('Plaine', (p: TerrainParams): void => { p.waterAmount = .25; p.forestDensity = .15; p.rockDensity = .3; p.biome = BIOME_MEADOW; p.flowers = .8; p.biomes = 1; }),
  preset('Rivière', (p: TerrainParams): void => { p.waterAmount = 0; p.river = true; p.forestDensity = .55; p.biome = BIOME_BIRCH; p.flowers = .3; p.biomes = 1; }),
  preset('Lac', (p: TerrainParams): void => { p.waterAmount = 2; p.forestDensity = .45; p.biome = BIOME_MIXED; p.biomes = 1; }),
  preset('Forêt', (p: TerrainParams): void => { p.waterAmount = .3; p.forestDensity = 1; p.rockDensity = .3; p.biome = BIOME_PINE; p.biomes = 1; }),
  preset('Montagne', (p: TerrainParams): void => { p.waterAmount = .3; p.forestDensity = .35; p.rockDensity = 1; p.outcrop = .8; p.biome = BIOME_PINE; p.biomes = 1; }),
  preset('Côte', (p: TerrainParams): void => { p.waterAmount = 0; p.coast = 1; p.forestDensity = .4; p.flowers = .4; p.biome = BIOME_MIXED; p.biomes = 1; }),
  preset('Classique', (p: TerrainParams): void => { p.biomes = 0; }),
];
