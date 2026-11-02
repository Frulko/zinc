import { createImage, updatePixels, image } from 'zinc:gfx';
import { env } from 'zinc:sys';
import * as assets from 'zinc:assets';
import { openPage, use, page, fillPolygon, strokeLine } from './raster';
import { broadAt, needleColor } from '../view/seasons';
import { BARK, STONE, WOOD_HONEY, WOOD_BROWN, FUR, FUR_DARK, FUR_LIGHT, RABBIT_FUR, RABBIT_DARK, RABBIT_LIGHT, WOLF_FUR, WOLF_DARK, WOLF_LIGHT, BOAR_FUR, BOAR_DARK, BOAR_LIGHT } from '../palettes';
import * as P from '../palettes';
import { MODEL_IDS } from '../view/models';
import { Palette } from '../pixel';

// The sprites of the Cite view. They are art in PNG sheets (assets/atlas, see ASSETS.md) when the files are there, else made by code at the first
// frames: a group is a grid of cells (a row a direction or a season, a column a frame), groups are packed on a few sheets by kind, and a sheet is one
// image so the draws batch. Two sets of sheets exist: 1x, and 2x (every sprite at double resolution) for a zoom above 2. A set made by code is baked
// a few jobs a frame (bakeStep) so the first frames do not stall; a sprite whose group is not ready is skipped.
export const SHEET_W = 1024;
export const sheetNames = ['trees-spring', 'trees-summer', 'trees-autumn', 'trees-winter', 'props', 'buildings', 'people', 'animals'];
/** A grid of `cols` x `rows` cells of cw x ch pixels (1 pixel between cells) at (x, y) of its sheet; ax, ay: where the foot is in a cell. Sprite ids run row by row from `first`. */
export class Group { name: string = ''; sheet: number = 0; x: number = 0; y: number = 0; cw: number = 0; ch: number = 0; cols: number = 1; rows: number = 1; ax: number = 0; ay: number = 0; first: number = 0; }
export const groups: Group[] = [];
export const sheetH: number[] = [];
export const sx: number[] = [], sy: number[] = [], sw: number[] = [], sh: number[] = [], ox: number[] = [], oy: number[] = [], sheetOf: number[] = [];   // per sprite, in 1x pixels: its place in its sheet and where its foot is
let layoutDone = false;
const pk: number[][] = [];      // per sheet: shelf packer [x, y, row height]
function grp(name: string, sheet: number, cols: number, rows: number, cw: number, ch: number, ax: number, ay: number): number {
  const g = new Group();
  g.name = name; g.sheet = sheet; g.cols = cols; g.rows = rows; g.cw = cw; g.ch = ch; g.ax = ax; g.ay = ay; g.first = groups.length === 0 ? 0 : lastFirst();
  const w = cols * (cw + 1), h = rows * (ch + 1), p = pk[sheet];
  if (p[0] + w + 1 > SHEET_W) { p[0] = 1; p[1] += p[2] + 1; p[2] = 0; }
  g.x = p[0]; g.y = p[1]; p[0] += w + 1; p[2] = Math.max(p[2], h);
  groups.push(g);
  return g.first;
}
function lastFirst(): number { const l = groups[groups.length - 1]; return l.first + l.cols * l.rows; }
/** Fills the per-sprite arrays from the groups (again after index.json moved a group). */
function fill(): void {
  sx.length = 0; sy.length = 0; sw.length = 0; sh.length = 0; ox.length = 0; oy.length = 0; sheetOf.length = 0;
  for (const g of groups) for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
    sx.push(g.x + c * (g.cw + 1)); sy.push(g.y + r * (g.ch + 1)); sw.push(g.cw); sh.push(g.ch); ox.push(g.ax); oy.push(g.ay); sheetOf.push(g.sheet);
  }
}

const rgb = (c: number[]): number => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
export function shade(c: number[], f: number): number { return (Math.min(255, Math.round(c[0] * f)) << 16) | (Math.min(255, Math.round(c[1] * f)) << 8) | Math.min(255, Math.round(c[2] * f)); }
function blob(x: number, y: number, rx: number, ry: number, color: number, alpha: number = 255): void {
  const pts: number[] = [];
  for (let k = 0; k < 14; k++) { const a = k / 14 * 6.2832; pts.push(x + Math.cos(a) * rx, y + Math.sin(a) * ry); }
  fillPolygon(pts, color, alpha);
}
function poly(pts: number[], color: number, alpha: number = 255): void { fillPolygon(pts, color, alpha); }
function stroke(pts: number[], width: number, color: number, alpha: number, closed: boolean): void { strokeLine(pts, width, color, alpha); }
function ground(x: number, y: number, rx: number): void { blob(x, y, rx, rx * .45, 0x000000, 62); }

// ---- ids ----
export const SEASONS = 4, SWAYS = 4, TREE_KINDS = 4;
export const treeBase: number[] = [];       // per (variant, season): its first sprite, then one a sway frame
export const rockIds: number[] = [];        // 2 plain rocks, then the deposits (stone, clay, ore, berries)
export const buildIds: number[] = [];       // per model id of view/models.ts, then the gate, then the house at levels 2 and 3
export const GATE_MODEL = MODEL_IDS.length;
export const personBase: number[] = [];     // per role
export const animalBase: number[] = [];     // per kind: deer, stag, rabbit, boar, wolf
export const ANIMAL_KINDS = 5, DIRS = 8, FRAMES = 4, ROLES = 26;
export const carryId = { box: -1 };
export const fxId = { smoke: -1, ripple: -1, tuft: -1 };          // smoke: 4 puffs; ripple: 4 glints on water; tuft: per season, 4 sway frames
export const chimney: number[][] = [];                             // per building sprite: where its chimney top is, from the foot, in 1x pixels (x, y)
export const SMOKE_FRAMES = 4;
const ROLE_NAMES = ['settler', 'resident', 'lumberjack', 'hunter', 'fisher', 'sawyer', 'smoker', 'porter', 'farmer', 'miller', 'baker', 'vendor', 'tanner', 'quarryman', 'peddler', 'forager', 'smith', 'beekeeper', 'chandler', 'brewer', 'innkeeper', 'firewarden', 'repairman', 'watchman', 'robber', 'rioter'];
const ANIMAL_NAMES = ['doe', 'stag', 'rabbit', 'boar', 'wolf'];
const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];
const BUILD_EXTRA = ['gate', 'house-2', 'house-3'];

