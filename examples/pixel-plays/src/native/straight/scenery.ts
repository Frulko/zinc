import {
  W, H, R2, COS, PX, PY, pix, zb, ground, groundZ, kinds, KIND_GRASS,
  unproject, project, hash, noise, clamp, bayerAt, capsule, sphere, box, growGrass, growTree,
  castShadow, copyInto, rgbColor, captureLeaf, rgb,
  beginModel, captureModel, CachedModel, Color, Vec3,
} from '../renderer';
import type { ScrollPainter } from '../scroll';
import { WATER } from '../harbor/palette';
import { Tile, KIND_BEACH, KIND_JUNGLE, KIND_TREASURE, SLOTS, WALL, GAP, FOOT_W, FOOT_H, world, shoreU, xOf, yOf, setOrigin } from './state';

export const KIND_WATER = 2;
const SAND: Color[] = [[196, 164, 100], [214, 184, 118], [228, 204, 140], [238, 222, 172]];
const FLOOR: Color[] = [[34, 66, 50], [46, 82, 52], [64, 100, 54], [92, 124, 60]];
const TRUNK: Color = [112, 86, 60], FROND: Color = [64, 112, 60], FROND_LIGHT: Color = [110, 148, 68];
const WOOD: Color = [150, 106, 62], WOOD_DARK: Color = [96, 64, 42], STONE: Color = [158, 156, 148];
const GOLD: Color = [226, 176, 58], CHEST: Color = [138, 88, 44];
let rowboat: CachedModel | null = null;
let chestEmpty: CachedModel | null = null;
let chestGold: CachedModel | null = null;
export function drawRowboat(x: number, y: number): void { if (rowboat !== null) rowboat.drawAt(x, y, 0); }
export function drawChest(x: number, y: number, gold: boolean): void {
  const model = gold ? chestGold : chestEmpty;
  if (model !== null) model.drawAt(x, y, 0);
}

const at = (u: number, v: number, z: number): Vec3 => [xOf(u, v), yOf(u, v), z];
let GU = 0, GV = 0;   // the tile being painted, so the shading noise runs on world coordinates and two tiles meet without a seam
/** Whether anything planted at (x, y) can touch the picture being baked: its pixels and its shadow reach about 120 px. */
function near(x: number, y: number): boolean {
  const p = project(x, y, 0);
  return p.sx > -120 && p.sx < W + 120 && p.sy > -120 && p.sy < H + 120;
}

function sandAt(u: number, v: number, ix: number, iy: number, lift: number = 0): number {
  const shade = clamp(Math.floor(1.2 + (noise((u + GU) * .8, (v + GV) * .8) - .5) * 2.2 + (hash(ix, iy) - .5) * .7 + (bayerAt(ix, iy) - .5) * .5 + lift), 0, 3);
  return rgbColor(SAND[shade]);
}
function floorAt(u: number, v: number, ix: number, iy: number, i: number): number {
  kinds[i] = KIND_GRASS;
  const shade = clamp(Math.floor(noise((u + GU) * .9, (v + GV) * .9) * 3.4 + hash(ix, iy) * .6), 0, 3);
  return rgbColor(FLOOR[shade]);
}
function jungleGround(t: Tile, u: number, v: number, ix: number, iy: number, i: number): number {
  const wob = Math.sin(u * .35 + t.seed) * .3;
  if (Math.abs(v - wob) < WALL - .1 + (noise(u * .8, 9) - .5) * .3) return sandAt(u, v, ix, iy);
  const slot = SLOTS[v < 0 ? t.north : t.south];
  if (Math.abs(u - slot) < GAP + .1 + (noise(v * .8, u) - .5) * .2) return sandAt(u, v, ix, iy, -.3);
  return floorAt(u, v, ix, iy, i);
}
function seaAt(u: number, v: number, ix: number, iy: number, i: number, shore: number): number {
  kinds[i] = KIND_WATER;
  const deep = Math.max(shore - u, v - 6.6) - 5;
  const shade = clamp(Math.floor(1.5 + (noise((u + GU) * .35, (v + GV) * .45) - .5) * 2.4 + (bayerAt(ix, iy) - .5) * .5 - Math.max(0, deep) * .12), 0, 3);
  return rgbColor(WATER[shade]);
}
function beachGround(u: number, v: number, ix: number, iy: number, i: number): number {
  const shore = shoreU(v);
  if (u < shore || v > 6.7 + noise(u * .35, 5) * 1.1) return seaAt(u, v, ix, iy, i, shore);
  if (v < -5.4 - noise(u * .4, 2) * .8 || (u > 8.2 && Math.abs(v) > 3.2) || v > 5.5 + noise(u * .5, 7) * .6) return floorAt(u, v, ix, iy, i);
  return sandAt(u, v, ix, iy, u < shore + 1 ? -1.1 : 0);
}
function treasureGround(u: number, v: number, ix: number, iy: number, i: number): number {
  const disc = (u / 7.8) * (u / 7.8) + (v / 5.8) * (v / 5.8) + (noise(u * .6, v * .6) - .5) * .5;
  if (disc < 1 || (u < -3 && Math.abs(v) < 2.5 + (noise(u * .5, 4) - .5) * .8)) return sandAt(u, v, ix, iy);
  return floorAt(u, v, ix, iy, i);
}

