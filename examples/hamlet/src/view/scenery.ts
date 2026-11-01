import {
  W, H, R2, COS, SIN, pix, zb, ground, groundZ, kinds, bakedPix, bakedZ, shadowMask, staticShadow, KIND_GRASS,
  configureRenderer, resizeBuffer, setView, copyInto, project, unproject, rgb, rgbColor, rampOf, noise, hash, clamp, castShadow, bakeOcclusion, applyShadows, sphere, capsule, PX, PY, S, setClip, clearClip, setPixelOrigin, CX0, CY0, CX1, CY1,
} from '../pixel';
import { TILE, TERRAIN_VOID, TERRAIN_WATER } from '../constants';
import { WATER_TONES, SAND_TONES, ROAD_COLOR } from '../palettes';
import { DECO_TRAIL, DECO_REEDS } from '../gen/terrain';
import { ensureBiomes, monthStep, biomes, blend, groundTone, snowShare, flowerShare, reedColor, iceShare, tileMonth } from './seasons';
import { world, waterField, tileX, tileY, tileAt, tileCount, neighbor } from '../world/world';
import { models, modelOf, MODEL_GATE, MODEL_TREE, MODEL_ROCK, useModels, useTreeSeason, treeModel, warmTrees, resetModels, TREE_HEIGHT } from './models';
import { settings } from '../settings';
import { camera, ZOOM_SCALES, DEFAULT_ZOOM, artLevel, windowWidth, windowHeight, scaleOf, layerWidth, layerHeight, layerOriginX, layerOriginY, applyCamera, centerOn, centerPoint, panBy } from './camera';

const KIND_SAND = 1, KIND_WATER = 2, KIND_ROAD = 4;
const WHITE = rgb(44, 41, 35);          // outside the village: the dark stone of the interface (the dissolved border fades into it)

/**
 * The ground of the whole village at one zoom level, in layer pixels (the camera's window slides over it). A pixel is a colour and a kind (KIND_* | 8 for a tuft the wind
 * animates); its depth is a function of its row and its tile of its position, so neither is stored. The ground is painted per CHUNK, when the window first needs it (and
 * again when the season changed), never for the whole map: a 128 x 128 village is never painted whole.
 */
const CHUNK = 32;
class Layer {
  width: number; height: number; level: number; columns: number;
  pix: u32[][]; kind: number[][]; stamp: number[]; shore: number[]; lazy: boolean = true; rivers: boolean = false;
  /** The ground is kept by chunks of CHUNK x CHUNK pixels, each made when it is first painted or written: a layer of a big map is millions of pixels, the window reaches a few thousand chunks' worth. */
  constructor(level: number) {
    this.level = level; this.width = layerWidth(level); this.height = layerHeight(level);
    this.columns = Math.ceil(this.width / CHUNK);
    const chunks = this.columns * Math.ceil(this.height / CHUNK);
    this.pix = Array.from({ length: chunks }, (): u32[] => []); this.kind = Array.from({ length: chunks }, (): number[] => []);
    this.stamp = Array.from({ length: chunks }, (): number => -1);
    this.shore = [];
  }
}
/** Makes the arrays of chunk c (a chunk index) when it has none yet: empty ground (kind 0, white). */
function openChunk(layer: Layer, c: number): void {
  if (layer.kind[c].length > 0) return;
  layer.kind[c] = Array.from({ length: CHUNK * CHUNK }, (): number => 0); layer.pix[c] = Array.from({ length: CHUNK * CHUNK }, (): u32 => WHITE);
}
/** The kind (0: no ground) and colour of layer pixel (x, y), which must be inside the layer. */
function cellKind(layer: Layer, x: number, y: number): number { const k = layer.kind[(y >> 5) * layer.columns + (x >> 5)]; return k.length === 0 ? 0 : k[(y & 31) * CHUNK + (x & 31)]; }
function cellPix(layer: Layer, x: number, y: number): u32 { return layer.pix[(y >> 5) * layer.columns + (x >> 5)][(y & 31) * CHUNK + (x & 31)]; }
function setCell(layer: Layer, x: number, y: number, kind: number, color: u32): void {
  const c = (y >> 5) * layer.columns + (x >> 5), l = (y & 31) * CHUNK + (x & 31);
  openChunk(layer, c); layer.kind[c][l] = kind; layer.pix[c][l] = color;
}
/** The world point under the centre of layer pixel (ix, iy) of a level, and the ground's depth of its row. */
function layerPoint(level: number, ix: number, iy: number, out: number[]): void {
  const sc = scaleOf(level), u = (ix + .5 - layerOriginX(level)) / sc, v = (iy + .5 - layerOriginY(level)) / (sc * SIN);
  out[0] = (u + v) / R2; out[1] = (v - u) / R2; out[2] = v * COS;
}
const probe: number[] = [0, 0, 0];
/** The tile under a layer pixel (-1 beyond the map), as the baked ground has always had it. */
function layerTile(layer: Layer, ix: number, iy: number): number {
  layerPoint(layer.level, ix, iy, probe);
  const half = world.half;
  return tileAt(clamp(probe[0], -half + .01, half - .01), clamp(probe[1], -half + .01, half - .01));
}
const layers: (Layer | null)[] = ZOOM_SCALES.map((_s: number): Layer | null => null);
/** Pixels of grass that still show grass after the last rebake: the wind animates these. */
export const tufts: number[] = [];
let curSeason = 4;                       // the month (0 March .. 11 February) the ground, the trees and the flowers are painted in: seasons blend from month to month

/**
 * The detail modes when zooming in (settings.lod): 0 sharp (each level is painted at its own scale); 1 fixed (the normal-level art, enlarged). Zooming out never
 * resizes the art: it shows a wider window of the normal level, so the detail is kept.
 */
function isFixed(level: number): boolean { return level < DEFAULT_ZOOM && settings.lod === 1; }

