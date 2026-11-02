import { createImage, updatePixels, image } from 'zinc:gfx';
import { env } from 'zinc:sys';
import * as assets from 'zinc:assets';
import { touchModelBuffer, castShadow, hashNumbers, hashText, rampOf } from '../pixel';
import { broadAt } from '../view/seasons';
import { MODEL_IDS, MODEL_GATE, MODEL_ROCK, MODEL_HOUSE_UP, TREE_HEIGHT, drawModelId, drawTreeMonth, models, useModels } from '../view/models';
import { actorAtlas, paintCarry, forgetActorAtlases } from '../view/actors';
import { Cell, S_ART, capture, shear, blit, disc, argb } from './bake';

// The sprites of the Cite view. They are the Pixel Plays art of the old view (the same models, figures, light, ramps, dither and shadows), baked into RGBA frames by
// src/cite/bake.ts and packed on a few sheets. Two modes give the same frames: `computed` bakes them at the first frames from the generators (a few jobs a frame,
// bakeStep), `files` loads the exported sheets of assets/atlas (PNG + index.json) and bakes nothing. The export (ZINC_HAMLET_ATLAS_DUMP) is the serialisation of
// what `computed` makes, and index.json records a hash of the generators (`generator`): a stale export is detected and `computed` is used instead.
// A group is a grid of cells (a row a direction or a season, a column a frame); a sheet is one image so the draws batch. Two sets exist: 1x (a tile is 64 pixels
// across) and 2x (lit again at twice the scale, for a zoom above 2). A sprite whose group is not ready is skipped.
export const SHEET_W = 1024;
export const sheetNames = ['trees-spring', 'trees-summer', 'trees-autumn', 'trees-winter', 'props', 'buildings', 'people', 'animals'];
export const GENERATOR_VERSION = 1;        // bumped when a change of the drawing code is not seen by the probe frames of generatorHash()
/** A grid of `cols` x `rows` cells of cw x ch pixels (1 pixel between cells) at (x, y) of its sheet; ax, ay: where the foot is in a cell. Sprite ids run row by row from `first`. */
export class Group { name: string = ''; sheet: number = 0; x: number = 0; y: number = 0; cw: number = 0; ch: number = 0; cols: number = 1; rows: number = 1; ax: number = 0; ay: number = 0; first: number = 0; pose: string = ''; fps: number = 0; loop: boolean = false; }
export const groups: Group[] = [];
export const sheetH: number[] = [];
export const sx: number[] = [], sy: number[] = [], sw: number[] = [], sh: number[] = [], ox: number[] = [], oy: number[] = [], sheetOf: number[] = [];   // per sprite, in 1x pixels: its place in its sheet and where its foot is
let layoutDone = false;
const pk: number[][] = [];      // per sheet: shelf packer [x, y, row height]
function grp(name: string, sheet: number, cols: number, rows: number, cw: number, ch: number, ax: number, ay: number, pose: string = '', fps: number = 0, loop: boolean = false): number {
  const g = new Group();
  g.pose = pose; g.fps = fps; g.loop = loop;
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

export function shade(c: number[], f: number): number { return (Math.min(255, Math.round(c[0] * f)) << 16) | (Math.min(255, Math.round(c[1] * f)) << 8) | Math.min(255, Math.round(c[2] * f)); }

// ---- ids ----
export const SEASONS = 4, SWAYS = 4, TREE_KINDS = 4;
export const treeBase: number[] = [];       // per (variant, season): its first sprite, then one a sway frame
export const rockIds: number[] = [];        // 2 plain rocks, then the deposits (stone, clay, ore, berries)
export const buildIds: number[] = [];       // per model id of view/models.ts, then the gate, then the house at levels 2 and 3
export const GATE_MODEL = MODEL_IDS.length;
export const personBase: number[][] = [];   // per role, per pose of PERSON_POSES: its first sprite (a row a direction, a column a frame)
export const animalBase: number[][] = [];   // per kind (deer, stag, rabbit, boar, wolf), per pose of ANIMAL_POSES[kind]
export const carryBase: number[] = [];      // per load (carry 1 to CARRIES): 8 sprites, one a direction, drawn over the person
export const ANIMAL_KINDS = 5, DIRS = 8, ROLES = 26, CARRIES = 20;
/** A named animation of a group: `frames` of it play at `fps` frames a second, looping or holding the last; `slot` is the first pose of the old view's atlas entry it is baked from. */
export class PoseDef { name: string = ''; frames: number = 1; fps: number = 0; loop: boolean = false; slot: number = 0; }
function pd(name: string, frames: number, fps: number, loop: boolean, slot: number): PoseDef { const d = new PoseDef(); d.name = name; d.frames = frames; d.fps = fps; d.loop = loop; d.slot = slot; return d; }
// the poses the old view plays (view/actors.ts SLOT_*, DSLOT_*, beasts.ts SLOT_*); the rates are those of its phases at the normal pace
export const PERSON_POSES: PoseDef[] = [pd('walk', 8, 10, true, 0), pd('chop', 6, 8, true, 8), pd('aim', 1, 0, false, 14), pd('fish', 1, 0, false, 15), pd('pick', 1, 0, false, 16), pd('idle', 1, 0, true, 17)];
export const P_WALK = 0, P_CHOP = 1, P_AIM = 2, P_FISH = 3, P_PICK = 4, P_IDLE = 5;
const DEER_POSES: PoseDef[] = [pd('walk', 8, 8, true, 0), pd('flee', 6, 12, true, 8), pd('graze', 4, 0, false, 14), pd('dead', 1, 0, false, 18), pd('fall', 3, 6, false, 20)];
const BEAST_POSES: PoseDef[] = [pd('walk', 8, 8, true, 0), pd('flee', 6, 12, true, 8), pd('graze', 2, 0, false, 14), pd('dead', 1, 0, false, 16)];
const WOLF_POSES: PoseDef[] = [pd('walk', 8, 8, true, 0), pd('flee', 6, 12, true, 8), pd('graze', 2, 0, false, 14), pd('dead', 1, 0, false, 16), pd('crouch', 6, 4, true, 17), pd('howl', 1, 0, false, 23)];
export const ANIMAL_POSES: PoseDef[][] = [DEER_POSES, DEER_POSES, BEAST_POSES, BEAST_POSES, WOLF_POSES];
export const A_WALK = 0, A_FLEE = 1, A_GRAZE = 2, A_DEAD = 3;
export const fxId = { smoke: -1, ripple: -1, tuft: -1 };          // smoke: 4 puffs; ripple: 4 glints on water; tuft: per season, 4 sway frames
export const chimney: number[][] = [];                             // per building sprite: where its chimney top is, from the foot, in 1x pixels (x, y)
export const SMOKE_FRAMES = 4;
const ROLE_NAMES = ['settler', 'resident', 'lumberjack', 'hunter', 'fisher', 'sawyer', 'smoker', 'porter', 'farmer', 'miller', 'baker', 'vendor', 'tanner', 'quarryman', 'peddler', 'forager', 'smith', 'beekeeper', 'chandler', 'brewer', 'innkeeper', 'firewarden', 'repairman', 'watchman', 'robber', 'rioter'];
const ANIMAL_NAMES = ['doe', 'stag', 'rabbit', 'boar', 'wolf'];
const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];
const BUILD_EXTRA = ['gate', 'house-2', 'house-3'];