class Ready { trees: boolean[] = [false, false, false, false]; rocks: boolean = false; buildings: boolean = false; people: boolean[] = []; animals: boolean[] = [false, false, false, false, false]; all: boolean = false; }
/** One resolution of the atlas: its sheets (images), and the jobs that paint them when they are made by code. */
export class AtlasSet {
  k: number = 1; images: number[] = []; px: u32[][] = []; ready: Ready = new Ready(); jobs: (() => void)[] = []; next: number = 0; files: boolean = false; done: boolean = false; dirty: boolean[] = [];
}
export const sets: AtlasSet[] = [];
/** The set that is drawn: k is its pixels per sprite pixel (1 or 2). */
export const at = { k: 1, images: [] as number[], ready: new Ready() };
let building: AtlasSet | null = null;
export const stats = { source: '', bakeMs: 0, loadMs: 0, sheets: 0 };
export const dumpDir: string = env('ZINC_HAMLET_ATLAS_DUMP');

export function treeId(variant: number, season: number, sway: number): number { return treeBase[variant * SEASONS + season] + sway; }
export function personId(role: number, dir: number, frame: number): number { return personBase[role] + dir * FRAMES + frame; }
export function animalId(kind: number, dir: number, frame: number): number { return animalBase[kind] + dir * FRAMES + frame; }

const REP_MONTH = [1, 4, 7, 10];
let cur: AtlasSet | null = null;
function place(id: number): void {
  const s = cur as AtlasSet, sh = sheetOf[id];
  use(s.px[sh], SHEET_W * s.k, sheetH[sh] * s.k);
  page.x = sx[id] * s.k; page.y = sy[id] * s.k; page.k = s.k;
  s.dirty[sh] = true;
}

// ---- trees ----
function drawTree(id: number, v: number, season: number, sway: number): void {
  place(id);
  const m = REP_MONTH[season], b = broadAt(m), s = [.82, 1, 1.12, .95][v], fx = 28, fy = 78, lean = Math.sin(sway * 1.5708) * 1.8;
  ground(fx, fy, 15 * s);
  if (v === 2) {                                                  // a pine: stacked cones
    const g = needleColor([46, 86, 60], m), snow = season === 3;
    poly([fx - 2, fy, fx + 2, fy, fx + 2, fy - 12 * s, fx - 2, fy - 12 * s], rgb(BARK));
    for (let k = 0; k < 4; k++) {
      const w = (17 - k * 3.4) * s, top = fy - (14 + k * 12) * s, bot = top + 20 * s, sh = lean * (k + 1) * .35;
      poly([fx + sh - w, bot, fx + sh + w, bot, fx + sh, top - 5 * s], shade(g, .62 + k * .1));
      poly([fx + sh, bot, fx + sh + w, bot, fx + sh, top - 5 * s], shade(g, .8 + k * .1));
      if (snow) poly([fx + sh - w * .55, top + 9 * s, fx + sh + w * .55, top + 9 * s, fx + sh, top - 5 * s], 0xf2f5f8);
    }
    return;
  }
  poly([fx - 2.5, fy, fx + 2.5, fy, fx + 2, fy - 22 * s, fx - 2, fy - 22 * s], rgb(BARK));
  const r = 16 * s, ccx = fx + lean, ccy = fy - 36 * s;
  if (b.leaves < .35) {                                            // bare branches
    for (let k = 0; k < 5; k++) { const a = -2.2 + k * .55; stroke([fx, fy - 20 * s, ccx + Math.cos(a) * r * .9, ccy + Math.sin(a) * r * .9], 1.4, rgb(BARK), 255, false); }
    if (season === 3) blob(ccx, ccy - r * .5, r * .6, r * .22, 0xf2f5f8, 220);
    return;
  }
  const dark = b.crown, light = b.light;
  blob(ccx + 1, ccy + 3 * s, r, r * .86, shade(dark, .7));
  blob(ccx, ccy, r * .94, r * .8, shade(dark, 1));
  blob(ccx - r * .25, ccy - r * .3, r * .62, r * .5, shade(light, .92));
  blob(ccx - r * .38, ccy - r * .42, r * .3, r * .24, shade(light, 1.1));
  if (b.blossom > .3) for (let k = 0; k < 6; k++) blob(ccx + Math.cos(k * 2.1) * r * .6, ccy + Math.sin(k * 1.7) * r * .5, 1.8, 1.6, 0xf3d4dc);
}