/** The normal-level ground resized to another level's layer: pixels averaged (3 x 3 samples), the kind of the centre sample kept; a pixel the ground covers less than half stays empty. The whole base is painted first. */
function resizeLayer(base: Layer, level: number): Layer {
  paintAll(base);
  const layer = new Layer(level), f = scaleOf(level) / scaleOf(DEFAULT_ZOOM);
  layer.lazy = false;
  const bx = layerOriginX(DEFAULT_ZOOM), by = layerOriginY(DEFAULT_ZOOM), dx = layerOriginX(level), dy = layerOriginY(level);
  const smooth = settings.resample === 1, r = f < 1 ? .33 / f : 0;
  for (let y = 0; y < layer.height; y++) for (let x = 0; x < layer.width; x++) {
    const sx = bx + (x - dx) / f, sy = by + (y - dy) / f, cx = Math.round(sx), cy = Math.round(sy);
    if (cx < 0 || cy < 0 || cx >= base.width || cy >= base.height) continue;
    const kind = cellKind(base, cx, cy);
    if (kind === 0) continue;
    let r0 = 0, r1 = 0, r2 = 0, r3 = 0, n = 0;
    if (smooth && f < 1) {
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const px = Math.round(sx + a * r), py = Math.round(sy + b * r);
        if (px < 0 || py < 0 || px >= base.width || py >= base.height) continue;
        if (cellKind(base, px, py) === 0) continue;
        const col = cellPix(base, px, py);
        r0 += col & 255; r1 += (col >> 8) & 255; r2 += (col >> 16) & 255; r3 += (col >>> 24) & 255; n++;
      }
    }
    setCell(layer, x, y, kind, n < 5 ? cellPix(base, cx, cy) : (Math.round(r0 / n) | (Math.round(r1 / n) << 8) | (Math.round(r2 / n) << 16) | (Math.round(r3 / n) << 24)) >>> 0);
  }
  return layer;
}

/** Per tile: 1 a water tile that is not the pond (river, sea), 2 a land tile next to one of those, else 0. Made once per layer: the ground is painted per pixel. */
function shoreTiles(): number[] {
  const out: number[] = [], isRiver = (t: number): boolean => world.terrain[t] === TERRAIN_WATER && waterField(tileX(t), tileY(t)) >= 1;
  for (let t = 0; t < tileCount(); t++) {
    if (isRiver(t)) { out.push(1); continue; }
    let near = 0;
    for (let d = 0; d < 4 && near === 0; d++) { const v = neighbor(t, d); if (v >= 0 && isRiver(v)) near = 2; }
    out.push(near);
  }
  return out;
}
/** Rivers and the sea are tiles, not a blob: .9 inside them, 1.1 on their bank (within a third of a tile). The edge is wobbled so it follows no grid line. */
function tileWater(shore: number[], x: number, y: number): number {
  const half = world.half, wx = clamp(x + (noise(x * 1.1 + 9, y * 1.1) - .5) * .9, -half + .01, half - .01), wy = clamp(y + (noise(x * 1.1, y * 1.1 + 9) - .5) * .9, -half + .01, half - .01);
  const t = tileAt(wx, wy);
  if (t < 0 || shore[t] === 0) return 9;
  if (shore[t] === 1) return .9;
  for (let d = 0; d < 4; d++) {
    const v = neighbor(t, d);
    if (v >= 0 && shore[v] === 1 && Math.max(Math.abs(wx - tileX(v)), Math.abs(wy - tileY(v))) - TILE / 2 < TILE * .33) return 1.1;
  }
  return 9;
}