/* ---------- plants and stones: volumes lit like everything else ---------- */
function palm(x: number, y: number, height: number, lean: number, k: number): void {
  if (!near(x, y)) return;
  const bx = Math.cos(lean) * .9, by = Math.sin(lean) * .9;
  let px = x, py = y, pz = 0;
  for (let s = 1; s <= 5; s++) {
    const t = s / 5, nx = x + bx * t * t * 1.7, ny = y + by * t * t * 1.7, nz = height * t;
    capsule([px, py, pz], [nx, ny, nz], .2 - .09 * (s - 1) / 5, .2 - .09 * s / 5, (): Color => TRUNK, 'rough');
    px = nx; py = ny; pz = nz;
  }
  for (let f = 0; f < 8; f++) {
    const a = f * Math.PI / 4 + hash(f, k) * .5;
    for (let s = 1; s <= 7; s++) {
      const t = s / 7, reach = t * 2.1;
      const fz = pz + .55 * Math.sin(t * 2.2) - t * t * 1.15;
      captureLeaf(px + Math.cos(a) * reach, py + Math.sin(a) * reach, fz, .2 + .09 * (1 - t), t > .55 ? FROND_LIGHT : FROND, k * 31 + f * 7 + s, .3, fz + 1.6);
    }
  }
  sphere(px, py, pz - .22, .15, [86, 62, 40], 'rough');
  sphere(px + .18, py - .1, pz - .28, .14, [92, 66, 42], 'rough');
  castShadow(px, py, pz, 1.25);
  for (let z = .5; z < pz; z += .8) castShadow(x + bx * (z / height) ** 2 * 1.7, y + by * (z / height) ** 2 * 1.7, z, .2);
}
function thicket(x: number, y: number, scale: number, k: number): void {
  if (!near(x, y)) return;
  for (let n = 0; n < 34; n++) {
    const a = hash(k, n) * 6.283, d = Math.sqrt(hash(k + 3, n)) * 1.15 * scale, h = hash(k + 5, n);
    const shade: Color = h > .72 ? [66, 108, 60] : h > .3 ? [44, 82, 54] : [30, 58, 46];
    sphere(x + Math.cos(a) * d, y + Math.sin(a) * d, (.35 + h * 1.25) * scale, (.36 + hash(k + 7, n) * .26) * scale, shade, 'rough');
  }
  castShadow(x, y, .9 * scale, 1.3 * scale);
}
function rocks(x: number, y: number, scale: number, k: number): void {
  if (!near(x, y)) return;
  for (let n = 0; n < 4; n++) {
    const r = (.28 + hash(k, n) * .3) * scale;
    sphere(x + (hash(k, n + 9) - .5) * .9 * scale, y + (hash(k, n + 4) - .5) * .9 * scale, r * .7, r, [STONE[0] + n * 6, STONE[1] + n * 6, STONE[2] + n * 6], 'rough');
  }
  castShadow(x, y, .4 * scale, .75 * scale);
}
function crown(x: number, y: number, scale: number): void {
  castShadow(x, y, 3.4 * scale, 1.5 * scale);
  castShadow(x, y, 2.2 * scale, .8 * scale);
}
function tree(variety: number, ux: number, uy: number, side: number, k: number): void {
  // the wall trees are placed on the tile's own axes read as the world's x and y (as the first version did): the tile's centre is added
  const x = ux + xOf(0, 0), y = uy + yOf(0, 0);
  if (!near(x, y)) return;
  const low = side > 0;                          // the south wall stands between the pirate and the camera: kept low
  if (variety === 0) { growTree(x, y, low ? .58 : .95, low ? 48 : 90, k); crown(x, y, low ? .58 : .95); }
  else if (variety === 1) palm(x, y, low ? 3 : 4.8, hash(k, 1) * 6.283, k);
  else thicket(x, y, low ? .7 : 1.2, k);
}
function wallTrees(t: Tile, minU: number, maxU: number): void {
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const c = SLOTS[k], gap = (side < 0 ? t.north : t.south) === k;
      const variety = (side < 0 ? t.top : t.bottom)[k];
      const seed = t.seed * 7 + k * 13 + (side < 0 ? 0 : 5);
      for (const o of [-1.8, 1.8]) {
        const u = c + o + (hash(seed, o) - .5) * .7;
        if (u < minU || u > maxU || (gap && Math.abs(o) < GAP + .6)) continue;
        tree(variety, u, side * (WALL + (side > 0 ? 2.5 : 1.6) + hash(seed, 3) * .7), side, seed + o * 3);
      }
      if (!gap) tree((variety + 1) % 3, c + (hash(seed, 9) - .5) * 1.4, side * (WALL + (side > 0 ? 5 : 4.2) + hash(seed, 4) * .6), side, seed + 17);
      if (!gap) tree(1 + (k + (side < 0 ? 0 : 1)) % 2, c + (hash(seed, 12) - .5) * 2.4, side * (WALL + 7.6 + hash(seed, 6) * .8), side, seed + 29);
    }
  }
}
function signpost(u: number, v: number): void {
  const x = xOf(u, v), y = yOf(u, v);
  if (!near(x, y)) return;
  box(x - .07, y - .07, 0, x + .07, y + .07, 1.7, WOOD_DARK);
  box(x - .5, y - .06, 1.15, x + .5, y + .06, 1.62, WOOD);
  box(x - .32, y - .07, .75, x + .46, y + .07, 1.08, WOOD);
  castShadow(x, y, 1.5, .5);
}
function flowers(t: Tile): void {
  for (let n = 0; n < 26; n++) {
    const u = (hash(t.seed, n) - .5) * 24, v = (hash(t.seed + 1, n) > .5 ? 1 : -1) * (WALL + .5 + hash(t.seed + 2, n) * 2.2);
    sphere(xOf(u, v), yOf(u, v), .22, .1, n % 3 === 0 ? [236, 224, 190] : [218, 78, 64], 'solid');
    capsule(at(u, v, 0), at(u, v, .2), .03, .03, (): Color => [60, 100, 56], 'solid');
  }
}