// ---- rocks and deposits ----
function drawRock(k: number): void {
  const id = rockIds[k];
  place(id);
  const fx = 20, fy = 24;
  ground(fx, fy, 14);
  if (k < 2) {
    const g = k === 0 ? [138, 136, 128] : [120, 118, 114];
    poly([fx - 12, fy, fx - 9, fy - 11, fx - 1, fy - 15, fx + 8, fy - 11, fx + 12, fy - 1, fx + 4, fy + 3, fx - 8, fy + 3], shade(g, .82));
    poly([fx - 9, fy - 11, fx - 1, fy - 15, fx + 8, fy - 11, fx + 1, fy - 7], shade(g, 1.15));
    poly([fx + 1, fy - 7, fx + 8, fy - 11, fx + 12, fy - 1, fx + 4, fy + 3], shade(g, .66));
    return;
  }
  const kind = k - 2;
  if (kind === 0) {                                               // a stone outcrop, pale
    for (let n = 0; n < 3; n++) { const x = fx - 8 + n * 8, h = 9 + (n === 1 ? 6 : 0); poly([x - 5, fy + 1, x - 3, fy - h, x + 3, fy - h + 1, x + 6, fy + 1], shade(STONE, .8 + n * .08)); poly([x - 3, fy - h, x + 3, fy - h + 1, x + 1, fy - h + 5, x - 3, fy - h + 4], shade(STONE, 1.05)); }
  } else if (kind === 1) {                                        // a clay bank
    blob(fx, fy - 3, 14, 7, rgb([176, 112, 78])); blob(fx - 2, fy - 6, 10, 5, rgb([204, 140, 98])); blob(fx + 4, fy - 4, 4, 2, rgb([140, 86, 60]));
  } else if (kind === 2) {                                        // ore: dark rock with metal glints
    poly([fx - 12, fy, fx - 8, fy - 13, fx + 2, fy - 16, fx + 11, fy - 9, fx + 12, fy, fx + 3, fy + 3, fx - 7, fy + 3], 0x4a4a52);
    poly([fx - 8, fy - 13, fx + 2, fy - 16, fx + 11, fy - 9, fx, fy - 8], 0x6a6a74);
    blob(fx - 2, fy - 7, 1.8, 1.6, 0xd9a43a); blob(fx + 5, fy - 4, 1.5, 1.4, 0x8fb8d8); blob(fx - 6, fy - 3, 1.4, 1.2, 0xd9a43a);
  } else {                                                        // berries: a bush with red dots
    blob(fx, fy - 8, 12, 9, 0x2f5a30); blob(fx - 3, fy - 11, 8, 6, 0x4a7a3a);
    for (let n = 0; n < 7; n++) blob(fx - 8 + (n * 5) % 16, fy - 13 + ((n * 7) % 9), 1.5, 1.5, 0xc0303a);
  }
}