/** Is this water pixel frozen in the season? The edge first (a bank within a step), then the open water as the cold deepens. */
function frozen(layer: Layer, x: number, y: number, field: number, share: number): boolean {
  if (share <= 0) return false;
  if (!layer.rivers) return field > 1 - share * .55 + (noise(x * .6 + 4, y * .6) - .5) * .3 || noise(x * .5 + 7, y * .5) < share * .5;
  const near = tileWater(layer.shore, x + .9, y) >= 1 || tileWater(layer.shore, x - .9, y) >= 1 || tileWater(layer.shore, x, y + .9) >= 1 || tileWater(layer.shore, x, y - .9) >= 1;
  return near || field > 1 - share * .55 + (noise(x * .6 + 4, y * .6) - .5) * .3 || noise(x * .5 + 7, y * .5) < share * .5;
}
const DIRT: number[] = [154, 130, 92];
/** Paints chunk (cx, cy) of the layer for the season: grass of the biome's tints (dusted with snow in winter), sand, water or ice, game trails, with a dissolved border like the Pixel Plays dioramas. */
function paintChunk(layer: Layer, cx: number, cy: number, s: number, row0: number = 0, row1: number = CHUNK): void {
  const level = layer.level, half = world.half, p = probe, snow = biomes.snow, ice = biomes.iceTones, share = iceShare(s);
  const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = Math.min(layer.width, x0 + CHUNK), y1 = Math.min(layer.height, y0 + CHUNK);
  const c = cy * layer.columns + cx;
  openChunk(layer, c);
  const chunkKinds = layer.kind[c], chunkPix = layer.pix[c];
  for (let iy = y0 + row0; iy < Math.min(y1, y0 + row1); iy++) for (let ix = x0; ix < x1; ix++) {
    layerPoint(level, ix, iy, p);
    const px = p[0], py = p[1], i = (iy - y0) * CHUNK + (ix - x0);
    chunkKinds[i] = 0; chunkPix[i] = WHITE;
    const ax = Math.abs(px) / half, ay = Math.abs(py) / half;
    if (ax > .7 || ay > .7) {                                                                    // the dissolved border (nothing to test well inside)
      const rough = Math.sqrt(Math.sqrt(ax * ax * ax * ax + ay * ay * ay * ay)) + (noise(px, py) - .5) * .07;
      if (rough > 1.03 || rough > .95 && hash(ix, iy) < (rough - .95) / .08) continue;
    }
    const field = Math.min(world.pondR < .01 ? 9 : waterField(px, py), layer.rivers ? tileWater(layer.shore, px, py) : 9);
    let color: number[], kind: number;
    if (field < 1) {
      kind = KIND_WATER;
      color = frozen(layer, px, py, field, share) ? ice[clamp(Math.floor(noise(px * .5, py * .45) * 2.4 + hash(ix, iy) * .6), 0, ice.length - 1)] : WATER_TONES[clamp(Math.floor(.8 + noise(px * .4, py * .35) * 2.3 + hash(ix, iy) * .2), 0, 3)];
    }
    else if (field < 1.2) { kind = KIND_SAND; color = SAND_TONES[clamp(Math.floor(noise(px * .8, py * .8) * 3 + hash(ix, iy) * .4), 0, 2)]; }
    else {
      kind = KIND_GRASS;
      const bt = tileAt(clamp(px + (noise(px * .9 + 31, py * .9) - .5) * 1.6, -half + .01, half - .01), clamp(py + (noise(px * .9, py * .9 + 31) - .5) * 1.6, -half + .01, half - .01));
      const biome = bt < 0 ? 0 : world.biome[bt];
      const t = tileAt(clamp(px, -half + .01, half - .01), clamp(py, -half + .01, half - .01));
      const tm = tileMonth(biome, t < 0 ? 0 : t, s);                                          // high and shaded ground turns first in autumn and thaws last
      color = groundTone(biome, tm, clamp(Math.floor(noise(px * .6, py * .7) * 3.5), 0, 3));
      if (t >= 0 && world.deco[t] === DECO_TRAIL) {                                         // a game trail: bare earth, ragged at the edges
        const lx = (px - tileX(t)) / TILE, ly = (py - tileY(t)) / TILE;
        if (Math.sqrt(lx * lx + ly * ly) < .42 + (noise(px * 2.5, py * 2.5) - .5) * .4) color = blendTone(color, DIRT, .5 + hash(ix * 3, iy) * .25);
      }
      const sn = snowShare(biome, tm);
      if (sn > 0 && noise(px * .9, py * .9) * .55 + hash(ix * 7, iy * 13) * .45 < sn) { color = snow[clamp(Math.floor(noise(px * 1.4, py * 1.4) * snow.length + hash(ix, iy) * .5), 0, snow.length - 1)]; }
      else if (hash(ix * 3, iy * 5) < .14) kind |= 8;
    }
    chunkKinds[i] = kind; chunkPix[i] = rgbColor(color);
  }
  if (row1 >= CHUNK) layer.stamp[cy * layer.columns + cx] = s;           // a chunk painted a few rows at a time is not done until its last row
}
const blendTone = (a: number[], b: number[], k: number): number[] => blend(a, b, k);
/** Makes sure the layer pixels of a rectangle (layer coordinates, x1 and y1 excluded) are painted for the current season. */
function paintRect(layer: Layer, x0: number, y0: number, x1: number, y1: number): void {
  if (!layer.lazy) return;
  if (layer.shore.length === 0) { layer.shore = shoreTiles(); layer.rivers = layer.shore.some((v: number): boolean => v === 1); }
  const started = Date.now();
  for (let cy = Math.max(0, Math.floor(y0 / CHUNK)); cy <= Math.min(Math.floor((layer.height - 1) / CHUNK), Math.floor((y1 - 1) / CHUNK)); cy++) {
    for (let cx = Math.max(0, Math.floor(x0 / CHUNK)); cx <= Math.min(layer.columns - 1, Math.floor((x1 - 1) / CHUNK)); cx++) {
      if (layer.stamp[cy * layer.columns + cx] !== curSeason) { paintChunk(layer, cx, cy, curSeason); bakeStats.chunks++; }
    }
  }
  bakeStats.groundMs += Date.now() - started;
}
function paintAll(layer: Layer): void { paintRect(layer, 0, 0, layer.width, layer.height); }

/** A new, empty ground for a zoom level: painted chunk by chunk as the window reaches it. */
function bakeLayer(level: number): Layer {
  if (isFixed(level)) return resizeLayer(bakeLayer(DEFAULT_ZOOM), level);
  return new Layer(level);
}

/** Copies the ground under the camera's window into the renderer's buffers, for the pixels of a rectangle (x1, y1 excluded). */
function loadRect(layer: Layer, x0: number, y0: number, x1: number, y1: number): void {
  paintRect(layer, x0 + camera.x, y0 + camera.y, x1 + camera.x, y1 + camera.y);
  for (let wy = y0; wy < y1; wy++) {
    const by = wy + camera.y, depth = by >= 0 && by < layer.height ? (by + .5 - layerOriginY(layer.level)) / (scaleOf(layer.level) * SIN) * COS : -1e9;
    for (let wx = x0; wx < x1; wx++) {
      const i = wy * W + wx, bx = wx + camera.x;
      if (bx < 0 || by < 0 || bx >= layer.width || by >= layer.height) { pix[i] = WHITE; zb[i] = -1e9; kinds[i] = 0; ground[i] = 0; groundZ[i] = -1e9; continue; }
      const c = (by >> 5) * layer.columns + (bx >> 5), li = (by & 31) * CHUNK + (bx & 31), ck = layer.kind[c];
      if (ck.length === 0 || ck[li] === 0) { pix[i] = WHITE; zb[i] = -1e9; kinds[i] = 0; ground[i] = 0; groundZ[i] = -1e9; continue; }
      pix[i] = layer.pix[c][li]; zb[i] = depth; kinds[i] = ck[li] & 7; ground[i] = 1; groundZ[i] = depth;
    }
  }
}

/** Does the dirt of tile t reach towards direction d? Roads join roads and buildings; a building joins roads; the gate opens outwards. */
function linked(t: number, d: number): boolean {
  const v = neighbor(t, d);
  if (v < 0) return t === world.gate && d === 1;
  return world.build[t] >= 0 ? world.road[v] === 1 : world.road[v] === 1 || world.build[v] >= 0;
}
const SEGMENT_X: number[] = [1, 0, .5, .5], SEGMENT_Y: number[] = [.5, .5, 1, 0];

