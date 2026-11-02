import { createImage, updatePixels, drawImageRect } from 'zinc:gfx';
import { world } from '../world/world';
import { TERRAIN_WATER, TERRAIN_VOID, TILE } from '../constants';
import { WATER_TONES, SAND_TONES, ROAD_COLOR, STONE } from '../palettes';
import { groundTone, tileMonth, snowShare, monthStep, flowerShare, reedColor } from '../view/seasons';
import { hash as thash } from '../world/noise';
import { noise, hash, rampOf, bayerAt, rgb, GRASS } from '../pixel';
import { groundAt, groundKind } from '../view/scenery';
import { HW, HH, PXH, cam, view, stats, heightIJ, cornersOf, corner } from './geom';
import { shade } from './atlas';

// The ground of the map is cut into square regions of the map picture (iso pixels at zoom 1: x = (i - j) * 32, y = (i + j) * 16 - level * 9.8), each baked once into
// an opaque image and drawn as one quad. It is painted pixel by pixel the way the old view paints its ground (view/scenery.ts): tones of the biome picked by noise and
// dithered with the Bayer pattern of the Pixel Plays renderer, in art pixels of 2 x 2 map pixels (sand, foam and pebbles at the water, dirt roads with their ramps, rock
// and snow dithered in on the mountains), and slopes and cliff walls lit by the same light through the same colour ramps. A region is rebuilt only when a tile it shows
// changed (a signature of its tiles, checked a few regions a frame) or the month moved on. Regions do not overlap, so the draw order does not matter.
// Four levels of detail: the region image has 512 px whatever the level, so a far level covers more map and costs the same to bake and draw. The far levels are flat tiles.
const SIZE = 512, MARGIN = 1, TEX = SIZE + 2 * MARGIN;
const ART = 64 / (2 * Math.SQRT2 * 10);                     // map pixels of an art pixel of the old view (28.28 across a tile there, 64 here)
export const LOD_B: number[] = [2 / ART, 1 / ART, .5, .25];   // bake scale of each level: texture pixels per map pixel; the near levels are one texture pixel an art pixel (of the old view's S = 20 and 10)
const BG = 0xff171a15;
const MAX_REGIONS = 56;

/** A square of the map picture. `img` is what is drawn; a rebuild of a region that is shown goes into `back` and swaps in when done (no torn picture).
 *  `s` is the next tile diagonal to paint (-1: not under way): a region is baked a few diagonals a frame, into `buf` (its pixels, until it is complete). */
class Region {
  id: number = -1; img: number = -1; back: number = -1; rx: number = 0; ry: number = 0; lod: number = 1; sig: number = 0; acc: number = 0; month: number = -1; rev: number = -1; used: number = 0;
  ready: boolean = false; started: boolean = false; stale: boolean = false; s: number = -1; sMax: number = 0; ring: boolean = false; buf: u32[] = [];
}
const regions: Region[] = [];
const index = new Map<number, Region>();
const free: number[] = [];
const bufs: u32[][] = [];
let frameNo = 0;
const pending: Region[] = [];

function key(rx: number, ry: number, lod: number): number { return ((ry + 512) * 1024 + (rx + 512)) * 4 + lod; }
function span(lod: number): number { return SIZE / LOD_B[lod]; }