// ---- buildings ----
// [wall colour, roof colour, wall height, kind, width]  kind: 0 house, 1 field (flat), 2 well, 3 awning, 4 pit, 5 tower, 6 mill
// wall rgb, roof rgb, wall height, kind, width: one string, parsed on first use (a long literal at the top level would crowd the program's registers)
const LOOK_TEXT = '222,208,172,176,104,76,20,0,24;190,148,92,122,94,62,24,0,26;150,112,72,84,110,76,22,0,24;120,140,150,92,128,146,16,0,24;206,190,150,140,100,76,30,0,27;150,112,72,96,76,58,16,0,20;120,92,70,70,60,56,22,0,22;190,170,90,160,90,70,20,1,26;232,228,216,150,70,60,34,6,22;236,226,200,196,96,72,20,0,24;200,170,122,196,70,62,14,3,26;140,100,66,100,76,56,18,0,25;150,150,144,110,90,70,12,2,12;168,164,152,100,98,96,10,4,24;176,112,78,96,76,58,10,4,24;96,92,100,80,70,64,14,4,24;110,106,112,70,66,70,22,0,24;120,150,90,90,120,70,14,0,18;210,180,80,180,140,60,10,1,22;214,188,132,120,86,58,20,0,22;220,170,80,150,90,60,22,0,24;200,170,120,150,74,56,26,0,28;196,78,52,120,60,50,22,0,24;150,140,130,96,90,86,22,0,26;140,120,100,84,78,74,40,5,16;86,82,80,60,56,54,10,4,20';
function lookOf(k: number): number[][] {
  const f = LOOK_TEXT.split(';')[Math.min(k, 25)].split(',').map((v: string): number => Number(v));
  return [[f[0], f[1], f[2]], [f[3], f[4], f[5]], [f[6], f[7], f[8]]];
}
function drawBuilding(id: number, lk: number[][], extra: number): void {
  place(id);
  const wall: number[] = lk[0], roof: number[] = lk[1], kind: number = lk[2][1];
  const hw: number = lk[2][2] + extra * 2, hg: number = lk[2][0] + extra * 7;
  ground(40, 80, hw + 6);
  if (kind === 1) buildField(wall, roof, hw);
  else if (kind === 4) buildPit(wall, roof, hw);
  else if (kind === 2) buildWell(wall, roof);
  else if (kind === 3) buildMarket(wall, roof, hw);
  else if (kind === 5) buildTower(wall, roof, hg);
  else buildHouse(id, wall, roof, hw, hg, kind, extra);
}
function buildField(wall: number[], roof: number[], hw: number): void {          // a field / apiary: a tilled diamond with a small shed
  const cxp = 40, by = 78, hd = hw / 2;
  poly([cxp - hw - 4, by, cxp, by + hd + 2, cxp + hw + 4, by, cxp, by - hd - 2], shade([128, 96, 56], .9));
  for (let k = -3; k <= 3; k++) { const o = k * 3.6; stroke([cxp - hw + 6 + o * .6, by - hd * .6 + o * .35, cxp + hw - 6 + o * .6, by + hd * .6 + o * .35], 1.6, rgb(wall), 255, false); }
  const w2 = 9;
  poly([cxp - w2, by - 4, cxp, by + w2 / 2 - 4, cxp, by + w2 / 2 - 16, cxp - w2, by - 16], shade(roof, .7));
  poly([cxp, by + w2 / 2 - 4, cxp + w2, by - 4, cxp + w2, by - 16, cxp, by + w2 / 2 - 16], shade(roof, .9));
  poly([cxp - w2 - 2, by - 16, cxp, by + w2 / 2 - 18, cxp + w2 + 2, by - 16, cxp, by - w2 / 2 - 22], shade(roof, 1.1));
}
function buildPit(wall: number[], roof: number[], hw: number): void {              // a pit: dark hole with a rim and a hut
  const cxp = 40, by = 78, hd = hw / 2, w2 = 8;
  poly([cxp - hw, by, cxp, by + hd, cxp + hw, by, cxp, by - hd], rgb(wall));
  poly([cxp - hw + 5, by, cxp, by + hd - 3, cxp + hw - 5, by, cxp, by - hd + 3], 0x3a3028);
  poly([cxp - hw + 9, by + 1, cxp, by + hd - 6, cxp + hw - 9, by + 1, cxp, by - hd + 5], 0x241c16);
  poly([cxp + 8, by - 12, cxp + 8 + w2, by - 12 - w2 / 2 + 4, cxp + 8 + w2, by - 24, cxp + 8, by - 20], shade(roof, 1));
  poly([cxp + 8 - w2, by - 12 - w2 / 2 + 4, cxp + 8, by - 12, cxp + 8, by - 20, cxp + 8 - w2, by - 24], shade(roof, .8));
}
function buildWell(wall: number[], roof: number[]): void {                         // a well: stone ring, roof on two posts
  const cxp = 40, by = 78;
  blob(cxp, by - 4, 11, 6, shade(wall, .8)); blob(cxp, by - 7, 11, 6, shade(wall, 1.05)); blob(cxp, by - 7, 7.5, 4, 0x2c4a58);
  poly([cxp - 9, by - 8, cxp - 7, by - 8, cxp - 7, by - 26, cxp - 9, by - 26], rgb(WOOD_BROWN));
  poly([cxp + 7, by - 8, cxp + 9, by - 8, cxp + 9, by - 26, cxp + 7, by - 26], rgb(WOOD_BROWN));
  poly([cxp - 14, by - 25, cxp, by - 33, cxp + 14, by - 25, cxp, by - 20], shade(roof, 1));
  poly([cxp - 14, by - 25, cxp, by - 20, cxp + 14, by - 25, cxp + 12, by - 23, cxp, by - 17, cxp - 12, by - 23], shade(roof, .7));
}
function buildMarket(wall: number[], roof: number[], hw: number): void {          // a market: awning with stripes over a stall
  const cxp = 40, by = 78, hd = hw / 2;
  poly([cxp - hw, by, cxp, by + hd, cxp + hw, by, cxp, by - hd], shade(wall, .95));
  for (let k = 0; k < 4; k++) { const x0 = cxp - hw + 4 + k * (hw * .5); poly([x0, by - 18, x0 + hw * .5, by - 18 + hd * .25, x0 + hw * .5, by - 8, x0, by - 8 - hd * .25], k % 2 === 0 ? rgb(roof) : 0xf0e6d0); }
  poly([cxp - 12, by - 2, cxp + 12, by - 2, cxp + 10, by - 9, cxp - 10, by - 9], rgb(WOOD_HONEY));
  blob(cxp - 5, by - 11, 2.5, 2, 0xc0392b); blob(cxp + 2, by - 11, 2.5, 2, 0xe0b13c); blob(cxp + 8, by - 10, 2.2, 2, 0x6aa050);
}
function buildTower(wall: number[], roof: number[], hg: number): void {           // a watch tower: tall narrow box with a platform
  const cxp = 40, by = 78;
  poly([cxp - 9, by - 2, cxp, by + 3, cxp, by - hg, cxp - 9, by - hg - 4], shade(wall, .8)); poly([cxp, by + 3, cxp + 9, by - 2, cxp + 9, by - hg - 4, cxp, by - hg], shade(wall, .95));
  poly([cxp - 13, by - hg - 4, cxp, by - hg + 3, cxp + 13, by - hg - 4, cxp, by - hg - 11], shade(roof, 1.1));
  poly([cxp - 13, by - hg - 4, cxp, by - hg + 3, cxp + 13, by - hg - 4, cxp + 11, by - hg - 10, cxp, by - hg - 3, cxp - 11, by - hg - 10], shade(roof, .75));
  poly([cxp - 3, by - hg - 7, cxp + 3, by - hg - 7, cxp + 3, by - hg - 16, cxp - 3, by - hg - 16], 0x6a5a40);
}
function buildHouse(id: number, wall: number[], roof: number[], hw: number, hg: number, kind: number, extra: number): void {
  const cxp = 40, by = 78, hd = hw / 2;
  poly([cxp - hw, by, cxp, by + hd, cxp, by + hd - hg, cxp - hw, by - hg], shade(wall, .8));
  poly([cxp, by + hd, cxp + hw, by, cxp + hw, by - hg, cxp, by + hd - hg], shade(wall, .96));
  const ry = (u: number): number => by + hd - u * hd / hw;           // the bottom edge of the right face at distance u from the centre corner
  const d0 = cxp + hw * .3, w0 = cxp + hw * .65, l0 = cxp - hw * .55;
  poly([d0, ry(hw * .3), d0 + 6, ry(hw * .3 + 6), d0 + 6, ry(hw * .3 + 6) - 12, d0, ry(hw * .3) - 12], 0x4a3626);
  poly([w0, ry(hw * .65) - 8, w0 + 4, ry(hw * .65 + 4) - 8, w0 + 4, ry(hw * .65 + 4) - 13, w0, ry(hw * .65) - 13], 0xf0d890);
  poly([l0, ry(hw * .55) - 8, l0 + 4, ry(hw * .55 - 4) - 8, l0 + 4, ry(hw * .55 - 4) - 13, l0, ry(hw * .55) - 13], 0xf0d890);
  if (kind === 6) {                                               // a mill: peaked top and sails
    poly([cxp - hw - 2, by - hg, cxp, by + hd + 2 - hg, cxp + hw + 2, by - hg, cxp, by - hd - 2 - hg, cxp, by - hg - 14], shade(roof, 1));
    stroke([cxp, by - hg - 4, cxp - 20, by - hg - 26], 2, 0x6a5238, 255, false); stroke([cxp, by - hg - 4, cxp + 20, by - hg + 18], 2, 0x6a5238, 255, false);
    stroke([cxp, by - hg - 4, cxp + 22, by - hg - 22], 2, 0x6a5238, 255, false); stroke([cxp, by - hg - 4, cxp - 20, by - hg + 14], 2, 0x6a5238, 255, false);
    return;
  }
  const rise = 14 + extra * 3, e = 4;                             // hip roof with eaves
  const lx = cxp - hw - e, rx = cxp + hw + e, ey = by - hg, byy = by + hd + e / 2 - hg, ty = by - hd - e / 2 - hg, ay = by - hg - rise;
  poly([cxp, ty, lx, ey, cxp, ay], shade(roof, .6)); poly([rx, ey, cxp, ty, cxp, ay], shade(roof, .7));
  poly([lx, ey, cxp, byy, cxp, ay], shade(roof, .86)); poly([cxp, byy, rx, ey, cxp, ay], shade(roof, 1.04));
  if (id !== buildIds[0]) {                                       // a chimney on the workshops
    poly([cxp - 12, by - hg - 4, cxp - 8, by - hg - 2, cxp - 8, by - hg - 14, cxp - 12, by - hg - 16], 0x5a4a44);
    poly([cxp - 8, by - hg - 2, cxp - 5, by - hg - 4, cxp - 5, by - hg - 16, cxp - 8, by - hg - 14], 0x75635a);
  }
}
function drawGate(id: number): void {
  place(id);
  const c = 40, b = 78;
  ground(c, b + 2, 30);
  poly([c - 26, b + 4, c - 20, b + 4, c - 20, b - 34, c - 26, b - 34], rgb(WOOD_BROWN)); poly([c + 20, b - 10, c + 26, b - 10, c + 26, b - 48, c + 20, b - 48], rgb(WOOD_BROWN));
  poly([c - 28, b - 32, c + 28, b - 52, c + 28, b - 46, c - 28, b - 26], rgb(WOOD_HONEY));
  poly([c - 20, b - 30, c + 20, b - 46, c + 20, b - 42, c - 20, b - 26], 0xc03a3a);
}