class Ready { trees: boolean[] = [false, false, false, false]; rocks: boolean = false; buildings: boolean = false; people: boolean[] = []; animals: boolean[] = [false, false, false, false, false]; all: boolean = false; }
/** One resolution of the atlas: its sheets (images), and the jobs that paint them when they are made from the generators. */
export class AtlasSet {
  k: number = 1; images: number[] = []; px: u32[][] = []; ready: Ready = new Ready(); jobs: (() => void)[] = []; next: number = 0; files: boolean = false; done: boolean = false; dirty: boolean[] = [];
}
export const sets: AtlasSet[] = [];
/** The set that is drawn: k is its pixels per sprite pixel (1 or 2). */
export const at = { k: 1, images: [] as number[], ready: new Ready() };
let building: AtlasSet | null = null;
export const stats = { source: '', bakeMs: 0, loadMs: 0, sheets: 0, generator: 0 };
export const dumpDir: string = env('ZINC_HAMLET_ATLAS_DUMP');
const onlyText: string = env('ZINC_HAMLET_ATLAS_ONLY');          // with the export: only the groups whose name starts with one of these (comma separated)
const onlyList: string[] = onlyText === '' ? [] : onlyText.split(',');
function wants(name: string): boolean { if (onlyList.length === 0) return true; for (const p of onlyList) if (name.indexOf(p) === 0) return true; return false; }