// ---- tile colours ----
function mixc(a: number[], b: number[], k: number): number[] { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
const SNOW = [236, 240, 244], ROCK_LOW = [122, 112, 98], ROCK_HIGH = [150, 148, 144], DIRT = [154, 130, 92];
const ROAD_RAMP = rampOf(ROAD_COLOR), DECK = rampOf([150, 112, 72]), RAIL = rampOf([92, 62, 38]);
const clampi = (v: number, a: number, b: number): number => v < a ? a : v > b ? b : v;
/** The flat colour of a tile (the far levels): the biome's tone, rock and snow by height, lit by the slope. */
function groundColor(t: number, lightSlope: number, avgLevel: number): number {
  const biome = world.biome[t], mm = tileMonth(biome, t, monthStep());
  let c: number[];
  if (biome === 7) c = SAND_TONES[(thash(t, 3) * 3) | 0];
  else { const q = thash(t, 5); c = groundTone(biome, mm, q < .3 ? 1 : q < .75 ? 2 : q < .92 ? 3 : 0); }
  if (avgLevel >= 6.5) c = mixc(c, avgLevel >= 12 ? SNOW : avgLevel >= 9 ? ROCK_HIGH : ROCK_LOW, Math.min(1, (avgLevel - 6.5) / 2.5));
  else if (avgLevel >= 3) c = mixc(c, ROCK_LOW, (avgLevel - 3) / 14);
  if (snowShare(biome, mm) * .6 > thash(t, 31)) c = mixc(c, SNOW, .5);
  return rgbOf(shade(c, lightSlope * 1.12));
}
function rgbOf(c: number): u32 { return rgb((c >> 16) & 255, (c >> 8) & 255, c & 255); }

// ---- the pixel shader of a tile ----
// State of the tile being painted (set by drawTile), read per pixel by groundPixel.
let ti = 0, tj = 0, tt = 0, tAvg = 0, tLight = 1, tWater = false, tBiome = 0, tMonth = 0, tSnow = 0, tBloom = false;
const wn = [false, false, false, false];        // water at the neighbours i - 1, i + 1, j - 1, j + 1
const rn = [false, false, false, false];        // a road or building there
let tRoad = false, tPlinth = false, tBridge = false, tDeco = 0;
let tRockF = 0, tSnowF = 0;
function waterAt(i: number, j: number): boolean { return i >= 0 && j >= 0 && i < world.size && j < world.size && world.terrain[j * world.size + i] === TERRAIN_WATER; }
function roadAt(i: number, j: number): boolean { if (i < 0 || j < 0 || i >= world.size || j >= world.size) return false; const t = j * world.size + i; return world.road[t] !== 0 || world.build[t] >= 0; }
function side(u: number, v: number, k: number): number { return k === 0 ? u : k === 1 ? 1 - u : k === 2 ? v : 1 - v; }
function nearest(u: number, v: number, flags: boolean[], want: boolean): number { let d = 9; for (let k = 0; k < 4; k++) if (flags[k] === want) d = Math.min(d, side(u, v, k)); return d; }

function roadPixel(u: number, v: number, px: number, py: number, cx: number, cy: number, bay: number): number {
  const h = hash(cx, cy);
  if (tBridge) {                                                                       // planks across the water with a rail on each side
    const alongX = rn[0] || rn[1], a = alongX ? u : v, b = Math.abs((alongX ? v : u) - .5);
    if (b > .31) return -1;
    if (b > .25) return RAIL[h > .8 ? 1 : 3];
    return DECK[(a * 6) % 1 < .1 ? 1 : clampi(Math.floor(2.4 + noise(px * 2.5, py * 2.5) * 1.6), 2, 4)];
  }
  const bulge = (rn[0] ? 1 : 0) + (rn[1] ? 1 : 0) + (rn[2] ? 1 : 0) + (rn[3] ? 1 : 0) >= 3 ? .07 : 0;
  let dist = Math.hypot(u - .5, v - .5) - .04 - bulge;
  for (let k = 0; k < 4; k++) {
    if (!rn[k]) continue;
    const ex = k === 0 ? 1 : k === 1 ? 0 : .5, ey = k === 2 ? 1 : k === 3 ? 0 : .5, dx = ex - .5, dy = ey - .5;
    const w = clampi(((u - .5) * dx + (v - .5) * dy) / (dx * dx + dy * dy), 0, 1);
    dist = Math.min(dist, Math.hypot(u - (.5 + dx * w), v - (.5 + dy * w)));
  }
  if (dist > .27 + (noise(px * 3, py * 3) - .5) * .1) return -1;
  const lit = Math.round((tLight - 1) * 6);
  const idx = h > .94 ? 4 : dist > .22 ? 1 : clampi(Math.floor(2.2 + noise(px * 2.2, py * 2.2) * 1.8 + (h - .5) * .6), 1, 4);
  return ROAD_RAMP[clampi(idx + lit, 0, 4)];
}
/** One art pixel of the ground of the tile: u, v in 0..1 across it, (cx, cy) its place in the grid of art pixels of the map. The colour is the old view's own painting of that
 *  point (view/scenery.ts groundAt: biome tones, ponds, rivers, shore, ice, trails, snow), then roads, the mountain's rock, slope light and the wind's tufts. */
function groundPixel(u: number, v: number, cx: number, cy: number): number {
  const half = world.half, px = (ti + u) * TILE - half, py = (tj + v) * TILE - half, bay = bayerAt(cx, cy);
  if (tRoad) { const r = roadPixel(u, v, px, py, cx, cy, bay); if (r !== -1) return r; }
  if (tPlinth && u > .08 && u < .92 && v > .08 && v < .92) return rampOf(ROAD_COLOR)[clampi(Math.floor(1.8 + hash(cx, cy) * 1.2 + (tLight - 1) * 6), 1, 3)];
  let c = groundAt(px, py, cx, cy, monthStep());
  const kind = groundKind;
  if (tWater || (kind & 7) === 2) return c;                                           // water keeps the old view's tones (ice included)
  let rgbv: number[] = [c & 255, (c >> 8) & 255, (c >> 16) & 255];
  if (tRockF > 0 && bay < tRockF) {                                                   // the mountain: rock dithered into the turf, snow on the heights
    const hi = tAvg >= 9;
    rgbv = mixc(hi ? ROCK_HIGH : ROCK_LOW, hi ? ROCK_LOW : ROCK_HIGH, noise(px * 1.3, py * 1.3)); c = 0;
  }
  if (tSnowF > 0 && bay + (hash(cx, cy) - .5) * .4 < tSnowF) { rgbv = SNOW; c = 0; }
  if ((c === 0 || Math.abs(tLight - 1) > .02) && (kind & 7) !== 1) {                // slopes lit by the same ramps (a flat pixel keeps the old colour exactly)
    const idx = clampi(Math.floor(3.5 + (tLight - 1) * 8 + (bay - .5) * .7), 0, 4);
    return rampOf(rgbv)[idx];
  }
  if (c === 0) c = rgb(rgbv[0], rgbv[1], rgbv[2]);
  if (tDeco === 3 && hash(cx * 3, cy * 5) < .12) return rampOf(rgbv)[4];              // reeds
  if (tBloom && hash(cx, cy * 7) < .05) return hash(cx, cy) < .5 ? rgb(250, 246, 226) : rgb(240, 200, 84);       // flowers
  // the wind's tufts (still): a blade of 1 to 3 pixels rises from a grass pixel 14% of the time, over the pixels above it
  for (let k = 1; k <= 3; k++) {
    if (hash(cx * 3, (cy + k) * 5) > .14) continue;
    if (1 + ((hash(cx, (cy + k) * 2) * 3) | 0) < k) continue;
    const g = GRASS[clampi(Math.round(noise(cx * .09, (cy + k) * .18) * 2.2) + k, 1, 4)];
    return rgb(g[0], g[1], g[2]);
  }
  return c;
}
/** A cliff wall: rock in strata, the face toward the light a step lighter than the other. */
function wallPixel(face: number, cx: number, cy: number): number {
  const base = tAvg >= 9 ? ROCK_HIGH : tAvg >= 5 ? ROCK_LOW : [132, 104, 76], ramp = rampOf(base), bay = bayerAt(cx, cy);
  const strata = hash(0, cy >> 1) > .72 ? 1 : 0;
  return ramp[clampi(Math.floor((face === 0 ? 1.6 : 2.3) + strata * .8 + (bay - .5) * .9 + (hash(cx, cy) - .5) * .5), 0, 4)];
}

// ---- the triangle filler ----
let ox = 0, oy = 0, bs = 1, buf: u32[] = [];
let mode = 0, flat = 0, wallFace = 0;
const EPS = .04;
/** Fills a triangle given in map pixels. Mode 0: the ground pixel shader with (u, v) at the corners; 1: a flat colour; 2: a cliff wall. */
function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, u0: number, v0: number, u1: number, v1: number, u2: number, v2: number): void {
  const ax = (x0 - ox) * bs + MARGIN, ay = (y0 - oy) * bs + MARGIN, bx = (x1 - ox) * bs + MARGIN, by = (y1 - oy) * bs + MARGIN, qx = (x2 - ox) * bs + MARGIN, qy = (y2 - oy) * bs + MARGIN;
  const det = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy);
  if (Math.abs(det) < 1e-6) return;
  const xa = Math.max(0, Math.floor(Math.min(ax, bx, qx))), xb = Math.min(TEX - 1, Math.ceil(Math.max(ax, bx, qx)));
  const ya = Math.max(0, Math.floor(Math.min(ay, by, qy))), yb = Math.min(TEX - 1, Math.ceil(Math.max(ay, by, qy)));
  const inv = 1 / det, e = mode === 1 ? 0 : EPS;
  for (let y = ya; y <= yb; y++) {
    const py = y + .5;
    for (let x = xa; x <= xb; x++) {
      const pxx = x + .5;
      const w0 = ((by - qy) * (pxx - qx) + (qx - bx) * (py - qy)) * inv, w1 = ((qy - ay) * (pxx - qx) + (ax - qx) * (py - qy)) * inv, w2 = 1 - w0 - w1;
      if (w0 < -e || w1 < -e || w2 < -e) continue;
      if (mode === 1) { buf[y * TEX + x] = flat; continue; }
      const cx = Math.floor((ox + (x + .5 - MARGIN) / bs) * bs) + 0, cy = Math.floor((oy + (y + .5 - MARGIN) / bs) * bs);       // the art pixel: one texture pixel
      let c: number;
      if (mode === 2) c = wallPixel(wallFace, cx, cy);
      else c = groundPixel(clampi(w0 * u0 + w1 * u1 + w2 * u2, 0, 1), clampi(w0 * v0 + w1 * v1 + w2 * v2, 0, 1), cx, cy);
      buf[y * TEX + x] = c;
    }
  }
}
function flatTri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, color: number): void {
  const m = mode; mode = 1; flat = color;
  tri(x0, y0, x1, y1, x2, y2, 0, 0, 0, 0, 0, 0);
  mode = m;
}
function flatQuad(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color: number): void {
  flatTri(x0, y0, x1, y1, x2, y2, color); flatTri(x0, y0, x2, y2, x3, y3, color);
}
function flatBlob(x: number, y: number, rx: number, ry: number, color: number): void {
  for (let k = 0; k < 10; k++) { const a = k / 10 * 6.2832, b = (k + 1) / 10 * 6.2832; flatTri(x, y, x + Math.cos(a) * rx, y + Math.sin(a) * ry, x + Math.cos(b) * rx, y + Math.sin(b) * ry, color); }
}
/** A wall under the front edge of a tile: a quad of the cliff, painted by wallPixel. */
function wall(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, face: number): void {
  mode = 2; wallFace = face;
  tri(x0, y0, x1, y1, x2, y2, 0, 0, 0, 0, 0, 0); tri(x0, y0, x2, y2, x3, y3, 0, 0, 0, 0, 0, 0);
  mode = 0;
}