// ---- people ----
function paletteOf(role: number): Palette {
  const all: Palette[] = [P.SETTLER_PALETTE, P.RESIDENT_PALETTE, P.LUMBERJACK_PALETTE, P.HUNTER_PALETTE, P.FISHER_PALETTE, P.SAWYER_PALETTE, P.SMOKER_PALETTE, P.PORTER_PALETTE, P.FARMER_PALETTE, P.MILLER_PALETTE, P.BAKER_PALETTE, P.VENDOR_PALETTE, P.TANNER_PALETTE, P.QUARRYMAN_PALETTE, P.PEDDLER_PALETTE, P.FORAGER_PALETTE, P.SMITH_PALETTE, P.BEEKEEPER_PALETTE, P.CHANDLER_PALETTE, P.BREWER_PALETTE, P.INNKEEPER_PALETTE, P.FIREWARDEN_PALETTE, P.REPAIRMAN_PALETTE, P.WATCHMAN_PALETTE, P.ROBBER_PALETTE, P.RIOTER_PALETTE];
  return all[Math.min(role, all.length - 1)];
}
function drawRole(role: number): void {
  const pal = paletteOf(role);
  const shirt = pal.shirt, legs = pal.legs, hair = pal.hair, skin = pal.skin;
  for (let d = 0; d < DIRS; d++) for (let f = 0; f < FRAMES; f++) {
    const id = personId(role, d, f);
    place(id);
    const a = d * Math.PI / 4, dx = Math.cos(a), dy = Math.sin(a), fx = 10, fy = 28;
    const swing = Math.sin(f / FRAMES * 6.2832) * 3, bob = Math.abs(Math.sin(f / FRAMES * 6.2832)) * 1.2, sideways = Math.abs(dx) > .5;
    blob(fx, fy, 6, 2.6, 0x000000, 70);
    const lx = sideways ? swing * Math.sign(dx) : 0, wid = sideways ? 2.4 : 3.4;
    poly([fx - wid - lx * .5 - 1, fy - 10 - bob * .5, fx - wid + lx - 1, fy, fx - wid + lx + 1.6, fy, fx - wid - lx * .5 + 1.4, fy - 10 - bob * .5], shade(legs, .85));
    poly([fx + wid + lx * .5 - 1.4, fy - 10 - bob * .5, fx + wid - lx - 1.6, fy, fx + wid - lx + 1, fy, fx + wid + lx * .5 + 1, fy - 10 - bob * .5], shade(legs, 1.05));
    const bx = dx * 1.2;
    poly([fx - 5 + bx, fy - 10 - bob, fx + 5 + bx, fy - 10 - bob, fx + 4.5 + bx, fy - 19 - bob, fx - 4.5 + bx, fy - 19 - bob], rgb(shirt));
    poly([fx - 5 + bx, fy - 12 - bob, fx + 5 + bx, fy - 12 - bob, fx + 5 + bx, fy - 14 - bob, fx - 5 + bx, fy - 14 - bob], rgb(pal.stripe));
    const armSwing = sideways ? swing * .6 : 0;
    poly([fx - 7 + bx, fy - 18 - bob, fx - 5 + bx, fy - 18 - bob, fx - 5.4 + bx + armSwing, fy - 10 - bob, fx - 7.4 + bx + armSwing, fy - 10 - bob], shade(shirt, .8));
    poly([fx + 5 + bx, fy - 18 - bob, fx + 7 + bx, fy - 18 - bob, fx + 7.4 + bx - armSwing, fy - 10 - bob, fx + 5.4 + bx - armSwing, fy - 10 - bob], shade(shirt, .8));
    const hx = fx + bx + dx * .8;
    blob(hx, fy - 23 - bob, 3.6, 3.8, rgb(skin));
    if (dy < -.3) blob(hx, fy - 23.6 - bob, 3.7, 3.7, rgb(hair));                                   // facing away: hair covers the head
    else poly([hx - 3.7, fy - 24 - bob, hx + 3.7, fy - 24 - bob, hx + 3, fy - 27.5 - bob, hx - 3, fy - 27.5 - bob], rgb(hair));
  }
}