export function treeId(variant: number, season: number, sway: number): number { return treeBase[variant * SEASONS + season] + sway; }
export function personId(role: number, pose: number, dir: number, frame: number): number { return personBase[role][pose] + dir * PERSON_POSES[pose].frames + frame; }
export function animalId(kind: number, pose: number, dir: number, frame: number): number { return animalBase[kind][pose] + dir * ANIMAL_POSES[kind][pose].frames + frame; }
export function carryId(carry: number, dir: number): number { return carryBase[Math.min(carry, CARRIES) - 1] + dir; }

const REP_MONTH = [1, 4, 7, 10];
let cur: AtlasSet | null = null;

// ---- baking ----
/** The cell of group g at the scale of the set: art pixels, two to an atlas pixel of the 1x sheet. */
function cellOf(g: Group, k: number, draw: () => void, shadow: (() => void) | null): Cell { return capture(draw, shadow, g.cw * k, g.ch * k, g.ax * k, g.ay * k, k); }
function put(g: Group, col: number, row: number, c: Cell): void {
  const s = cur as AtlasSet;
  blit(c, s.px[g.sheet], SHEET_W * s.k, (g.x + col * (g.cw + 1)) * s.k, (g.y + row * (g.ch + 1)) * s.k);
  s.dirty[g.sheet] = true;
}
function groupNamed(name: string): Group { for (const g of groups) if (g.name === name) return g; return groups[0]; }
function groupAt(id: number): Group { for (let n = groups.length - 1; n >= 0; n--) if (groups[n].first <= id) return groups[n]; return groups[0]; }
const treeShadow = (h: number): (() => void) => (): void => { for (let z = 1; z < h; z += .45) castShadow(0, 0, z, .6); };