function paintDirt(t: number, layer: Layer): void {
  const x0 = tileX(t) - TILE / 2, y0 = tileY(t) - TILE / 2;
  const ramp = rampOf(ROAD_COLOR);
  const joins = [linked(t, 0), linked(t, 1), linked(t, 2), linked(t, 3)];
  const a = project(x0, y0, 0), b = project(x0 + TILE, y0, 0), c = project(x0, y0 + TILE, 0), d = project(x0 + TILE, y0 + TILE, 0);
  const left = Math.max(CX0, Math.floor(Math.min(a.sx, b.sx, c.sx, d.sx))), right = Math.min(CX1 - 1, Math.ceil(Math.max(a.sx, b.sx, c.sx, d.sx)));
  const top = Math.max(CY0, Math.floor(Math.min(a.sy, b.sy, c.sy, d.sy))), bottom = Math.min(CY1 - 1, Math.ceil(Math.max(a.sy, b.sy, c.sy, d.sy)));
  for (let iy = top; iy <= bottom; iy++) for (let ix = left; ix <= right; ix++) {
    const bx = ix + camera.x, by = iy + camera.y;
    if (bx < 0 || by < 0 || bx >= layer.width || by >= layer.height || layerTile(layer, bx, by) !== t) continue;
    const i = iy * W + ix, p = unproject(ix + .5, iy + .5);
    const lx = (p.x - x0) / TILE, ly = (p.y - y0) / TILE;
    let dist = Math.hypot(lx - .5, ly - .5) - .04;
    for (let k = 0; k < 4; k++) {
      if (!joins[k]) continue;
      const sx = SEGMENT_X[k], sy = SEGMENT_Y[k];
      const u = clamp(((lx - .5) * (sx - .5) + (ly - .5) * (sy - .5)) / ((sx - .5) * (sx - .5) + (sy - .5) * (sy - .5)), 0, 1);
      dist = Math.min(dist, Math.hypot(lx - (.5 + (sx - .5) * u), ly - (.5 + (sy - .5) * u)));
    }
    if (dist > .27 + (noise(p.x * 3, p.y * 3) - .5) * .1) continue;
    const edge = dist > .22;
    pix[i] = hash((ix + PX) * 5, (iy + PY) * 3) > .94 ? ramp[4] : edge ? ramp[1] : ramp[clamp(Math.floor(2.2 + noise(p.x * 2.2, p.y * 2.2) * 1.8 + (hash(ix + PX, iy + PY) - .5) * .6), 1, 4)];
    kinds[i] = KIND_ROAD;
  }
}

function treeShadow(x: number, y: number, height: number): void { for (let z = 1; z < height; z += .45) castShadow(x, y, z, .6); }

/** True when the world point is near enough to the window to be worth drawing. */
function onScreen(x: number, y: number, margin: number): boolean {
  const p = project(x, y, 0);
  return p.sx > -margin && p.sx < W + margin && p.sy > -margin - 60 && p.sy < H + margin;
}

// The static picture (dirt, trees, rocks, flowers, buildings with their shadows and occlusion) is kept for the window as `bakedPix` / `bakedZ`. It is made once
// for a camera and a village; after that only what changed is redone, never the whole window:
//   - the camera moved by a few pixels: the kept arrays slide with it and only the strips the move uncovered are baked (panning never rebakes the rest);
//   - a tile changed (a road, a building, a tree felled): only the rectangle around it, its neighbours' dirt included, is baked again.
// A rectangle is made from the ground up with the renderer clipped to it, with the patterns anchored on the layer (setPixelOrigin), so it is made of the very
// same pixels as a full bake at the same camera (tests/data/hamlet/chunks.ts proves it). `bakeInfo` tells the frame code which rectangles to redo its edges in.
export const bakeInfo = { full: true, shiftX: 0, shiftY: 0, rects: [] as number[], consumed: false };   // consumed: the frame code has read it (a bake before that makes it a full one)
export let bakeCount = 0;
let bakedLevel = -1, bakedW = 0, bakedH = 0, bakedX = 0, bakedY = 0, bakedLayer: Layer | null = null, forceFull = true;
let bakedSig: number[] = [];
let nextBand: number[] | null = null, pendingBands: number[] = [], pendingChunks: number[] = [];     // the season changed: the window is painted again a band at a time, a band a frame
const MARGIN_PX = 6;                    // pixels re-baked around a strip or a change: the occlusion of a pixel reads four pixels around it
export const trace = { on: false, scrub: 0 };       // ZINC_HAMLET_TRACE=1 (debugStart.ts): the bake times go to the console
export const bakeStats = { full: 0, partial: 0, lastMs: 0, chunks: 0, groundMs: 0, seasonMs: 0, warm: 0 };

/** The next rebake is a full one (the models, the zoom or the village itself changed). */
export function forceFullBake(): void { forceFull = true; }

function tileSig(t: number): number {
  const b = world.build[t];
  return (((world.tree[t] * 8 + world.rock[t]) * 5 + world.deco[t]) * 256 + (b >= 0 ? 1 + world.buildings[b].type + 64 * world.buildings[b].level : 0)) * 2 + world.road[t] + (world.terrain[t] === TERRAIN_VOID ? 100000 : 0);
}