// ---- animals ----
function drawAnimal(kind: number): void {
  // kind: 0 doe, 1 stag, 2 rabbit, 3 boar, 4 wolf
  const fur = kind <= 1 ? FUR : kind === 2 ? RABBIT_FUR : kind === 3 ? BOAR_FUR : WOLF_FUR;
  const dark = kind <= 1 ? FUR_DARK : kind === 2 ? RABBIT_DARK : kind === 3 ? BOAR_DARK : WOLF_DARK;
  const light = kind <= 1 ? FUR_LIGHT : kind === 2 ? RABBIT_LIGHT : kind === 3 ? BOAR_LIGHT : WOLF_LIGHT;
  const len = [9, 10, 4.5, 8, 8][kind], thick = [4.6, 5, 3, 5.2, 4][kind], legH = [8, 9, 3, 5, 7][kind];
  for (let d = 0; d < DIRS; d++) for (let f = 0; f < FRAMES; f++) {
    const id = animalId(kind, d, f);
    place(id);
    const a = d * Math.PI / 4, ux = Math.cos(a), uy = Math.sin(a) * .62, sa = Math.sin(a), wy = .45 + .55 * Math.abs(ux), fx = 24, fy = 26;     // body axis on the screen (the ground is foreshortened)
    const ph = f / FRAMES * 6.2832, hop = kind === 2 ? Math.abs(Math.sin(ph)) * 3 : 0;
    blob(fx, fy, len + 3, (len + 3) * .45, 0x000000, 62);
    const bcx = fx, bcy = fy - legH - thick * .6 - hop;
    for (let l = 0; l < 4; l++) {                                  // legs: front pair and rear pair, swinging
      const along = (l < 2 ? 1 : -1) * len * .62, side = (l & 1 ? 1 : -1) * 2.2, sw = Math.sin(ph + (l === 1 || l === 2 ? 3.14 : 0)) * 2.2;
      const px = fx + ux * along, py = fy + uy * along + side * .5 - 1;
      stroke([px, bcy + 2, px + sw * ux, py - hop * .3], 1.7, shade(rgbArr(dark), l & 1 ? .7 : 1), 255, false);
    }
    const pts: number[] = [];
    for (let k = 0; k < 14; k++) { const t = k / 14 * 6.2832, lx = Math.cos(t) * len, ly = Math.sin(t) * thick; pts.push(bcx + lx * ux - ly * sa, bcy + lx * uy + ly * wy); }
    poly(pts, rgb(fur));
    const pts2: number[] = [];
    for (let k = 0; k < 14; k++) { const t = k / 14 * 6.2832, lx = Math.cos(t) * len * .7, ly = Math.sin(t) * thick * .5 + thick * .3; pts2.push(bcx + lx * ux - ly * sa, bcy + lx * uy + ly * wy); }
    poly(pts2, rgb(light), 150);
    const hx = bcx + ux * (len + 1.5), hy = bcy + uy * (len + 1.5) - (kind <= 1 ? 4 : kind === 3 ? -.5 : 1);     // head
    if (kind <= 1) stroke([bcx + ux * len * .6, bcy + uy * len * .6 - 1, hx, hy], 2.6, rgb(fur), 255, false);
    blob(hx, hy, kind === 2 ? 2.3 : kind === 3 ? 3.2 : 2.7, kind === 2 ? 2.2 : 2.5, rgb(fur));
    if (uy > -.2) blob(hx + ux * 1.6, hy + .4, 1.1, 1, rgb(dark));
    if (kind === 2) stroke([hx, hy - 1, hx - 1.5 * (ux >= 0 ? 1 : -1), hy - 6], 1.5, rgb(fur), 255, false);       // ears
    if (kind === 1) { for (let s = -1; s <= 1; s += 2) { stroke([hx, hy - 2, hx + s * 3, hy - 7], 1.1, 0xe6d6b0, 255, false); stroke([hx + s * 2, hy - 5, hx + s * 4, hy - 9], 1, 0xe6d6b0, 255, false); } }
    if (kind === 0) stroke([hx, hy - 1.5, hx - 1, hy - 4.5], 1.4, rgb(fur), 255, false);
    blob(bcx - ux * (len + .5), bcy - uy * (len + .5) - 1, 1.6, 1.6, kind <= 1 ? rgb(light) : rgb(dark));   // tail
  }
}
function rgbArr(c: number[]): number[] { return c; }