function bakeTrees(season: number, k: number): void {
  for (let v = 0; v < TREE_KINDS; v++) {
    const g = groupAt(treeBase[v * SEASONS + season]);
    if (!wants(g.name)) continue;
    const base = cellOf(g, k, (): void => drawTreeMonth(v, REP_MONTH[season]), treeShadow(TREE_HEIGHT[v]));
    for (let w = 0; w < SWAYS; w++) put(g, w, 0, w === 0 || w === 2 ? base : shear(base, (w === 1 ? 1.6 : -1.6) * k));
  }
}
function bakeRocks(k: number): void {
  const g = groupNamed('rock');
  if (!wants(g.name)) return;
  for (let q = 0; q < 6; q++) put(g, q, 0, cellOf(g, k, (): void => { drawModelId(MODEL_ROCK + q); }, (): void => castShadow(0, 0, .4, .6)));
}
function bakeBuilding(g: Group, id: number, k: number, smokeAt: number[]): void {
  if (!wants(g.name)) return;
  const c = cellOf(g, k, (): void => { drawModelId(id); }, (): void => { for (let z = .4; z < 2.6; z += .55) castShadow(0, 0, z, .85); });
  put(g, 0, 0, c);
  if (k !== 1) return;
  // the chimney: the highest lit pixel, from the foot, in 1x pixels (the smoke rises from it)
  for (let y = 0; y < c.h; y++) {
    let sum = 0, n = 0;
    for (let x = 0; x < c.w; x++) if (c.depth[y * c.w + x] > -1e8) { sum += x; n++; }
    if (n > 0) { smokeAt[0] = ((sum / n) - c.ax) / k; smokeAt[1] = (y - c.ay) / k + 2; return; }
  }
}
function bakeBuildings(k: number): void {
  for (let q = 0; q < MODEL_IDS.length + 3; q++) {
    const id = q < MODEL_IDS.length ? q : q === MODEL_IDS.length ? MODEL_GATE : MODEL_HOUSE_UP + q - MODEL_IDS.length - 1;
    bakeBuilding(groupAt(buildIds[q]), id, k, chimney[q]);
  }
}
const YAW_OF_DIR = [7, 0, 1, 2, 3, 4, 5, 6];       // the screen direction of a sprite row (0: right, 2: down, clockwise) and the heading of the old view that faces it
const personShadow = (): void => { castShadow(0, 0, .3, .13); castShadow(0, 0, .75, .16); castShadow(0, 0, 1.15, .15); castShadow(0, 0, 1.5, .13); castShadow(0, 0, 0, .2, 2, 0); };
function bakeRole(role: number, k: number): void {
  const aa = actorAtlas();
  for (let p = 0; p < PERSON_POSES.length; p++) {
    const g = groupAt(personBase[role][p]), pp = PERSON_POSES[p];
    if (!wants(g.name)) continue;
    for (let d = 0; d < DIRS; d++) for (let f = 0; f < pp.frames; f++) {
      put(g, f, d, cellOf(g, k, (): void => { aa.stamp('person', { variant: role * 4, yaw8: YAW_OF_DIR[d], pose: pp.slot + f }, 0, 0, 0, false); }, personShadow));
    }
  }
}
function bakeCarry(c: number, k: number): void {
  const g = groupAt(carryBase[c - 1]);
  if (!wants(g.name)) return;
  for (let d = 0; d < DIRS; d++) put(g, 0, d, cellOf(g, k, (): void => paintCarry(c, YAW_OF_DIR[d] * Math.PI / 4), null));
}
function bakeAnimal(kind: number, k: number): void {
  const a = actorAtlas(), name = kind <= 1 ? 'deer' : kind === 2 ? 'rabbit' : kind === 3 ? 'boar' : 'wolf', r = kind === 2 ? .15 : kind === 4 ? .32 : .4;
  for (let p = 0; p < ANIMAL_POSES[kind].length; p++) {
    const g = groupAt(animalBase[kind][p]), pp = ANIMAL_POSES[kind][p];
    if (!wants(g.name)) continue;
    for (let d = 0; d < DIRS; d++) for (let f = 0; f < pp.frames; f++) {
      put(g, f, d, cellOf(g, k, (): void => { a.stamp(name, { variant: kind === 1 ? 1 : 0, yaw8: YAW_OF_DIR[d], pose: pp.slot + f }, 0, 0, 0, false); }, (): void => { if (kind <= 1) castShadow(0, 0, .5, .55); else castShadow(0, 0, r * .6, r); }));
    }
  }
}

// ---- the small effects: smoke, water glints, grass ----
function bakeFx(k: number): void {
  let g = groupNamed('fx/smoke');
  if (wants(g.name)) for (let f = 0; f < SMOKE_FRAMES; f++) {
    const c = new Cell(g.cw * k, g.ch * k, g.ax * k, g.ay * k), r = (1.4 + f * .7) * k, grey = 232 - f * 12;
    disc(c, c.ax, c.ay, r, r * .9, [grey, grey, grey - 8], 255, .7); put(g, f, 0, c);
  }
  g = groupNamed('fx/ripple');
  if (wants(g.name)) for (let f = 0; f < 4; f++) {
    const c = new Cell(g.cw * k, g.ch * k, g.ax * k, g.ay * k), w = [2.5, 4, 5, 6][f] * k, a = [90, 230, 150, 40][f];
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
      const dx = (x + .5 - c.ax) / w, dy = (y + .5 - c.ay) / (w * .42), n = dx * dx + dy * dy;
      if (n < .5 || n > 1.1) continue;
      if ((x + y) % 3 === 0) continue;
      c.px[y * c.w + x] = argb(n < .8 ? [223, 240, 244] : [90, 138, 160], a);
    }
    put(g, f, 0, c);
  }
  g = groupNamed('fx/grass');
  if (wants(g.name)) for (let s = 0; s < SEASONS; s++) for (let w = 0; w < SWAYS; w++) {
    const c = new Cell(g.cw * k, g.ch * k, g.ax * k, g.ay * k);
    const col: number[] = s === 3 ? [200, 206, 208] : s === 2 ? [150, 130, 70] : broadAt(REP_MONTH[s]).crown, ramp = rampOf(col), lean = Math.sin(w * 1.5708) * .9 * k;
    for (let b = -2; b <= 2; b++) {
      const h = (3 + (b === 0 ? 2 : 0) - Math.abs(b) * .6) * k, bx = c.ax + b * 1.3 * k;
      for (let y = 0; y < h; y++) {
        const px = Math.round(bx + lean * y / h), py = c.ay - 1 - y;
        if (px < 0 || px >= c.w || py < 0 || py >= c.h) continue;
        c.px[py * c.w + px] = y > h * .55 ? ramp[3] : ramp[1];
      }
    }
    put(g, w, s, c);
  }
}