/** The window rectangle (x0, y0, x1, y1; x1, y1 excluded) that a tile can change: its ground, what stands on it, its shadow and its tall crown. */
function tileBox(t: number, out: number[]): void {
  const x0 = tileX(t) - TILE / 2, y0 = tileY(t) - TILE / 2;
  const a = project(x0, y0, 0), b = project(x0 + TILE, y0, 0), c = project(x0, y0 + TILE, 0), d = project(x0 + TILE, y0 + TILE, 0);
  out[0] = Math.floor(Math.min(a.sx, b.sx, c.sx, d.sx) - 3 * S); out[1] = Math.floor(Math.min(a.sy, b.sy, c.sy, d.sy) - 7 * S);
  out[2] = Math.ceil(Math.max(a.sx, b.sx, c.sx, d.sx) + 6 * S); out[3] = Math.ceil(Math.max(a.sy, b.sy, c.sy, d.sy) + 3 * S);
}
/** Adds a window rectangle to a list of disjoint ones: only the part not covered yet (no pixel is baked twice: the occlusion tints in place). */
function addRect(list: number[], x0: number, y0: number, x1: number, y1: number): void {
  let pieces: number[] = [Math.max(0, x0), Math.max(0, y0), Math.min(W, x1), Math.min(H, y1)];
  for (let m = 0; m < list.length && pieces.length > 0; m += 4) {
    const e0 = list[m], e1 = list[m + 1], e2 = list[m + 2], e3 = list[m + 3], next: number[] = [];
    for (let k = 0; k < pieces.length; k += 4) {
      const a = pieces[k], b = pieces[k + 1], c = pieces[k + 2], d = pieces[k + 3];
      if (c <= a || d <= b) continue;
      if (e0 >= c || e2 <= a || e1 >= d || e3 <= b) { next.push(a, b, c, d); continue; }
      if (b < e1) next.push(a, b, c, e1);                                 // above the covered part
      if (d > e3) next.push(a, e3, c, d);                                 // below it
      const t = Math.max(b, e1), u = Math.min(d, e3);
      if (a < e0) next.push(a, t, e0, u);                                 // left of it
      if (c > e2) next.push(e2, t, c, u);                                 // right of it
    }
    pieces = next;
  }
  for (let k = 0; k < pieces.length; k++) list.push(pieces[k]);
}
function area(rects: number[]): number {
  let n = 0;
  for (let k = 0; k < rects.length; k += 4) n += (rects[k + 2] - rects[k]) * (rects[k + 3] - rects[k + 1]);
  return n;
}
/**
 * a'(x, y) = a(x + dx, y + dy), as one pass over the array shifted by dy * W + dx. The pixels that wrap from one row to the next (a few columns at the edge the picture
 * slides away from) are garbage, and they lie inside the strip the caller bakes again. One function per element type: a generic one is three times slower.
 */
export function shiftNumbers(a: number[], dx: number, dy: number): void {
  const k = dy * W + dx, n = a.length;
  if (k > 0) a.copyWithin(0, k);           // one block move (memmove), not a loop of n element copies: the same cells either way
  else if (k < 0) a.copyWithin(-k, 0, n + k);
}
export function shiftColors(a: u32[], dx: number, dy: number): void {
  const k = dy * W + dx, n = a.length;
  if (k > 0) a.copyWithin(0, k);           // one block move (memmove), not a loop of n element copies: the same cells either way
  else if (k < 0) a.copyWithin(-k, 0, n + k);
}
function touches(box: number[], b: number, rect: number[], k: number): boolean {
  return box[b] < rect[k + 2] && box[b + 2] > rect[k] && box[b + 1] < rect[k + 3] && box[b + 3] > rect[k + 1];
}

let boxBuffer: number[] = [];            // the window box of every tile, filled for the tiles near the window
/** Bakes the given (disjoint) rectangles of the window from the ground up. Pixels outside them are left as they are. */
function bakeRects(layer: Layer, rects: number[]): void {
  for (let k = 0; k < rects.length; k += 4) {                         // the neighbours the occlusion reads (four pixels around a rectangle) are the static ones
    for (let y = Math.max(0, rects[k + 1] - 5); y < Math.min(H, rects[k + 3] + 5); y++) for (let i = y * W + Math.max(0, rects[k] - 5), end = y * W + Math.min(W, rects[k + 2] + 5); i < end; i++) { pix[i] = bakedPix[i]; zb[i] = bakedZ[i]; }
  }
  shadowMask.fill(0);
  const count = tileCount(), box: number[] = [0, 0, 0, 0], visible: number[] = [];
  let boxes: number[] = boxBuffer;     // only the tiles near the window are looked at: the box of the window's corners in tiles
  if (boxes.length !== count * 4) { boxes = Array.from({ length: count * 4 }, (): number => 0); boxBuffer = boxes; }
  const c0 = unproject(-40, -100), c1 = unproject(W + 40, -100), c2 = unproject(-40, H + 40), c3 = unproject(W + 40, H + 40), half = world.half, size = world.size;
  const i0 = clamp(Math.floor((Math.min(c0.x, c1.x, c2.x, c3.x) + half) / TILE) - 1, 0, size - 1), i1 = clamp(Math.floor((Math.max(c0.x, c1.x, c2.x, c3.x) + half) / TILE) + 1, 0, size - 1);
  const j0 = clamp(Math.floor((Math.min(c0.y, c1.y, c2.y, c3.y) + half) / TILE) - 1, 0, size - 1), j1 = clamp(Math.floor((Math.max(c0.y, c1.y, c2.y, c3.y) + half) / TILE) + 1, 0, size - 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const t = j * size + i;
    if (!onScreen(tileX(t), tileY(t), 40)) continue;
    tileBox(t, box); boxes[t * 4] = box[0]; boxes[t * 4 + 1] = box[1]; boxes[t * 4 + 2] = box[2]; boxes[t * 4 + 3] = box[3]; visible.push(t);
  }
  for (let k = 0; k < rects.length; k += 4) {                        // phase 1: ground, dirt, objects and their shadows
    setClip(rects[k], rects[k + 1], rects[k + 2], rects[k + 3]);
    loadRect(layer, rects[k], rects[k + 1], rects[k + 2], rects[k + 3]);
    for (const t of visible) {
      if ((world.road[t] || world.build[t] >= 0) && touches(boxes, t * 4, rects, k)) paintDirt(t, layer);
    }
    for (const t of visible) {
      const x = tileX(t), y = tileY(t);
      if (world.terrain[t] === TERRAIN_VOID || !touches(boxes, t * 4, rects, k)) continue;
      const deco = world.deco[t], bloom = deco === 1 || deco === 2 ? hash(t, 9) < flowerShare(world.biome[t], curSeason) : false;     // flowers only in the warm seasons
      if (deco === 1) { sphere(x - .3, y + .1, .22, .3, [74, 104, 62], 'rough'); sphere(x + .1, y - .2, .2, .26, [90, 118, 66], 'rough'); if (bloom) sphere(x - .05, y + .05, .5, .1, [186, 126, 102], 'solid'); }
      if (deco === 2 && bloom) for (let n = 0; n < 6; n++) sphere(x + (hash(t, n) - .5) * 1.2, y + (hash(n, t) - .5) * 1.2, .08, .06, hash(n, t + 3) > .5 ? [250, 244, 224] : [232, 196, 100], 'solid');
      if (deco === DECO_REEDS) {                                       // reeds and a few cattails at the water's edge, in the season's colour
        const reed = reedColor(curSeason);
        for (let n = 0; n < 6; n++) {
          const rx = x + (hash(t, n + 20) - .5) * 1.5, ry = y + (hash(n + 20, t) - .5) * 1.5, h = .7 + hash(t + n, 5) * .5;
          capsule([rx, ry, 0], [rx + (hash(n, t + 7) - .5) * .25, ry, h], .035, .02, (): number[] => reed, 'solid');
          if (n % 3 === 0 && (curSeason < 9 || curSeason === 11 && false)) sphere(rx, ry, h, .06, [112, 78, 50], 'solid');
        }
      }
      if (world.tree[t] > 0) {
        const v = world.tree[t] - 1, tx = x + (hash(t, 7) - .5) * .7, ty = y + (hash(t, 8) - .5) * .7;
        treeModel(v, Math.floor(hash(t, 11) * 3) - 1).drawAt(tx, ty, 0); treeShadow(tx, ty, TREE_HEIGHT[v]);
      }
      if (world.rock[t] > 0) { models[MODEL_ROCK + world.rock[t] - 1].drawAt(x, y, 0); castShadow(x, y, .4, .6); }
      if (world.build[t] >= 0) {
        models[modelOf(world.buildings[world.build[t]].type, world.buildings[world.build[t]].level)].drawAt(x, y, 0);
        for (let z = .4; z < 2.6; z += .55) castShadow(x, y, z, .85);
      }
    }
    models[MODEL_GATE].drawAt(tileX(world.gate), tileY(world.gate), 0);
  }
  for (let k = 0; k < rects.length; k += 4) { setClip(rects[k], rects[k + 1], rects[k + 2], rects[k + 3]); bakeOcclusion(); }    // phase 2: it reads every rectangle's depth
  for (let k = 0; k < rects.length; k += 4) {                        // phase 3: shadows on the ground, then keep the result
    setClip(rects[k], rects[k + 1], rects[k + 2], rects[k + 3]);
    for (let y = rects[k + 1]; y < rects[k + 3]; y++) for (let i = y * W + rects[k], end = y * W + rects[k + 2]; i < end; i++) staticShadow[i] = shadowMask[i];
    applyShadows(groundZ);
    for (let y = rects[k + 1]; y < rects[k + 3]; y++) for (let i = y * W + rects[k], end = y * W + rects[k + 2]; i < end; i++) { bakedPix[i] = pix[i]; bakedZ[i] = zb[i]; }
  }
  clearClip();
}