/** Far levels: the static things are painted into the ground (no sprites). */
function drawFar(t: number, avg: number, tdx: number, tsy: number): void {
  const cx = tdx, cy = tsy + HH - avg * PXH;
  if (world.rock[t] > 0) flatBlob(cx, cy - 4, 8, 6, 0xff7a8385);
  if (world.tree[t] > 0) { flatBlob(cx, cy - 12, 11, 12, 0xff345a2c); flatBlob(cx - 3, cy - 17, 6, 6, 0xff447c4a); }
  if (world.build[t] >= 0) {
    flatQuad(cx - 24, cy, cx, cy + 12, cx, cy - 8, cx - 24, cy - 20, rgbOf(shade(STONE, .78)));
    flatQuad(cx, cy + 12, cx + 24, cy, cx + 24, cy - 20, cx, cy - 8, rgbOf(shade(STONE, .9)));
    flatQuad(cx - 26, cy - 20, cx, cy - 8, cx + 26, cy - 20, cx, cy - 36, rgbOf(shade([176, 104, 76], 1)));
  }
}

/** Light on a slope: surfaces rising toward the back-left face the sun. */
function slopeLight(): number {
  const f = ((corner[0] - corner[2]) + (corner[3] - corner[1])) * .5;
  return Math.max(.72, Math.min(1.22, 1 + f * .1));
}
function drawTile(i: number, j: number, s: number, d: number, far: boolean): void {
  const n = world.size, t = j * n + i;
  if (world.terrain[t] === TERRAIN_VOID) return;
  cornersOf(i, j);
  const tdx = d * HW, tsy = s * HH;
  const water = world.terrain[t] === TERRAIN_WATER;
  const c0 = corner[0], c1 = corner[1], c2 = corner[2], c3 = corner[3], avg = (c0 + c1 + c2 + c3) / 4;
  const ex = tdx + HW, ey = tsy + HH - c1 * PXH, sx2 = tdx, wx = tdx - HW, wy = tsy + HH - c3 * PXH, bottom = tsy + 2 * HH;
  tt = t; tAvg = avg;
  if (!water || avg > 0) {                                                            // the cliff walls under the two front edges where a neighbour is lower
    if (i + 1 < n) {
      const e1 = c1, e2 = c2; cornersOf(i + 1, j); const a = corner[0], b = corner[3]; cornersOf(i, j);
      if (e1 > a + .01 || e2 > b + .01) {
        if (far) flatQuad(ex, ey, sx2, bottom - e2 * PXH, sx2, bottom - b * PXH, ex, tsy + HH - a * PXH, 0xff55607a);
        else wall(ex, ey, sx2, bottom - e2 * PXH, sx2, bottom - b * PXH, ex, tsy + HH - a * PXH, 0);
      }
    }
    if (j + 1 < n) {
      const e3 = c3, e2 = c2; cornersOf(i, j + 1); const a = corner[0], b = corner[1]; cornersOf(i, j);
      if (e3 > a + .01 || e2 > b + .01) {
        if (far) flatQuad(wx, wy, sx2, bottom - e2 * PXH, sx2, bottom - b * PXH, wx, tsy + HH - a * PXH, 0xff6a7a90);
        else wall(wx, wy, sx2, bottom - e2 * PXH, sx2, bottom - b * PXH, wx, tsy + HH - a * PXH, 1);
      }
    }
  }
  tLight = slopeLight();
  if (far) {
    const color = water ? rgbOf(shade(WATER_TONES[1 + ((thash(t, 4) * 2) | 0)], .9 + thash(t, 6) * .16)) : groundColor(t, tLight, avg);
    flatQuad(tdx, tsy - c0 * PXH, tdx + HW, tsy + HH - c1 * PXH, tdx, tsy + 2 * HH - c2 * PXH, tdx - HW, tsy + HH - c3 * PXH, color);
    if (!water && world.road[t] !== 0) flatQuad(tdx, tsy - c0 * PXH + 5, tdx + 18, tsy + HH - c1 * PXH, tdx, tsy + 2 * HH - c2 * PXH - 5, tdx - 18, tsy + HH - c3 * PXH, rgbOf(shade(ROAD_COLOR, .86)));
    drawFar(t, avg, tdx, tsy);
    return;
  }
  ti = i; tj = j; tWater = water; tBiome = world.biome[t]; tMonth = tileMonth(tBiome, t, monthStep()); tSnow = snowShare(tBiome, tMonth);
  tRoad = world.road[t] !== 0; tBridge = tRoad && water; tPlinth = world.build[t] >= 0 || t === world.gate; tDeco = world.deco[t];
  tBloom = (tDeco === 1 || tDeco === 2) && flowerShare(tBiome, monthStep()) > thash(t, 9);
  tRockF = avg >= 3.5 ? Math.min(1, (avg - 3.5) / 4) : 0; tSnowF = avg >= 10 ? Math.min(1, (avg - 10) / 3) : 0;
  wn[0] = waterAt(i - 1, j); wn[1] = waterAt(i + 1, j); wn[2] = waterAt(i, j - 1); wn[3] = waterAt(i, j + 1);
  rn[0] = roadAt(i + 1, j); rn[1] = roadAt(i - 1, j); rn[2] = roadAt(i, j + 1); rn[3] = roadAt(i, j - 1);
  const p0x = tdx, p0y = tsy - c0 * PXH, p1x = tdx + HW, p1y = tsy + HH - c1 * PXH, p2x = tdx, p2y = tsy + 2 * HH - c2 * PXH, p3x = tdx - HW, p3y = tsy + HH - c3 * PXH;
  mode = 0;
  tri(p0x, p0y, p1x, p1y, p2x, p2y, 0, 0, 1, 0, 1, 1);
  tri(p0x, p0y, p2x, p2y, p3x, p3y, 0, 0, 1, 1, 0, 1);
}

