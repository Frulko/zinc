import { createImage, updatePixels, drawImageRect, ImageFlag } from 'zinc:gfx';
import { economy } from '../world/economy';
import { models } from '../view/models';
import { rgb } from '../pixel';

// Small pixel icons. Resource icons are 9x9 bitmaps named by the resource's id in economy.json, else by its `carry` kind (an unknown one gets a coin);
// building icons are baked from the lit models the view already holds, so a new building has an icon without any art.
const PALETTE = new Map<string, number>();
function P(c: string, r: number, g: number, b: number): void { PALETTE.set(c, rgb(r, g, b)); }
P('k', 44, 34, 24); P('b', 132, 92, 56); P('B', 190, 142, 88); P('t', 226, 196, 138); P('g', 70, 124, 60); P('G', 128, 176, 84); P('r', 176, 64, 52);
P('R', 222, 112, 92); P('y', 236, 190, 60); P('w', 246, 240, 224); P('s', 150, 156, 160); P('n', 70, 118, 160); P('N', 130, 176, 208); P('o', 214, 130, 50); P('p', 206, 150, 130);
P('c', 172, 98, 66); P('C', 206, 130, 94); P('S', 100, 106, 112); P('v', 110, 48, 104); P('V', 162, 86, 146); P('a', 226, 150, 30); P('h', 250, 206, 90);
P('W', 240, 226, 170); P('i', 205, 98, 48); P('O', 236, 160, 80); P('P', 222, 140, 120); P('Y', 255, 230, 120);
const GLYPHS = new Map<string, string[]>();
function G(name: string, rows: string[]): void { GLYPHS.set(name, rows); }
G('log', ['.........', '.kkkkkkk.', 'kbBbBbbbk', 'kBbBbBBbk', 'kbBkkkbBk', 'kBbkBkBbk', 'kbBkkkBbk', '.kkkkkkk.', '.........']);
G('deer', ['.........', '..kkkk...', '.krrrrk..', 'krRRRrrk.', 'krRRRrrk.', '.krrrrkwk', '..kkkkkwk', '.......kw', '.........']);
G('fish', ['.........', '...kkk.k.', '..knnnkkk', '.knNNnnnk', 'knwkNnnnk', '.knNNnnnk', '..knnnkkk', '...kkk.k.', '.........']);
G('plank', ['.........', 'kkkkkkkkk', 'kttttttBk', 'kBBBBBBbk', 'kkkkkkkkk', 'ktttttBBk', 'kBBBBBbbk', 'kkkkkkkkk', '.........']);
G('hide', ['.........', '.kk...kk.', 'kBBkkkBBk', 'kBbbbbbBk', '.kbBBBbk.', 'kBbBBBbBk', 'kBbbbbbBk', '.kk.k.kk.', '.........']);
G('ham', ['.........', '..kkkk...', '.kooooPk.', 'kooOOoopk', 'kooOOoopk', '.kooooopk', '..kkkkkk.', 'wk.......', 'kw.......']);
G('sack', ['.........', '..kkkkk..', '...kBk...', '..kttttk.', '.kttBBttk', 'kttBttBtk', 'kttttttBk', '.kBBBBBk.', '..kkkkk..']);
G('bread', ['.........', '...kkkk..', '..kBBBBk.', '.kBtBtBBk', 'kBBBBBBBk', 'kBbBbBbBk', 'kbbbbbbbk', '.kkkkkkk.', '.........']);
G('coin', ['.........', '..kkkkk..', '.kyyyyyk.', 'kyyYkyyyk', 'kyYykyyyk', 'kyyYkyyyk', '.kyyyyyk.', '..kkkkk..', '.........']);
G('play', ['.k.......', '.kk......', '.kwk.....', '.kwwk....', '.kwwwk...', '.kwwk....', '.kwk.....', '.kk......', '.k.......']);
G('pause', ['.........', '.kkk.kkk.', '.kwk.kwk.', '.kwk.kwk.', '.kwk.kwk.', '.kwk.kwk.', '.kwk.kwk.', '.kkk.kkk.', '.........']);
G('fast', ['.........', 'kk..kk...', 'kwk.kwk..', 'kwwkkwwk.', 'kwwwkwwwk', 'kwwkkwwk.', 'kwk.kwk..', 'kk..kk...', '.........']);
G('fastest', ['.........', 'k.k.k....', 'kwkwkwk..', 'kwwwwwwk.', 'kwwwwwwwk', 'kwwwwwwk.', 'kwkwkwk..', 'k.k.k....', '.........']);
G('house', ['....k....', '...kRk...', '..kRRRk..', '.kRRRRRk.', 'kRRRRRRRk', '.kttttk..', '.ktkkttk.', '.ktkkttk.', '.kkkkkkk.']);
G('saw', ['.........', '.k.k.k.k.', '.kkkkkkk.', 'kwwwwwwwk', 'kwswswsw.', '.kkkkkkk.', '..kBBBk..', '..kBBBk..', '..kkkkk..']);
G('hammer', ['.........', '.kkkkk...', 'kwwwwwk..', 'kwsssswk.', '.kkkBbkk.', '...kBbk..', '...kBbk..', '...kBbk..', '...kkkk..']);
G('crate', ['.........', 'kkkkkkkkk', 'kBBBBBBBk', 'kbkkkkkbk', 'kBkBBBkBk', 'kbkBBBkbk', 'kBkkkkkBk', 'kbbbbbbbk', 'kkkkkkkkk']);
G('road', ['.........', 'ktttkttkt', 'kttkkttkk', '.kttttttk', '.kttkkttk', '..kttttkk', '..kttkkk.', '...kkkk..', '.........']);
G('erase', ['.........', 'kk.....kk', 'krk...krk', '.krk.krk.', '..krkrk..', '...krk...', '..krkrk..', '.krk.krk.', 'kk.....kk']);
G('advisor', ['.kkkkkkk.', 'kwwwwwwwk', 'kwkkkkkwk', 'kwwwwwwwk', 'kwkkkkwwk', 'kwwwwwwwk', 'kwkkkwwwk', 'kwwwwwwwk', '.kkkkkkk.']);
G('eye', ['.........', '..kkkkk..', '.kwwwwwk.', 'kwwkkkwwk', 'kwkknkkwk', 'kwwkkkwwk', '.kwwwwwk.', '..kkkkk..', '.........']);
G('gear', ['....k....', '.k.kwk.k.', '.kkwwwkk.', '..kwkwk..', 'kwwwkwwwk', '..kwkwk..', '.kkwwwkk.', '.k.kwk.k.', '....k....']);
G('left', ['.........', '....kk...', '...kwk...', '..kwwk...', '.kwwwk...', '..kwwk...', '...kwk...', '....kk...', '.........']);
G('right', ['.........', '...kk....', '...kwk...', '...kwwk..', '...kwwwk.', '...kwwk..', '...kwk...', '...kk....', '.........']);
G('close', ['.........', '.kk...kk.', '.kwk.kwk.', '..kwkwk..', '...kwk...', '..kwkwk..', '.kwk.kwk.', '.kk...kk.', '.........']);
G('undo', ['.........', '..kkk....', '.kwwwkk..', 'kwwkkwwk.', 'kwk..kwwk', 'kwwk.kwwk', '.kwwkwwk.', '..kkkkk..', '.........']);
G('scroll', ['.kkkkkkk.', 'kwwwwwwwk', '.kwkkkwk.', '.kwwwwwk.', '.kwkkkwk.', '.kwwwwwk.', '.kwkkwwk.', 'kwwwwwwwk', '.kkkkkkk.']);
G('person', ['.........', '..kkkk...', '.kpppk...', '.kpppk...', '..kkk....', '.kbbbk...', 'kbbbbbk..', 'kb.k.bk..', '.kk.kk...']);
G('stone', ['.........', '...kkkk..', '..kwwsSk.', '.kwwsssSk', 'kwsssssSk', 'ksssssSSk', 'kSsssSSSk', '.kkSSSkk.', '.........']);
G('clay', ['.........', '..kkkkk..', '.kCCCCck.', 'kCCcCCcck', 'kccccccck', 'kkkkkkkkk', 'kCCCcCCck', 'kcccckcck', 'kkkkkkkkk']);
G('iron_ore', ['.........', '...kkkk..', '..kSSSSk.', '.kSiSSSSk', 'kSSSSiSSk', 'kSiSSSSSk', 'kSSSSSiSk', '.kkSSSkk.', '.........']);
G('berries', ['....kg...', '...kgGk..', '.kkk.kkk.', 'kvVvkvVvk', 'kvvvkvvvk', '.kkk.kkk.', '..kvVvk..', '..kvvvk..', '...kkk...']);
G('tools', ['.kkkkkkk.', 'kswwwwwsk', 'kskkBkksk', '.k.kBbk.k', '...kBbk..', '...kBbk..', '...kBbk..', '...kBbk..', '...kkkk..']);
G('honey', ['..kkkkk..', '..kBBBk..', '.kkkkkkk.', 'khhhhhhhk', 'kahwhhhak', 'kaaahhhak', 'kaaaaaaak', '.kaaaaak.', '..kkkkk..']);
G('wax', ['.........', '.kkkkkkk.', 'kWWWWWWWk', 'kWwwWWWtk', 'kWWWWWttk', 'kttttttBk', 'kkkkkkkkk', '.........', '.........']);
G('candle', ['....o....', '...oYo...', '...oYo...', '....k....', '...kWwk..', '...kWWk..', '...kWWk..', '.kBBBBBk.', '.kkkkkkk.']);
G('mead', ['.........', '.kwwwwwk.', '.kwaaawk.', '.kaaYaakk', '.kaaaaakk', '.kaaaaak.', '.kaaaaak.', '.kkkkkkk.', '.........']);
G('wheat', ['..y.y.y..', '.ytyyyty.', '.yoyyyoy.', '..y.y.y..', '..g.g.g..', '...ggg...', '....g....', '....g....', '.........']);
G('flour', ['..kkkkk..', '...kBk...', '..kwwwwk.', '.kwwwwwwk', 'kwwwswwwk', 'kwwwwwwsk', 'kwwwwwwwk', '.kwwwwwk.', '..kkkkk..']);
G('leather', ['.........', '.kkkkkkk.', 'kOOOOOOOk', 'kooooooOk', 'koYoYoYok', 'kooooooOk', 'kOOOOOOOk', '.kkkkkkk.', '.........']);
GLYPHS.set('meat', GLYPHS.get('deer') as string[]); GLYPHS.set('smoked_meat', GLYPHS.get('ham') as string[]);