/** The pixels of grass the wind animates. After a slide the old ones move with the picture; only the rebaked rectangles are searched again. */
function findTufts(layer: Layer, rects: number[], slid: boolean, dx: number, dy: number): void {
  const found: number[] = [];
  const inRects = (x: number, y: number): boolean => {
    for (let k = 0; k < rects.length; k += 4) if (x >= rects[k] && x < rects[k + 2] && y >= rects[k + 1] && y < rects[k + 3]) return true;
    return false;
  };
  if (slid) for (const i of tufts) {
    const x = i % W - dx, y = Math.floor(i / W) - dy;
    if (x >= 0 && x < W && y >= 0 && y < H && !inRects(x, y)) found.push(y * W + x);
  }
  for (let k = 0; k < rects.length; k += 4) for (let iy = rects[k + 1]; iy < rects[k + 3]; iy++) for (let ix = rects[k]; ix < rects[k + 2]; ix++) {
    const bx = ix + camera.x, by = iy + camera.y;
    if (bx < 0 || by < 0 || bx >= layer.width || by >= layer.height || (cellKind(layer, bx, by) & 8) === 0) continue;
    const i = iy * W + ix;
    if (kinds[i] === KIND_GRASS && bakedZ[i] === groundZ[i]) found.push(i);
  }
  tufts.length = 0;
  for (const i of found) tufts.push(i);
}

/** Brings the static picture to the current camera and village: a full bake the first time and whenever the zoom, the models or the window changed, else only strips and changed tiles. */
export function rebakeStatic(): void {
  const started = Date.now();
  const layer = layers[artLevel(camera.level)] as Layer;
  const dx = camera.x - bakedX, dy = camera.y - bakedY, count = tileCount();
  let rects: number[] = [];
  let full = forceFull || bakedLayer !== layer || bakedLevel !== camera.level || bakedW !== W || bakedH !== H || bakedSig.length !== count || Math.abs(dx) * 2 > W || Math.abs(dy) * 2 > H;
  if (!full) {
    if (dx !== 0) addRect(rects, dx > 0 ? W - dx - MARGIN_PX : 0, 0, dx > 0 ? W : -dx + MARGIN_PX, H);
    if (dy !== 0) addRect(rects, 0, dy > 0 ? H - dy - MARGIN_PX : 0, W, dy > 0 ? H : -dy + MARGIN_PX);
    const box: number[] = [0, 0, 0, 0];
    for (let t = 0; t < count; t++) {
      const sig = tileSig(t);
      if (sig === bakedSig[t]) continue;
      bakedSig[t] = sig;
      tileBox(t, box); addRect(rects, box[0], box[1], box[2], box[3]);
      for (let d = 0; d < 4; d++) { const v = neighbor(t, d); if (v >= 0) { tileBox(v, box); addRect(rects, box[0], box[1], box[2], box[3]); } }
    }
    if (nextBand !== null) { addRect(rects, nextBand[0], nextBand[1], nextBand[2], nextBand[3]); nextBand = null; }
    else if ((dx !== 0 || dy !== 0) && pendingBands.length > 0) pendingBands = seasonBands();      // the picture slid: what is still the old season may have moved into a band already done
    if (rects.length === 0 && dx === 0 && dy === 0) return;
    if (area(rects) * 10 > W * H * 6) full = true;                 // most of the window anyway
  }
  bakeCount++;
  if (full) {
    rects = [0, 0, W, H]; pendingBands = []; nextBand = null;
    bakeInfo.full = true; bakeInfo.shiftX = 0; bakeInfo.shiftY = 0;
    bakedSig = []; for (let t = 0; t < count; t++) bakedSig.push(tileSig(t));
    bakeStats.full++;
  } else {
    if (dx !== 0 || dy !== 0) { shiftColors(bakedPix, dx, dy); shiftNumbers(bakedZ, dx, dy); shiftNumbers(kinds, dx, dy); shiftNumbers(ground, dx, dy); shiftNumbers(groundZ, dx, dy); shiftNumbers(staticShadow, dx, dy); }
    if (bakeInfo.consumed) { bakeInfo.full = false; bakeInfo.shiftX = dx; bakeInfo.shiftY = dy; } else bakeInfo.full = true;     // two bakes between two frames: the frame code redoes everything
    bakeStats.partial++;
  }
  bakeInfo.rects = rects; bakeInfo.consumed = false;
  bakeRects(layer, rects);
  findTufts(layer, rects, !full, dx, dy);
  bakedLayer = layer; bakedLevel = camera.level; bakedW = W; bakedH = H; bakedX = camera.x; bakedY = camera.y; forceFull = false;
  bakeStats.lastMs = Date.now() - started;
}