function signature(i: number, j: number): number {
  const n = world.size, t = j * n + i;
  let h = world.terrain[t] * 3 + world.tree[t] * 7 + world.rock[t] * 13 + world.road[t] * 17 + (world.build[t] + 2) * 23 + world.deco[t] * 29 + heightIJ(i, j) * 31;
  const b = world.build[t];
  if (b >= 0 && b < world.buildings.length) h += world.buildings[b].type * 37 + world.buildings[b].level * 41;
  return h;
}


/** Paints diagonals of a region until the deadline (at least one); true when it is complete. */
function bake(r: Region, deadline: number): boolean {
  const n = world.size, sp = span(r.lod), far = r.lod >= 2;
  const t0 = performance.now();
  ox = r.rx * sp - MARGIN / LOD_B[r.lod]; oy = r.ry * sp - MARGIN / LOD_B[r.lod]; bs = LOD_B[r.lod];
  const dMin = Math.floor((ox - HW) / HW), dMax = Math.ceil((ox + TEX / bs + HW) / HW);
  const first = r.s < 0;
  if (first) {
    const hl = stats.hmax * PXH;
    r.s = Math.max(0, Math.ceil((oy - 2 * HH - 20) / HH) - 1); r.sMax = Math.min(2 * n - 2, Math.floor((oy + TEX / bs + hl + 40) / HH)); r.acc = 0;
    if (r.ready) { if (r.back < 0) r.back = free.length > 0 ? (free.pop() as number) : createImage(TEX, TEX); }
    else if (r.img < 0) r.img = free.length > 0 ? (free.pop() as number) : createImage(TEX, TEX);
    r.buf = bufs.length > 0 ? (bufs.pop() as u32[]) : Array.from({ length: TEX * TEX }, (): u32 => 0);
    r.buf.fill(BG);
  }
  buf = r.buf;
  let s = r.s, acc = r.acc;
  for (; s <= r.sMax; s++) {
    let d = dMin; if (((d + s) & 1) !== 0) d++;
    for (; d <= dMax; d += 2) {
      const i = (s + d) >> 1, j = (s - d) >> 1;
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      drawTile(i, j, s, d, far);
      acc = (Math.imul(acc, 31) + signature(i, j)) | 0;
    }
    if (performance.now() > deadline) { s++; break; }
  }
  r.s = s; r.acc = acc; r.started = true;
  const ms = performance.now() - t0;
  stats.bakeMs += ms; if (ms > stats.bakeMax) stats.bakeMax = ms;
  if (s <= r.sMax) return false;
  updatePixels(r.ready ? r.back : r.img, r.buf, true);
  bufs.push(r.buf); r.buf = [];
  if (r.ready) { const old = r.img; r.img = r.back; r.back = -1; free.push(old); }
  r.sig = acc; r.month = monthStep(); r.rev = world.revision; r.ready = true; r.stale = false; r.s = -1;
  stats.bakes++;
  return true;
}
function signatureOf(r: Region): number {
  const n = world.size, sp = span(r.lod);
  const ox2 = r.rx * sp, oy2 = r.ry * sp, hl = stats.hmax * PXH;
  const sMin = Math.max(0, Math.ceil((oy2 - 2 * HH - 20) / HH) - 1), sMax = Math.min(2 * n - 2, Math.floor((oy2 + sp + hl + 40) / HH));
  const dMin = Math.floor((ox2 - HW) / HW), dMax = Math.ceil((ox2 + sp + HW) / HW);
  let sig = 0;
  for (let s = sMin; s <= sMax; s++) {
    let d = dMin; if (((d + s) & 1) !== 0) d++;
    for (; d <= dMax; d += 2) {
      const i = (s + d) >> 1, j = (s - d) >> 1;
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      sig = (Math.imul(sig, 31) + signature(i, j)) | 0;
    }
  }
  return sig;
}