const cache = new Map<string, i32>();
function glyphImage(name: string): i32 {
  if (cache.has(name)) return cache.get(name) as i32;
  const rows = (GLYPHS.has(name) ? GLYPHS.get(name) : GLYPHS.get('coin')) as string[], px: u32[] = [];
  for (const row of rows) for (let x = 0; x < 9; x++) { const c = row.charAt(x); px.push(c === '.' || !PALETTE.has(c) ? 0 : PALETTE.get(c) as number); }
  const image = createImage(9, 9);
  updatePixels(image, px, false);
  cache.set(name, image);
  return image;
}

/** True when a resource id has an icon of its own (the test checks every resource of economy.json: none falls back to the coin). */
export function hasResourceIcon(id: string): boolean { return GLYPHS.has(id); }
/** The icon of a resource (index in economy.json), `size` screen pixels wide. */
export function drawResource(k: number, x: number, y: number, size: number = 18): void {
  drawImageRect(glyphImage(GLYPHS.has(economy.resources[k].id) ? economy.resources[k].id : economy.resources[k].carry), 0, 0, 9, 9, x, y, size, size, 255, ImageFlag.Nearest);
}
export function drawGlyph(name: string, x: number, y: number, size: number = 18): void {
  drawImageRect(glyphImage(name), 0, 0, 9, 9, x, y, size, size, 255, ImageFlag.Nearest);
}