// ---- the layout and the sets ----
const SHEET_TREES = 0, SHEET_PROPS = 4, SHEET_BUILD = 5, SHEET_PEOPLE = 6, SHEET_ANIMALS = 7;
/** The groups and their places, once: the same ids whatever the art comes from. Sizes are in art pixels of the old view (S = 10): one atlas pixel, drawn ART map pixels wide. */
function layout(): void {
  if (layoutDone) return;
  layoutDone = true;
  for (let n = 0; n < sheetNames.length; n++) pk.push([1, 1, 0]);
  for (let v = 0; v < TREE_KINDS * SEASONS; v++) treeBase.push(0);
  for (let s = 0; s < SEASONS; s++) for (let v = 0; v < TREE_KINDS; v++) treeBase[v * SEASONS + s] = grp('tree/' + v + '/' + SEASON_NAMES[s], SHEET_TREES + s, SWAYS, 1, 50, 50, 16, 46);
  const rocks = grp('rock', SHEET_PROPS, 6, 1, 32, 20, 12, 15);
  for (let k = 0; k < 6; k++) rockIds.push(rocks + k);
  fxId.smoke = grp('fx/smoke', SHEET_PROPS, SMOKE_FRAMES, 1, 12, 12, 6, 6);
  fxId.ripple = grp('fx/ripple', SHEET_PROPS, 4, 1, 14, 8, 7, 4);
  fxId.tuft = grp('fx/grass', SHEET_PROPS, SWAYS, SEASONS, 8, 8, 4, 8);
  for (let k = 0; k < MODEL_IDS.length; k++) { buildIds.push(grp('building/' + MODEL_IDS[k], SHEET_BUILD, 1, 1, 64, 56, 24, 47)); chimney.push([0, -60]); }
  for (let k = 0; k < BUILD_EXTRA.length; k++) { buildIds.push(grp('building/' + BUILD_EXTRA[k], SHEET_BUILD, 1, 1, 64, 56, 24, 47)); chimney.push([0, -60]); }
  for (let r = 0; r < ROLES; r++) { const l: number[] = []; for (const pp of PERSON_POSES) l.push(grp('person/' + ROLE_NAMES[r] + '/' + pp.name, SHEET_PEOPLE, pp.frames, DIRS, 20, 20, 6, 18, pp.name, pp.fps, pp.loop)); personBase.push(l); }
  for (let c = 1; c <= CARRIES; c++) carryBase.push(grp('carry/' + c, SHEET_PEOPLE, 1, DIRS, 20, 20, 6, 18));
  for (let k = 0; k < ANIMAL_KINDS; k++) { const l: number[] = []; for (const pp of ANIMAL_POSES[k]) l.push(grp('animal/' + ANIMAL_NAMES[k] + '/' + pp.name, SHEET_ANIMALS, pp.frames, DIRS, 36, 28, 14, 22, pp.name, pp.fps, pp.loop)); animalBase.push(l); }
  fill();
  for (let n = 0; n < sheetNames.length; n++) sheetH.push(pk[n][1] + pk[n][2] + 2);
}