/* ---------- cached models: baked once, drawn at any place ---------- */
// A pirate longboat pulled up on the sand: tarred hull, red gunwale, a curled prow, oars, a barrel, and a mast with its black flag.
function cacheRowboat(): void {
  const tar: Color = [58, 42, 40], rim: Color = [186, 62, 48], inside: Color = [124, 88, 58], plank: Color = [160, 116, 68];
  beginModel();
  capsule(at(-2.1, 0, .5), at(2.1, 0, .5), .6, .54, (): Color => tar, 'solid');
  capsule(at(-1.8, 0, .84), at(1.8, 0, .84), .44, .4, (): Color => inside, 'solid');
  for (const side of [-1, 1]) capsule(at(-1.95, side * .52, 1.12), at(1.95, side * .52, 1.12), .1, .1, (): Color => rim, 'solid');
  capsule(at(2.0, 0, .5), at(2.55, 0, 1.2), .24, .1, (): Color => tar, 'solid');
  sphere(xOf(2.6, 0), yOf(2.6, 0), 1.28, .12, rim, 'solid');
  capsule(at(-2.1, 0, .5), at(-2.35, 0, 1.0), .22, .1, (): Color => tar, 'solid');
  for (const u of [-.6, .6]) capsule(at(u, -.46, .92), at(u, .46, .92), .07, .07, (): Color => plank, 'solid');
  for (const side of [-1, 1]) {
    capsule(at(-.2, side * .5, 1), at(-.7, side * 1.9, .6), .04, .04, (): Color => plank, 'solid');
    sphere(xOf(-.75, side * 2), yOf(-.75, side * 2), .55, .16, plank, 'solid');
  }
  capsule(at(-1.2, .15, .62), at(-1.2, .15, 1.4), .32, .3, (): Color => [128, 84, 48], 'solid');
  for (const z of [.82, 1.2]) capsule(at(-1.2, .15, z), at(-1.2, .15, z + .05), .335, .335, (): Color => [58, 54, 56], 'solid');
  capsule(at(.9, 0, .9), at(.9, 0, 3.4), .06, .045, (): Color => plank, 'solid');
  for (let col = 0; col < 7; col++) for (let row = 0; row < 4; row++) {
    sphere(xOf(1.0 + col * .13, 0), yOf(1.0 + col * .13, 0), 2.45 + row * .2 - col * .012, .12, [30, 30, 38], 'solid');
  }
  sphere(xOf(1.52, 0), yOf(1.52, 0), 2.95, .1, [238, 234, 222], 'solid');             // the skull
  sphere(xOf(1.34, 0), yOf(1.34, 0), 2.6, .06, [238, 234, 222], 'solid');             // and the crossed bones
  sphere(xOf(1.7, 0), yOf(1.7, 0), 2.6, .06, [238, 234, 222], 'solid');
  rowboat = captureModel();
}
function cacheChests(): void {
  const body = (): void => {
    capsule(at(-1, 0, .62), at(1, 0, .62), .62, .62, (): Color => CHEST, 'solid');
    capsule(at(-.98, 0, .78), at(.98, 0, .78), .68, .68, (): Color => [74, 62, 54], 'solid');
    for (const u of [-.55, .55]) capsule(at(u, -.62, .3), at(u, .62, .3), .09, .09, (): Color => [58, 52, 48], 'solid');
    sphere(xOf(0, .66), yOf(0, .66), .8, .1, [226, 196, 96], 'gloss');
  };
  beginModel(); body();
  capsule(at(-1.05, -.2, 1.35), at(1.05, -.2, 1.35), .28, .28, (): Color => CHEST, 'solid');   // the lid, open behind
  chestEmpty = captureModel();
  beginModel(); body();
  capsule(at(-1.05, -.2, 1.45), at(1.05, -.2, 1.45), .28, .28, (): Color => CHEST, 'solid');
  for (let n = 0; n < 34; n++) {
    const u = (hash(n, 2) - .5) * 1.9, v = (hash(n, 5) - .5) * 1;
    sphere(xOf(u, v), yOf(u, v), .95 + hash(n, 8) * .24, .19, n % 4 === 0 ? [244, 220, 124] : GOLD, 'gloss');
  }
  for (let n = 0; n < 9; n++) sphere(xOf(-1.2 + n * .3, .95), yOf(-1.2 + n * .3, .95), .14, .15, n % 2 ? GOLD : [244, 220, 124], 'gloss');
  chestGold = captureModel();
}