// ---- building icons: the baked model, cropped to its box and drawn at a whole multiple of its pixels ----
class BuildingIcon { image: i32 = -1; w: number = 0; h: number = 0; }
const buildingIcons = new Map<number, BuildingIcon>();
export function buildingIcon(type: number): BuildingIcon | null {
  if (buildingIcons.has(type)) return buildingIcons.get(type) as BuildingIcon;
  if (type >= models.length) return null;
  if (models[type] === undefined || models[type].count === 0) return null;
  const m = models[type].toArrays();
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < m.xs.length; i++) { x0 = Math.min(x0, m.xs[i]); x1 = Math.max(x1, m.xs[i]); y0 = Math.min(y0, m.ys[i]); y1 = Math.max(y1, m.ys[i]); }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, px: u32[] = Array.from({ length: w * h }, (): u32 => 0), depth: number[] = Array.from({ length: w * h }, (): number => -1e9);
  for (let i = 0; i < m.xs.length; i++) {
    const at = (m.ys[i] - y0) * w + (m.xs[i] - x0);
    if (m.depths[i] > depth[at]) { depth[at] = m.depths[i]; px[at] = m.colors[i]; }
  }
  const image = createImage(w, h);
  updatePixels(image, px, false);
  const icon = new BuildingIcon(); icon.image = image; icon.w = w; icon.h = h;
  buildingIcons.set(type, icon);
  return icon;
}
/** Draws a building's icon inside the box (x, y, size, size), centred and as large as fits at a whole pixel multiple (or fractional when it must shrink). */
export function drawBuilding(type: number, x: number, y: number, size: number): void {
  const icon = buildingIcon(type);
  if (icon === null) return;
  const s = Math.min(size / icon.w, size / icon.h), k = s >= 1 ? Math.floor(s) : s, w = icon.w * k, h = icon.h * k;
  drawImageRect(icon.image, 0, 0, icon.w, icon.h, Math.floor(x + (size - w) / 2), Math.floor(y + (size - h) / 2), w, h, 255, ImageFlag.Nearest);
}