/** The window cut in bands, top to bottom: (y0, y1) pairs. */
function seasonBands(): number[] {
  const out: number[] = [], n = 16;
  for (let k = 0; k < n; k++) out.push(Math.floor(H * k / n), Math.floor(H * (k + 1) / n));
  return out;
}
/**
 * One step of the seasons, called every frame: when the season changed, the trees of the new season replace the old ones and the ground is stamped stale (painted again, chunk by chunk,
 * where the window looks); the window is then rebaked one band per frame, so no frame pays for the whole change.
 */
/** True while a season change is still being painted (chunks of ground, then the bands of the window). */
export function pendingWork(): boolean { return pendingChunks.length > 0 || pendingBands.length > 0; }
const intervals: number[] = [];
let lastCall = 0, changing = false;
/** ZINC_HAMLET_TRACE: the time between two frames, summed up every 300 frames (p50, p95, p99, worst). */
function traceFrame(): void {
  const now = performance.now();
  if (lastCall > 0) intervals.push(now - lastCall);
  lastCall = now;
  if (pendingChunks.length > 0 || pendingBands.length > 0) changing = true;
  if (intervals.length < 300) return;
  const sorted = intervals.slice().sort((a: number, b: number): number => a - b), at = (q: number): string => sorted[Math.floor(sorted.length * q)].toFixed(1);
  console.log('hamlet: frame ms' + (changing ? ' (season change)' : '') + ' p50 ' + at(.5) + ' p95 ' + at(.95) + ' p99 ' + at(.99) + ' worst ' + sorted[sorted.length - 1].toFixed(1) + ' (size ' + world.size + ')');
  intervals.length = 0; changing = false;
}
export function stepSeason(): void {
  if (trace.on) traceFrame();
  if (trace.scrub > 0) world.tick += trace.scrub;          // debug: ZINC_HAMLET_SCRUB ticks more every frame, the year runs fast
  const s = monthStep();
  if (s !== curSeason) {
    const started = Date.now();
    curSeason = s;
    ensureBiomes();
    for (let i = 0; i < layers.length; i++) { const l = layers[i]; if (l === null) continue; if (l.lazy) l.stamp.fill(-1); else layers[i] = null; }
    if (layers[artLevel(camera.level)] === null) ensureLevel(camera.level);
    useTreeSeason(curSeason); applyCamera();
    pendingChunks = [];                                                   // the ground under the window, painted a few chunks a frame before the bands need it
    const layer = layers[artLevel(camera.level)] as Layer;
    for (let cy = Math.max(0, Math.floor(camera.y / CHUNK)); cy <= Math.min(Math.floor((layer.height - 1) / CHUNK), Math.floor((camera.y + H) / CHUNK)); cy++) {
      for (let cx = Math.max(0, Math.floor(camera.x / CHUNK)); cx <= Math.min(layer.columns - 1, Math.floor((camera.x + W) / CHUNK)); cx++) pendingChunks.push(cx, cy);
    }
    pendingBands = seasonBands();
    if (trace.on) console.log('hamlet: season ' + s + ' starts: trees ' + (Date.now() - started) + ' ms, ' + pendingChunks.length / 2 + ' chunks to paint');
  }
  const layer = layers[artLevel(camera.level)];
  if (pendingChunks.length > 0 && layer !== null) {
    const started = Date.now();
    for (let n = 0; n < 6 && pendingChunks.length > 0 && Date.now() - started < 5; n++) {
      const cx = pendingChunks[0], cy = pendingChunks[1];
      pendingChunks = pendingChunks.slice(2);
      if (layer.shore.length === 0) { layer.shore = shoreTiles(); layer.rivers = layer.shore.some((v: number): boolean => v === 1); }
      if (layer.stamp[cy * layer.columns + cx] !== curSeason) { paintChunk(layer, cx, cy, curSeason); bakeStats.chunks++; }
    }
    return;
  }
  if (pendingBands.length === 0 && pendingChunks.length === 0) { warmTrees(curSeason); warmGround(); return; }
  if (pendingBands.length > 0) {
    const started = Date.now();
    nextBand = [0, pendingBands[0] - MARGIN_PX, W, pendingBands[1] + MARGIN_PX]; pendingBands = pendingBands.slice(2);      // a band is baked with the margin the occlusion reads, like a strip
    rebakeStatic();
    bakeStats.seasonMs = Date.now() - started;
    if (trace.on) console.log('hamlet: season ' + curSeason + ' band ' + (16 - pendingBands.length / 2) + ' ' + bakeStats.seasonMs + ' ms');
  }
}

/** Makes sure the models and the ground of a zoom level exist, and points the renderer at the camera. */
function ensureLevel(level: number): void {
  const fixed = isFixed(level);
  const art = artLevel(level);
  resizeBuffer(windowWidth(level), windowHeight(level));
  useModels(art, scaleOf(art), fixed ? scaleOf(DEFAULT_ZOOM) : 0);
  useTreeSeason(curSeason);
  forceFull = true;
  if (layers[art] === null) layers[art] = bakeLayer(art);
  applyCamera();
}