/** The models that are baked once, before the first scene: the longboat and the two chests. Run it with the frame's own buffers and no scrolling. */
export function initModels(): void { rowboat = null; chestEmpty = null; chestGold = null; cacheRowboat(); cacheChests(); }

const WHITE = rgb(255, 255, 255);
/** The pixel bounds of a tile's footprint in the world, as [x0, y0, x1, y1] (layer pixels). */
function bounds(t: Tile): number[] {
  setOrigin(t.u0, t.v0);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const c of [[-FOOT_W, -FOOT_H], [FOOT_W, -FOOT_H], [-FOOT_W, FOOT_H], [FOOT_W, FOOT_H]]) {
    const p = project(xOf(c[0], c[1]), yOf(c[0], c[1]), 0), wx = p.sx + PX, wy = p.sy + PY;
    x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); y0 = Math.min(y0, wy); y1 = Math.max(y1, wy);
  }
  setOrigin(0, 0);
  return [x0, y0, x1, y1];
}
const REACH = 130;   // what a tile's objects (crowns, shadows) add around its footprint, in pixels

/** The jungle, the beach and the treasure island as one endless picture: every tile of the world painted where it stands. */
export class PirateWorld implements ScrollPainter {
  steps(): number { return 3; }
  paint(k: number, x0: number, y0: number, x1: number, y1: number): void {
    if (k === 0) { pix.fill(WHITE); this.ground(x0, y0, x1, y1); growGrass(); return; }
    for (const t of world) {                                        // placement order: the same in every window
      const b = bounds(t);
      if (b[2] + REACH < x0 || b[0] - REACH > x1 || b[3] + REACH < y0 || b[1] - REACH > y1) continue;
      setOrigin(t.u0, t.v0); GU = t.u0; GV = t.v0;
      if (k === 1) this.walls(t); else this.extras(t);
      setOrigin(0, 0);
    }
  }
  private ground(x0: number, y0: number, x1: number, y1: number): void {
    for (const t of world) {
      const b = bounds(t);
      const ax = Math.max(x0, Math.floor(b[0])), ay = Math.max(y0, Math.floor(b[1])), bx = Math.min(x1, Math.ceil(b[2]) + 1), by = Math.min(y1, Math.ceil(b[3]) + 1);
      GU = t.u0; GV = t.v0;
      for (let wy = ay; wy < by; wy++) for (let wx = ax; wx < bx; wx++) {
        const p = unproject(wx - PX + .5, wy - PY + .5), gu = (p.x - p.y) / R2, gv = (p.x + p.y) / R2, u = gu - t.u0, v = gv - t.v0;
        if (u < -FOOT_W || u >= FOOT_W || v < -FOOT_H || v >= FOOT_H) continue;
        const i = (wy - y0) * W + (wx - x0);
        pix[i] = t.kind === KIND_BEACH ? beachGround(u, v, wx, wy, i) : t.kind === KIND_TREASURE ? treasureGround(u, v, wx, wy, i) : jungleGround(t, u, v, wx, wy, i);
        ground[i] = 1; zb[i] = gv * COS;
      }
    }
    copyInto(groundZ, zb);
  }
  private walls(t: Tile): void { if (t.kind === KIND_JUNGLE) wallTrees(t, -14, 14); }
  private extras(t: Tile): void {
    if (t.kind === KIND_BEACH) {
      palm(xOf(6.4, -5.6), yOf(6.4, -5.6), 5.4, 2.4, 1);
      palm(xOf(-1.6, -6.2), yOf(-1.6, -6.2), 4.6, 5.2, 2);
      palm(xOf(11.2, 5.4), yOf(11.2, 5.4), 3.6, 3.8, 3);
      thicket(xOf(10.6, -5.4), yOf(10.6, -5.4), 1.2, 4);
      thicket(xOf(12.8, -3.9), yOf(12.8, -3.9), 1.1, 5);
      thicket(xOf(8.4, 6.3), yOf(8.4, 6.3), .8, 6);
      rocks(xOf(-3, -5.1), yOf(-3, -5.1), 1.2, 7);
      rocks(xOf(1.2, 5.6), yOf(1.2, 5.6), 1, 8);
    } else if (t.kind === KIND_TREASURE) {
      wallTrees(t, -14, 14);
      palm(xOf(-9, -4.6), yOf(-9, -4.6), 5, 1.2, 21);
      // a stone that looks back at you, near the red cross
      const sx = xOf(6.6, -1.8), sy = yOf(6.6, -1.8);
      if (near(sx, sy)) {
        sphere(sx, sy, 1.55, 1.7, [170, 168, 160], 'rough');
        sphere(sx + 1.1, sy + 1.1, 1.15, .62, [60, 60, 66], 'solid');
        sphere(sx + 1.5, sy - .3, 1.65, .4, [58, 58, 64], 'solid');
        sphere(sx - .3, sy + 1.5, 1.65, .4, [58, 58, 64], 'solid');
        castShadow(sx, sy, 1.5, 2);
      }
      rocks(xOf(2.4, -5.4), yOf(2.4, -5.4), .8, 31);
    } else {
      flowers(t);
      if (t.sign === 0) signpost(SLOTS[t.north] + 2, -(WALL + .5));
      if (t.sign === 1) signpost(11.4, -2.3);
      if (t.sign === 2) signpost(SLOTS[t.south] - 2, WALL + .6);
      if (t.sign === 3) signpost(-11.8, -2.3);
      for (let n = 0; n < 6; n++) rocks(xOf((hash(t.seed, n) - .5) * 24, (n % 2 ? 1 : -1) * (WALL + .3)), yOf((hash(t.seed, n) - .5) * 24, (n % 2 ? 1 : -1) * (WALL + .3)), .5, n + t.seed);
    }
  }
}

/** Whether a tile's footprint (and what stands around it) touches the window at (camX, camY). */
export function tileVisible(t: Tile, camX: number, camY: number, w: number, h: number): boolean {
  const b = bounds(t);
  return !(b[2] + 60 < camX || b[0] - 60 > camX + w || b[3] + 60 < camY || b[1] - 60 > camY + h);
}

/** The pixel bounds of a tile's footprint in the layer: [x0, y0, x1, y1]. */
export function tileBounds(t: Tile): number[] { return bounds(t); }