// ---- effects: smoke, water glints, grass ----
function drawSmoke(): void {
  for (let f = 0; f < SMOKE_FRAMES; f++) {
    place(fxId.smoke + f);
    const r = 3 + f * 1.5, g = 232 - f * 14;
    blob(12, 12, r, r * .9, (g << 16) | (g << 8) | (g - 6), 255);
    blob(12 - r * .25, 12 - r * .3, r * .55, r * .5, 0xffffff, 110);
  }
}
function drawRipple(): void {
  for (let f = 0; f < 4; f++) {
    place(fxId.ripple + f);
    const a = [90, 230, 150, 40][f], w = [5, 8, 10, 12][f];
    blob(14, 7, w, w * .42, 0xdff0f4, a);
    blob(14, 7, w - 2, (w - 2) * .42, 0x5a8aa0, a >> 1);
  }
}
function drawTufts(): void {
  for (let s = 0; s < SEASONS; s++) for (let w = 0; w < SWAYS; w++) {
    place(fxId.tuft + s * SWAYS + w);
    const b = broadAt(REP_MONTH[s]), lean = Math.sin(w * 1.5708) * 1.4, c = s === 3 ? [200, 206, 208] : s === 2 ? [150, 130, 70] : b.crown;
    for (let k = -2; k <= 2; k++) {
      const h = 7 + (k === 0 ? 3 : 0) - Math.abs(k), x = 8 + k * 1.8;
      poly([x - 1, 15, x + lean * h / 8 * (k < 0 ? 1.2 : .8), 15 - h, x + 1, 15], shade(c, .8 + (k + 2) * .08));
    }
  }
}

// ---- the sets ----
const SHEET_TREES = 0, SHEET_PROPS = 4, SHEET_BUILD = 5, SHEET_PEOPLE = 6, SHEET_ANIMALS = 7;
/** The groups and their places, once: the same ids whatever the art comes from. */
function layout(): void {
  if (layoutDone) return;
  layoutDone = true;
  for (let n = 0; n < sheetNames.length; n++) pk.push([1, 1, 0]);
  for (let v = 0; v < TREE_KINDS * SEASONS; v++) treeBase.push(0);
  for (let s = 0; s < SEASONS; s++) for (let v = 0; v < TREE_KINDS; v++) treeBase[v * SEASONS + s] = grp('tree/' + v + '/' + SEASON_NAMES[s], SHEET_TREES + s, SWAYS, 1, 56, 84, 28, 78);
  const rocks = grp('rock', SHEET_PROPS, 6, 1, 40, 30, 20, 24);
  for (let k = 0; k < 6; k++) rockIds.push(rocks + k);
  carryId.box = grp('carry-box', SHEET_PROPS, 1, 1, 10, 10, 5, 8);
  fxId.smoke = grp('fx/smoke', SHEET_PROPS, SMOKE_FRAMES, 1, 24, 24, 12, 12);
  fxId.ripple = grp('fx/ripple', SHEET_PROPS, 4, 1, 28, 14, 14, 7);
  fxId.tuft = grp('fx/grass', SHEET_PROPS, SWAYS, SEASONS, 16, 16, 8, 15);
  for (let k = 0; k < MODEL_IDS.length; k++) {
    buildIds.push(grp('building/' + MODEL_IDS[k], SHEET_BUILD, 1, 1, 80, 96, 40, 78));
    const lk = lookOf(k), hg = lk[2][0], kind = lk[2][1];
    chimney.push(kind === 0 && k !== 0 ? [-8.5, -hg - 16] : kind === 6 ? [0, -hg - 16] : [0, -hg - 8]);
  }
  for (let k = 0; k < BUILD_EXTRA.length; k++) buildIds.push(grp('building/' + BUILD_EXTRA[k], SHEET_BUILD, 1, 1, 80, 96, 40, 78));
  for (let r = 0; r < ROLES; r++) personBase.push(grp('person/' + ROLE_NAMES[r], SHEET_PEOPLE, FRAMES, DIRS, 20, 32, 10, 28));
  for (let k = 0; k < ANIMAL_KINDS; k++) animalBase.push(grp('animal/' + ANIMAL_NAMES[k], SHEET_ANIMALS, FRAMES, DIRS, 48, 32, 24, 26));
  fill();
  for (let n = 0; n < sheetNames.length; n++) sheetH.push(pk[n][1] + pk[n][2] + 2);
}

/** index.json: the places of the groups, as an artist (or the dump) wrote them; applied when it lists the groups of this build in order. */
function readIndex(): boolean {
  if (!assets.exists('atlas/index.json')) return false;
  const j = JSON.parse(assets.readText('atlas/index.json'));
  if (j.version !== 1 || j.groups.length !== groups.length || j.sheets.length !== sheetNames.length) { console.log('atlas/index.json does not match this build: sprites made by code'); return false; }
  for (let n = 0; n < groups.length; n++) if (j.groups[n].name !== groups[n].name || j.groups[n].frames !== groups[n].cols || j.groups[n].directions !== groups[n].rows) { console.log('atlas/index.json: group ' + j.groups[n].name + ' differs from ' + groups[n].name + ': sprites made by code'); return false; }
  for (let n = 0; n < groups.length; n++) { const e = j.groups[n], g = groups[n]; g.sheet = sheetNames.indexOf(e.sheet); g.x = e.x; g.y = e.y; g.cw = e.w; g.ch = e.h; g.ax = e.anchor[0]; g.ay = e.anchor[1]; }
  for (let n = 0; n < sheetH.length; n++) sheetH[n] = j.sheets[n].h;
  fill();
  return true;
}