/** Forgets every region (a new village, a loaded one). */
export function resetGround(): void {
  for (const r of regions) { if (r.img >= 0) free.push(r.img); if (r.back >= 0) free.push(r.back); if (r.buf.length > 0) bufs.push(r.buf); }
  regions.length = 0; index.clear(); pending.length = 0;
}
/** Marks what the world changed: regions are compared (a few a frame, in drawGround) with the signature of their tiles. */
function lodFor(zoom: number, last: number): number {
  const t = [1.4, .7, .35];
  let l = 3;
  for (let k = 0; k < 3; k++) if (zoom > t[k]) { l = k; break; }
  if (last >= 0 && l !== last && Math.abs(zoom / t[Math.min(l, last)] - 1) < .1) return last;     // a little hysteresis so the level does not flap at a threshold
  return l;
}
let lastLod = -1;
export function currentLod(): number { return lastLod < 0 ? 1 : lastLod; }

let checkAt = 0;
function regionAt(rx: number, ry: number, lod: number, ring: boolean): Region {
  let r = index.get(key(rx, ry, lod));
  if (r === undefined) {
    r = new Region(); r.rx = rx; r.ry = ry; r.lod = lod; r.id = key(rx, ry, lod); r.ring = ring;
    if (regions.length >= MAX_REGIONS) evict();
    regions.push(r); index.set(r.id, r);
  }
  return r;
}
/** Draws the ground: regions of the preferred level in view, baked a few diagonals a frame (the budget, in ms), with older levels under them while some are missing. */
export function drawGround(budgetMs: number): void {
  frameNo++;
  const t0 = performance.now(), deadline = t0 + budgetMs;
  const lod = lodFor(cam.zoom, lastLod); lastLod = lod;
  const sp = span(lod), z = cam.zoom, xc = (cam.ci - cam.cj) * HW, yc = (cam.ci + cam.cj) * HH;
  const x0 = xc - view.w / 2 / z, x1 = xc + view.w / 2 / z, y0 = yc - view.h / 2 / z, y1 = yc + view.h / 2 / z;
  const rx0 = Math.floor(x0 / sp), rx1 = Math.floor(x1 / sp), ry0 = Math.floor(y0 / sp), ry1 = Math.floor(y1 / sp);
  const month = monthStep();
  let missing = 0;
  pending.length = 0;
  for (let ry = ry0; ry <= ry1; ry++) for (let rx = rx0; rx <= rx1; rx++) {
    const r = regionAt(rx, ry, lod, false);
    r.used = frameNo;
    if (!r.ready) { missing++; pending.push(r); }
    else if (r.stale || r.month !== month || r.s >= 0) pending.push(r);
  }
  // an older level under the new one while regions are missing (no hole when the zoom crosses a threshold)
  if (missing > 0) for (const r of regions) if (r.ready && r.lod !== lod && r.used >= frameNo - 90) drawRegion(r, true);
  pending.sort((a: Region, b: Region): number => (a.ready ? 1 : 0) - (b.ready ? 1 : 0) || dist(a, sp, xc, yc) - dist(b, sp, xc, yc));
  for (let k = 0; k < pending.length; k++) {
    if (k > 0 && performance.now() > deadline) break;
    bake(pending[k], deadline);
  }
  for (let ry = ry0; ry <= ry1; ry++) for (let rx = rx0; rx <= rx1; rx++) { const r = index.get(key(rx, ry, lod)); if (r !== undefined && r.started) { r.used = frameNo; drawRegion(r, false); } }
  // the ring of regions around the view is baked in what is left of the frame, so panning finds them ready
  if (pending.length === 0 || performance.now() < deadline) {
    let made = 0;
    for (let ry = ry0 - 1; ry <= ry1 + 1 && made < 2; ry++) for (let rx = rx0 - 1; rx <= rx1 + 1 && made < 2; rx++) {
      if (rx >= rx0 && rx <= rx1 && ry >= ry0 && ry <= ry1) continue;
      if (regions.length >= MAX_REGIONS - 4 && index.get(key(rx, ry, lod)) === undefined) continue;
      const r = regionAt(rx, ry, lod, true);
      r.used = frameNo;
      if (!r.ready && performance.now() < deadline) { bake(r, deadline); made++; }
    }
  }
  // signature checks of regions that exist: two a frame, only when the world revision moved
  if (regions.length > 0) {
    for (let k = 0; k < 2; k++) {
      checkAt = (checkAt + 1) % regions.length;
      const r = regions[checkAt];
      if (r.ready && r.s < 0 && r.rev !== world.revision) { r.rev = world.revision; if (signatureOf(r) !== r.sig) r.stale = true; }
    }
  }
}
function dist(r: Region, sp: number, xc: number, yc: number): number { const dx = (r.rx + .5) * sp - xc, dy = (r.ry + .5) * sp - yc; return dx * dx + dy * dy; }
function evict(): void {
  let worst = -1, age = 1e9;
  for (let k = 0; k < regions.length; k++) if (regions[k].used < age) { age = regions[k].used; worst = k; }
  if (worst < 0) return;
  const r = regions[worst];
  if (r.img >= 0) free.push(r.img);
  if (r.back >= 0) free.push(r.back);
  if (r.buf.length > 0) bufs.push(r.buf);
  index.delete(r.id); regions.splice(worst, 1);
}
function drawRegion(r: Region, under: boolean): void {
  const sp = span(r.lod), z = cam.zoom;
  const xc = (cam.ci - cam.cj) * HW, yc = (cam.ci + cam.cj) * HH;
  const x0 = Math.floor(view.x + view.w / 2 + (r.rx * sp - xc) * z), x1 = Math.floor(view.x + view.w / 2 + ((r.rx + 1) * sp - xc) * z);
  const y0 = Math.floor(view.y + view.h / 2 + (r.ry * sp - yc) * z), y1 = Math.floor(view.y + view.h / 2 + ((r.ry + 1) * sp - yc) * z);
  if (x1 < view.x || x0 > view.x + view.w || y1 < view.y || y0 > view.y + view.h) return;
  drawImageRect(r.img, MARGIN, MARGIN, SIZE, SIZE, x0, y0, x1 - x0, y1 - y0, 255, 4);
  stats.quads++;
}