/** A number that changes when the generators change: the layout, the light, and a digest of four probe frames (a house, a pine, a person, a deer) baked now. */
export function generatorHash(): number {
  layout();
  const parts: number[] = [GENERATOR_VERSION, groups.length];
  for (const g of groups) parts.push(hashText(g.name), g.cw, g.ch, g.ax, g.ay, g.cols, g.rows);
  const saved = cur, probe = new AtlasSet();
  cur = probe;
  const cells: Cell[] = [
    capture((): void => { drawModelId(0); }, null, 64, 56, 24, 47, 1),
    capture((): void => drawTreeMonth(0, 4), null, 50, 50, 16, 46, 1),
    capture((): void => { actorAtlas().stamp('person', { variant: 8, yaw8: 1, pose: 2 }, 0, 0, 0, false); }, personShadow, 20, 20, 6, 18, 1),
    capture((): void => { actorAtlas().stamp('deer', { variant: 1, yaw8: 3, pose: 2 }, 0, 0, 0, false); }, null, 36, 28, 14, 22, 1),
  ];
  cur = saved;
  for (const c of cells) { let h = 0; for (let n = 0; n < c.px.length; n++) h = (Math.imul(h, 31) + c.px[n]) | 0; parts.push(h); }
  return hashNumbers(parts);
}

/** index.json: the places of the groups, as the export (or an artist) wrote them; applied when it lists the groups of this build in order. Returns it, or null. */
function readIndex(): { generator: number } | null {
  if (!assets.exists('atlas/index.json')) return null;
  const j = JSON.parse(assets.readText('atlas/index.json'));
  if (j.version !== 2 || j.groups.length !== groups.length || j.sheets.length !== sheetNames.length) { console.log('atlas/index.json does not match this build: sprites baked from the generators'); return null; }
  for (let n = 0; n < groups.length; n++) if (j.groups[n].name !== groups[n].name || j.groups[n].frames !== groups[n].cols || j.groups[n].directions !== groups[n].rows) { console.log('atlas/index.json: group ' + j.groups[n].name + ' differs from ' + groups[n].name + ': sprites baked from the generators'); return null; }
  for (let n = 0; n < groups.length; n++) { const e = j.groups[n], g = groups[n]; g.sheet = sheetNames.indexOf(e.sheet); g.x = e.x; g.y = e.y; g.cw = e.w; g.ch = e.h; g.ax = e.anchor[0]; g.ay = e.anchor[1]; }
  for (let n = 0; n < sheetH.length; n++) sheetH[n] = j.sheets[n].h;
  for (let n = 0; n < buildIds.length; n++) { const e = j.groups[groups.indexOf(groupAt(buildIds[n]))]; if (e.chimney !== undefined) chimney[n] = [e.chimney[0], e.chimney[1]]; }
  fill();
  return { generator: j.generator };
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
    s.px.push(Array.from({ length: SHEET_W * k * sheetH[n] * k }, (): u32 => 0)); s.images.push(createImage(SHEET_W * k, sheetH[n] * k)); s.dirty.push(false);
  }
  stats.source = 'computed';
  const R = s.ready;
  for (let q = 0; q < SEASONS; q++) s.jobs.push((): void => { bakeTrees(q, k); R.trees[q] = true; });
  s.jobs.push((): void => { bakeRocks(k); R.rocks = true; });
  s.jobs.push((): void => { bakeBuildings(k); R.buildings = true; });
  for (let r = 0; r < ROLES; r++) { R.people.push(false); s.jobs.push((): void => { bakeRole(r, k); R.people[r] = true; }); }
  s.jobs.push((): void => { for (let c = 1; c <= CARRIES; c++) bakeCarry(c, k); });
  for (let q = 0; q < ANIMAL_KINDS; q++) s.jobs.push((): void => { bakeAnimal(q, k); R.animals[q] = true; });
  s.jobs.push((): void => { bakeFx(k); R.all = true; });
  sets.push(s);
  building = s;
  return s;
}
function select(s: AtlasSet): void { at.k = s.k; at.images = s.images; at.ready = s.ready; }

