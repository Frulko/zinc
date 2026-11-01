// The seasons of the map, as data (assets/biomes.json): per biome and season the ground's tint, the snow and the flowers; the trees' foliage, the reeds, the ice and the deer's coat.
// Same rules as economy.json: a mistake is named and the game does not start on it.
export type Rgb = number[];
export class GrassLook { tint: Rgb = [0, 0, 0]; mix: number = 0; }
export class BiomeLook { grass: GrassLook[] = []; snow: number[] = []; flowers: number[] = []; }
export class BroadLook { crown: Rgb = [0, 0, 0]; light: Rgb = [0, 0, 0]; blossom: number = 0; leaves: number = 1; }
export class Biomes {
  biomes: BiomeLook[] = []; broad: BroadLook[] = []; needle: GrassLook[] = []; snow: Rgb[] = []; reeds: Rgb[] = []; iceTones: Rgb[] = []; iceAmount: number[] = []; coat: number[] = [];
}

function rgb(v: any, where: string, errors: string[]): Rgb {
  if (!Array.isArray(v) || v.length !== 3 || v.some((c: any): boolean => typeof c !== 'number' || c < 0 || c > 255)) { errors.push('bad-color: ' + where + ' is [r, g, b] of 0 to 255'); return [0, 0, 0]; }
  return (v as number[]).map((c: number): number => Number(c));
}
function four(v: any, where: string, errors: string[]): any[] {
  if (!Array.isArray(v) || v.length !== 4) { errors.push('bad-seasons: ' + where + ' holds four entries (spring, summer, autumn, winter)'); return [0, 0, 0, 0]; }
  return v as any[];
}
function shares(v: any, where: string, errors: string[]): number[] {
  return four(v, where, errors).map((x: any): number => {
    if (typeof x !== 'number' || x < 0 || x > 1) { errors.push('bad-share: ' + where + ' holds numbers from 0 to 1'); return 0; }
    return Number(x);
  });
}
function grass(v: any, where: string, errors: string[]): GrassLook[] {
  return four(v, where, errors).map((e: any, k: number): GrassLook => {
    const g = new GrassLook();
    if (e === null || typeof e !== 'object') { errors.push('bad-seasons: ' + where + '[' + k + '] is { tint, mix }'); return g; }
    g.tint = rgb(e.tint, where + '[' + k + '].tint', errors); g.mix = shares([e.mix, e.mix, e.mix, e.mix], where + '[' + k + '].mix', errors)[0];
    return g;
  });
}

/** Reads the file; `names` are the biomes the generator knows (gen/terrain.ts BIOME_IDS), each of which needs an entry. Returns what it understood and the named mistakes. */
export function parseBiomes(text: string, names: string[]): { data: Biomes; errors: string[] } {
  const out = new Biomes(), errors: string[] = [];
  let src: any = null;
  try { src = JSON.parse(text); } catch (e) { errors.push('bad-json: biomes.json is not JSON'); return { data: out, errors }; }
  if (src === null || typeof src !== 'object' || src.biomes === null || typeof src.biomes !== 'object') { errors.push('bad-json: biomes.json needs a "biomes" object'); return { data: out, errors }; }
  for (const name of names) {
    const b = src.biomes[name], look = new BiomeLook();
    if (b === undefined) { errors.push('unknown-biome: biomes.json has no entry for "' + name + '"'); out.biomes.push(look); continue; }
    look.grass = grass(b.grass, name + '.grass', errors); look.snow = shares(b.snow, name + '.snow', errors); look.flowers = shares(b.flowers, name + '.flowers', errors);
    out.biomes.push(look);
  }
  for (const key of Object.keys(src.biomes)) if (names.indexOf(key) < 0) errors.push('unknown-biome: "' + key + '" is not a biome of the generator');
  out.broad = four(src.broad, 'broad', errors).map((e: any, k: number): BroadLook => {
    const l = new BroadLook();
    if (e === null || typeof e !== 'object') { errors.push('bad-seasons: broad[' + k + '] is { crown, light, blossom, leaves }'); return l; }
    l.crown = rgb(e.crown, 'broad[' + k + '].crown', errors); l.light = rgb(e.light, 'broad[' + k + '].light', errors);
    l.blossom = shares([e.blossom, 0, 0, 0], 'broad[' + k + '].blossom', errors)[0]; l.leaves = shares([e.leaves, 0, 0, 0], 'broad[' + k + '].leaves', errors)[0];
    return l;
  });
  out.needle = grass(src.needle, 'needle', errors);
  out.snow = Array.isArray(src.snow) ? (src.snow as any[]).map((c: any, k: number): Rgb => rgb(c, 'snow[' + k + ']', errors)) : [];
  if (out.snow.length < 2) errors.push('bad-color: "snow" lists at least two colours');
  out.reeds = four(src.reeds, 'reeds', errors).map((c: any, k: number): Rgb => rgb(c, 'reeds[' + k + ']', errors));
  const ice: any = src.ice === undefined || src.ice === null ? {} : src.ice;
  out.iceTones = Array.isArray(ice.tones) ? (ice.tones as any[]).map((c: any, k: number): Rgb => rgb(c, 'ice.tones[' + k + ']', errors)) : [];
  if (out.iceTones.length < 2) errors.push('bad-color: "ice.tones" lists at least two colours');
  out.iceAmount = shares(ice.amount, 'ice.amount', errors);
  out.coat = shares(src.deer === undefined || src.deer === null ? undefined : src.deer.coat, 'deer.coat', errors);
  return { data: out, errors };
}

export const biomes: Biomes = new Biomes();
/** Loads the file into `biomes`, or throws with every mistake named. */
export function loadBiomes(text: string, names: string[]): void {
  const r = parseBiomes(text, names);
  if (r.errors.length > 0) throw new Error('biomes.json: ' + r.errors.join('; '));
  const d = r.data;
  biomes.biomes = d.biomes; biomes.broad = d.broad; biomes.needle = d.needle; biomes.snow = d.snow; biomes.reeds = d.reeds; biomes.iceTones = d.iceTones; biomes.iceAmount = d.iceAmount; biomes.coat = d.coat;
}