/** Prepares the renderer, the models and the ground of the current village, centred on its middle. */
export function bakeVillage(): void {
  configureRenderer(8, 1.1, -.25);
  const t0 = Date.now();
  ensureBiomes(); curSeason = monthStep(); pendingBands = []; pendingChunks = []; bakeStats.chunks = 0; bakeStats.groundMs = 0;
  forceFull = true;
  for (let i = 0; i < layers.length; i++) layers[i] = null;
  ensureLevel(camera.level);
  const start = startPoint();
  centerOn(start.x, start.y);
  rebakeStatic();
  if (trace.on) console.log('hamlet: first bake ' + (Date.now() - t0) + ' ms, ' + bakeStats.chunks + ' chunks, ground ' + bakeStats.groundMs + ' ms, size ' + world.size);
}
/** Where a new village opens: between the gate and the middle, so the gate and the first houses are in view. */
export function startPoint(): { x: number; y: number } { return { x: tileX(world.gate) * .65, y: tileY(world.gate) * .65 }; }
/** The area for the map changed (the window was resized): the picture window follows it, keeping the same centre. */
export function resizeWindow(): void {
  const centre = centerPoint();
  ensureLevel(camera.level);
  centerOn(centre.x, centre.y);
  rebakeStatic();
}

/**
 * While the camera rests, the ground under the window is painted a few chunks a frame at the zoom levels next to this one (the layer is made, empty, if need be), so a zoom step
 * finds it done: painting the ground was the largest part of a step. At most WARM_MS of work a frame; the fixed detail mode (lod 1) resizes a whole layer and is left out.
 */
const WARM_MS = 4, WARM_REST = 20, WARM_ROWS = 4;
let warmAt = -1e9, restFrames = 0, restSig = 0, warmList: number[] = [], warmLevel = -1, warmSig = 0;
export function warmGround(): void {
  const sig = camera.x * 7919 + camera.y * 31 + camera.level * 100003 + W;
  if (sig !== restSig) { restSig = sig; restFrames = 0; return; }
  if (++restFrames < WARM_REST) return;
  if (warmList.length === 0) {
    if (warmSig === sig) return;                                   // everything next to this view is done
    for (const near of [camera.level - 1, camera.level + 1]) {
      const art = artLevel(near);
      if (near < 0 || near >= ZOOM_SCALES.length || art === artLevel(camera.level) || isFixed(art)) continue;
      const centre = centerPoint(), sc = scaleOf(near), w = windowWidth(near), h = windowHeight(near);
      const x0 = Math.max(0, Math.round(layerOriginX(near) + (centre.x - centre.y) / R2 * sc - w / 2)), y0 = Math.max(0, Math.round(layerOriginY(near) + (centre.x + centre.y) / R2 * SIN * sc - h / 2));
      if (layers[art] === null) layers[art] = bakeLayer(art);
      const layer = layers[art] as Layer;
      for (let cy = Math.floor(y0 / CHUNK); cy <= Math.min(Math.floor((layer.height - 1) / CHUNK), Math.floor((y0 + h - 1) / CHUNK)); cy++) {
        for (let cx = Math.floor(x0 / CHUNK); cx <= Math.min(layer.columns - 1, Math.floor((x0 + w - 1) / CHUNK)); cx++) if (layer.stamp[cy * layer.columns + cx] !== curSeason) warmList.push(art, cx, cy, 0);
      }
    }
    warmSig = sig;
    if (warmList.length === 0) return;
  }
  const started = Date.now();
  while (warmList.length > 0 && Date.now() - started < WARM_MS) {          // a chunk is painted WARM_ROWS rows at a time: on the interpreter a whole chunk takes longer than a frame
    const art = warmList[0], cx = warmList[1], cy = warmList[2], row = warmList[3], layer = layers[art];
    if (layer === null || layer.stamp[cy * layer.columns + cx] === curSeason) { warmList = warmList.slice(4); continue; }
    if (layer.shore.length === 0) { layer.shore = shoreTiles(); layer.rivers = layer.shore.some((v: number): boolean => v === 1); }
    paintChunk(layer, cx, cy, curSeason, row, row + WARM_ROWS);
    if (row + WARM_ROWS >= CHUNK) { warmList = warmList.slice(4); bakeStats.warm++; } else warmList[3] = row + WARM_ROWS;
  }
}

/** Switches the zoom level, keeping the same point at the centre of the window. */
export function setZoom(level: number): void {
  if (level < 0 || level >= ZOOM_SCALES.length || level === camera.level) return;
  const centre = centerPoint(), previous = camera.level;
  camera.level = level;
  for (let i = 0; i < layers.length; i++) if (i !== artLevel(level) && i !== artLevel(previous)) layers[i] = null;     // a ground layer is big: keep the current and the last one
  ensureLevel(level);
  centerOn(centre.x, centre.y);
  rebakeStatic();
}
/** One step of zoom: +1 closer, -1 farther (the levels are indexed from the closest). */
export function stepZoom(direction: number): void { setZoom(camera.level - direction); }
/** The normal zoom, centred on the village. */
export function resetView(): void { setZoom(DEFAULT_ZOOM); const start = startPoint(); centerOn(start.x, start.y); rebakeStatic(); }
/** Pans the camera and redoes the static picture if it moved. */
export function moveCamera(dx: number, dy: number): boolean {
  if (!panBy(dx, dy)) return false;
  rebakeStatic();
  return true;
}

/** The detail mode changed: bake the models again (at the current level) and redo the picture. */
export function refreshModels(): void {
  resetModels();
  for (let i = 0; i < layers.length; i++) layers[i] = null;
  ensureLevel(camera.level);
  rebakeStatic();
}
/** Puts the world point (x, y) at the centre of the window (the minimap's click). */
export function jumpTo(x: number, y: number): void {
  centerOn(x, y);
  rebakeStatic();
}