/** The mode asked for: ZINC_HAMLET_ATLAS=files|computed (code is computed), else '' (files when they match the generators). */
export let mode: string = env('ZINC_HAMLET_ATLAS') === 'code' ? 'computed' : env('ZINC_HAMLET_ATLAS');
/** Makes the 1x set, from the files or from the generators. A second call does nothing. */
export function initAtlas(): void {
  const t0 = performance.now();
  if (sets.length > 0) return;
  layout();
  let files = false;
  if (dumpDir === '' && mode !== 'computed') {
    const idx = readIndex();
    if (idx !== null) {
      stats.generator = generatorHash();
      files = mode === 'files' || idx.generator === stats.generator;
      if (!files) console.log('atlas/index.json was exported by other generators (' + idx.generator + ', now ' + stats.generator + '): sprites baked from the generators');
    }
  }
  if (env('ZINC_HAMLET_ATLAS_CHECK') === '1') { const r = checkFrames(); console.log('atlas check: ' + r[0] + ' lit pixels, ' + r[1] + ' differ from the old view frames'); }
  select(startSet(1, files));
  if (env('ZINC_HAMLET_TRACE') === '1') console.log('atlas 1x ' + stats.source + ': sheets ready in ' + Math.round(performance.now() - t0) + ' ms');
  stats.sheets = sheetNames.length;
}
/** Switches the mode while the game runs (the panel): the sets are made again. */
export const ATLAS_MODES: string[] = ['Auto (fichiers si à jour)', 'Fichiers (PNG)', 'Calculé (générateurs)'];
export function atlasModeIndex(): number { return mode === 'files' ? 1 : mode === 'computed' ? 2 : 0; }
export function setMode(m: string): void {
  if (sets.length === 0) { mode = m; return; }
  if (m === mode && sets.length > 0) return;
  mode = m; sets.length = 0; building = null; wanted = 1; stats.bakeMs = 0;
  layoutDone = false; groups.length = 0; sheetH.length = 0; pk.length = 0; treeBase.length = 0; rockIds.length = 0; buildIds.length = 0; personBase.length = 0; animalBase.length = 0; carryBase.length = 0; chimney.length = 0;
  initAtlas();
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
  if (s.next >= s.jobs.length) { s.done = true; building = null; if (env('ZINC_HAMLET_TRACE') === '1') console.log('atlas ' + s.k + 'x baked from the generators: ' + Math.round(stats.bakeMs) + ' ms'); }
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
/** For the export: every job of a set, at once; the pictures of its sheets stay in `px`. */
export function dumpSet(k: number): AtlasSet {
  const s = startSet(k, false);
  cur = s;
  while (s.next < s.jobs.length) { s.jobs[s.next](); s.next++; }
  s.done = true; building = null;
  for (let n = 0; n < s.images.length; n++) updatePixels(s.images[n], s.px[n], false);
  return s;
}
/** For the test of the pipeline: a baked person frame and the same frame of the old view's own model capture, compared pixel by pixel (lit pixels only). Returns [pixels, differing]. */
export function checkFrames(): number[] {
  layout();
  const c = capture((): void => { actorAtlas().stamp('person', { variant: 8, yaw8: 1, pose: 2 }, 0, 0, 0, false); }, null, 40, 40, 12, 36, 1);
  const frame = actorAtlas().bake('person', { variant: 8, yaw8: 1, pose: 2 });
  const d = capture((): void => { touchModelBuffer(); if (frame !== null) frame.drawAt(0, 0, 0); }, null, 40, 40, 12, 36, 1);
  const h = capture((): void => { drawModelId(0); }, null, 64, 56, 24, 47, 1);      // the house: drawn now, and the cached model the old view stamps
  useModels(0, S_ART, 0);
  const o = capture((): void => { touchModelBuffer(); models[0].drawAt(0, 0, 0); }, null, 64, 56, 24, 47, 1);
  let n = 0, diff = 0;
  for (let i = 0; i < c.px.length; i++) { if (c.depth[i] > -1e8) n++; if (c.px[i] !== d.px[i]) diff++; }
  for (let i = 0; i < h.px.length; i++) { if (h.depth[i] > -1e8) n++; if (h.px[i] !== o.px[i]) diff++; }
  forgetActorAtlases();
  return [n, diff];
}