function readyAll(): Ready { const r = new Ready(); r.trees = [true, true, true, true]; r.rocks = true; r.buildings = true; for (let q = 0; q < ROLES; q++) r.people.push(true); r.animals = [true, true, true, true, true]; r.all = true; return r; }
function startSet(k: number, useFiles: boolean): AtlasSet {
  const s = new AtlasSet();
  s.k = k;
  const t0 = performance.now();
  if (useFiles) {
    let ok = true;
    for (let n = 0; n < sheetNames.length && ok; n++) { const im = image('atlas/' + k + 'x/' + sheetNames[n] + '.png'); if (im < 0) ok = false; else s.images.push(im); }
    if (ok) { s.files = true; s.done = true; s.ready = readyAll(); stats.loadMs += performance.now() - t0; stats.source = 'files'; sets.push(s); return s; }
    s.images.length = 0;
  }
  for (let n = 0; n < sheetNames.length; n++) {
    s.px.push(openPage(SHEET_W * k, sheetH[n] * k)); s.images.push(createImage(SHEET_W * k, sheetH[n] * k)); s.dirty.push(false);
  }
  stats.source = 'code';
  const R = s.ready;
  for (let q = 0; q < SEASONS; q++) {
    s.jobs.push((): void => { for (let v = 0; v < TREE_KINDS; v++) for (let w = 0; w < SWAYS; w++) drawTree(treeId(v, q, w), v, q, w); R.trees[q] = true; });
  }
  s.jobs.push((): void => { for (let q = 0; q < 6; q++) drawRock(q); R.rocks = true; });
  s.jobs.push((): void => {
    for (let q = 0; q < MODEL_IDS.length; q++) drawBuilding(buildIds[q], lookOf(q), 0);
    drawGate(buildIds[GATE_MODEL]);
    drawBuilding(buildIds[GATE_MODEL + 1], lookOf(0), 1); drawBuilding(buildIds[GATE_MODEL + 2], lookOf(0), 2);
    R.buildings = true;
  });
  for (let r = 0; r < ROLES; r++) { R.people.push(false); s.jobs.push((): void => { drawRole(r); R.people[r] = true; }); }
  for (let q = 0; q < ANIMAL_KINDS; q++) s.jobs.push((): void => { drawAnimal(q); R.animals[q] = true; });
  s.jobs.push((): void => {
    place(carryId.box); poly([1, 3, 5, 1, 9, 3, 5, 5], 0xc8a068); poly([1, 3, 5, 5, 5, 9, 1, 7], 0x9a7648); poly([5, 5, 9, 3, 9, 7, 5, 9], 0xb08c58);
    drawSmoke(); drawRipple(); drawTufts();
    R.all = true;
  });
  sets.push(s);
  building = s;
  return s;
}
function select(s: AtlasSet): void { at.k = s.k; at.images = s.images; at.ready = s.ready; }

/** Makes the 1x set (from the PNG sheets of assets/atlas when they are there, else by code). A second call does nothing. */
export function initAtlas(): void {
  const t0 = performance.now();
  if (sets.length > 0) return;
  layout();
  const files = dumpDir === '' && env('ZINC_HAMLET_ATLAS') !== 'code' && readIndex();   // ZINC_HAMLET_ATLAS=code: the sprites made by code, whatever assets/atlas holds
  select(startSet(1, files));
  if (env('ZINC_HAMLET_TRACE') === '1') console.log('atlas 1x ' + stats.source + ': sheets ready in ' + Math.round(performance.now() - t0) + ' ms');
  stats.sheets = sheetNames.length;
}
let wanted = 1;
/** Runs jobs until the budget (ms) is spent; true while some remain. The current season's trees go first. */
export function bakeStep(budgetMs: number, firstSeason: number): boolean {
  const s = building;
  if (s === null) return false;
  if (s.next === 0 && firstSeason > 0 && s.k === 1) { const j = s.jobs[firstSeason]; s.jobs[firstSeason] = s.jobs[0]; s.jobs[0] = j; }
  cur = s;
  const t0 = performance.now();
  while (s.next < s.jobs.length) {
    s.jobs[s.next](); s.next++;
    if (performance.now() - t0 > budgetMs) break;
  }
  for (let n = 0; n < s.images.length; n++) if (s.dirty[n]) { updatePixels(s.images[n], s.px[n], false); s.dirty[n] = false; }
  stats.bakeMs += performance.now() - t0;
  if (s.next >= s.jobs.length) { s.done = true; building = null; if (env('ZINC_HAMLET_TRACE') === '1') console.log('atlas ' + s.k + 'x baked by code: ' + Math.round(stats.bakeMs) + ' ms'); }
  return !s.done;
}
/** The zoom decides the set: 2x above zoom 2 (made on the first need, drawn once it is complete), 1x again under 1.8. */
export function chooseSet(zoom: number): void {
  if (sets.length === 0) return;
  if (zoom > 2 && wanted < 2) { wanted = 2; if (sets.length < 2) startSet(2, dumpDir === '' && sets[0].files); }
  else if (zoom < 1.8 && wanted > 1) wanted = 1;
  const s = wanted >= 2 && sets.length > 1 ? sets[1] : sets[0];
  if (s.done && at.k !== s.k) select(s);
}
/** For the export: every job of a set made by code, at once; the pictures of its sheets stay in `px`. */
export function dumpSet(k: number): AtlasSet {
  const s = startSet(k, false);
  cur = s;
  while (s.next < s.jobs.length) { s.jobs[s.next](); s.next++; }
  s.done = true; building = null;
  for (let n = 0; n < s.images.length; n++) updatePixels(s.images[n], s.px[n], false);
  return s;
}
