import {
  W, H, R2, COS, pix, zb, ground, groundZ, kinds, bakedPix, bakedZ, shadowMask, staticShadow, KIND_GRASS,
  configureRenderer, resizeBuffer, setView, copyInto, project, unproject, rgb, rgbColor, rampOf, noise, hash, clamp, castShadow, bakeOcclusion, applyShadows, sphere, PX, PY, S, setClip, clearClip, setPixelOrigin, CX0, CY0, CX1, CY1,
} from '../pixel';
import { TILE, TERRAIN_VOID } from '../constants';
import { GRASS_TONES, WATER_TONES, SAND_TONES, ROAD_COLOR } from '../palettes';
import { world, waterField, tileX, tileY, tileAt, tileCount, neighbor } from '../world/world';
import { models, modelOf, MODEL_GATE, MODEL_TREE, MODEL_ROCK, useModels, resetModels, TREE_HEIGHT } from './models';
import { settings } from '../settings';
import { camera, ZOOM_SCALES, DEFAULT_ZOOM, artLevel, windowWidth, windowHeight, scaleOf, layerWidth, layerHeight, layerOriginX, layerOriginY, applyCamera, centerOn, centerPoint, panBy } from './camera';

const KIND_SAND = 1, KIND_WATER = 2, KIND_ROAD = 4;
const WHITE = rgb(44, 41, 35);          // outside the village: the dark stone of the interface (the dissolved border fades into it)

/** The ground of the whole village at one zoom level, in layer pixels (the camera's window slides over it). */
class Layer {
  width: number; height: number;
  pix: u32[]; z: number[]; kind: number[]; tile: number[]; tuft: number[];
  constructor(width: number, height: number) {
    this.width = width; this.height = height;
    const n = width * height;
    this.pix = Array.from({ length: n }, (): u32 => WHITE);
    this.z = Array.from({ length: n }, (): number => -1e9);
    this.kind = Array.from({ length: n }, (): number => 0);
    this.tile = Array.from({ length: n }, (): number => -1);
    this.tuft = Array.from({ length: n }, (): number => 0);
  }
}
const layers: (Layer | null)[] = ZOOM_SCALES.map((_s: number): Layer | null => null);
/** Pixels of grass that still show grass after the last rebake: the wind animates these. */
export const tufts: number[] = [];

/**
 * The detail modes when zooming in (settings.lod): 0 sharp (each level is painted at its own scale); 1 fixed (the normal-level art, enlarged). Zooming out never
 * resizes the art: it shows a wider window of the normal level, so the detail is kept.
 */
function isFixed(level: number): boolean { return level < DEFAULT_ZOOM && settings.lod === 1; }

/** The normal-level ground resized to another level's layer: pixels averaged (3 x 3 samples), the data of the centre sample kept; a pixel the ground covers less than half stays empty. */
function resizeLayer(base: Layer, level: number): Layer {
  const layer = new Layer(layerWidth(level), layerHeight(level)), f = scaleOf(level) / scaleOf(DEFAULT_ZOOM);
  const bx = layerOriginX(DEFAULT_ZOOM), by = layerOriginY(DEFAULT_ZOOM), dx = layerOriginX(level), dy = layerOriginY(level);
  const smooth = settings.resample === 1, r = f < 1 ? .33 / f : 0;
  for (let y = 0; y < layer.height; y++) for (let x = 0; x < layer.width; x++) {
    const sx = bx + (x - dx) / f, sy = by + (y - dy) / f, cx = Math.round(sx), cy = Math.round(sy);
    if (cx < 0 || cy < 0 || cx >= base.width || cy >= base.height) continue;
    const c = cy * base.width + cx;
    if (base.z[c] <= -1e8) continue;
    const i = y * layer.width + x;
    layer.kind[i] = base.kind[c]; layer.z[i] = base.z[c]; layer.tile[i] = base.tile[c]; layer.tuft[i] = base.tuft[c];
    let r0 = 0, r1 = 0, r2 = 0, r3 = 0, n = 0;
    if (smooth && f < 1) {
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const px = Math.round(sx + a * r), py = Math.round(sy + b * r);
        if (px < 0 || py < 0 || px >= base.width || py >= base.height) continue;
        const k = py * base.width + px;
        if (base.z[k] <= -1e8) continue;
        const col = base.pix[k];
        r0 += col & 255; r1 += (col >> 8) & 255; r2 += (col >> 16) & 255; r3 += (col >>> 24) & 255; n++;
      }
    }
    if (n < 5) layer.pix[i] = base.pix[c];
    else layer.pix[i] = (Math.round(r0 / n) | (Math.round(r1 / n) << 8) | (Math.round(r2 / n) << 16) | (Math.round(r3 / n) << 24)) >>> 0;
  }
  return layer;
}

/** Bakes the ground of the current village at a zoom level: grass, sand and pond painted per pixel, with a dissolved border like the Pixel Plays dioramas. */
function bakeLayer(level: number): Layer {
  if (isFixed(level)) return resizeLayer(bakeLayer(DEFAULT_ZOOM), level);
  const layer = new Layer(layerWidth(level), layerHeight(level));
  setView(scaleOf(level), layerOriginX(level), layerOriginY(level)); setPixelOrigin(0, 0);
  const half = world.half;
  for (let iy = 0; iy < layer.height; iy++) for (let ix = 0; ix < layer.width; ix++) {
    const p = unproject(ix + .5, iy + .5), i = iy * layer.width + ix;
    const edge = Math.pow(Math.pow(Math.abs(p.x) / half, 4) + Math.pow(Math.abs(p.y) / half, 4), .25);
    const rough = edge + (noise(p.x, p.y) - .5) * .07;
    if (rough > 1.03 || rough > .95 && hash(ix, iy) < (rough - .95) / .08) continue;
    const field = waterField(p.x, p.y);
    let color: number[], kind: number;
    if (field < 1) { kind = KIND_WATER; color = WATER_TONES[clamp(Math.floor(.8 + noise(p.x * .4, p.y * .35) * 2.3 + hash(ix, iy) * .2), 0, 3)]; }
    else if (field < 1.2) { kind = KIND_SAND; color = SAND_TONES[clamp(Math.floor(noise(p.x * .8, p.y * .8) * 3 + hash(ix, iy) * .4), 0, 2)]; }
    else { kind = KIND_GRASS; color = GRASS_TONES[clamp(Math.floor(noise(p.x * .6, p.y * .7) * 3.5), 0, 3)]; }
    layer.kind[i] = kind; layer.pix[i] = rgbColor(color); layer.z[i] = (p.x + p.y) / R2 * COS;
    layer.tile[i] = tileAt(clamp(p.x, -half + .01, half - .01), clamp(p.y, -half + .01, half - .01));
    if (kind === KIND_GRASS && hash(ix * 3, iy * 5) < .14) layer.tuft[i] = 1;
  }
  return layer;
}

/** Copies the ground under the camera's window into the renderer's buffers, for the pixels of a rectangle (x1, y1 excluded). */
function loadRect(layer: Layer, x0: number, y0: number, x1: number, y1: number): void {
  for (let wy = y0; wy < y1; wy++) for (let wx = x0; wx < x1; wx++) {
    const i = wy * W + wx, bx = wx + camera.x, by = wy + camera.y;
    if (bx < 0 || by < 0 || bx >= layer.width || by >= layer.height) { pix[i] = WHITE; zb[i] = -1e9; kinds[i] = 0; ground[i] = 0; groundZ[i] = -1e9; continue; }
    const bi = by * layer.width + bx;
    pix[i] = layer.pix[bi]; zb[i] = layer.z[bi]; kinds[i] = layer.kind[bi]; ground[i] = layer.kind[bi] > 0 ? 1 : 0; groundZ[i] = layer.z[bi];
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
    if (bx < 0 || by < 0 || bx >= layer.width || by >= layer.height || layer.tile[by * layer.width + bx] !== t) continue;
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
const MARGIN_PX = 6;                    // pixels re-baked around a strip or a change: the occlusion of a pixel reads four pixels around it
export const bakeStats = { full: 0, partial: 0, lastMs: 0 };

/** The next rebake is a full one (the models, the zoom or the village itself changed). */
export function forceFullBake(): void { forceFull = true; }

function tileSig(t: number): number {
  const b = world.build[t];
  return (((world.tree[t] * 8 + world.rock[t]) * 3 + world.deco[t]) * 256 + (b >= 0 ? 1 + world.buildings[b].type + 64 * world.buildings[b].level : 0)) * 2 + world.road[t] + (world.terrain[t] === TERRAIN_VOID ? 100000 : 0);
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
  if (k > 0) for (let i = 0; i + k < n; i++) a[i] = a[i + k];
  else if (k < 0) for (let i = n - 1; i + k >= 0; i--) a[i] = a[i + k];
}
export function shiftColors(a: u32[], dx: number, dy: number): void {
  const k = dy * W + dx, n = a.length;
  if (k > 0) for (let i = 0; i + k < n; i++) a[i] = a[i + k];
  else if (k < 0) for (let i = n - 1; i + k >= 0; i--) a[i] = a[i + k];
}
function touches(box: number[], b: number, rect: number[], k: number): boolean {
  return box[b] < rect[k + 2] && box[b + 2] > rect[k] && box[b + 1] < rect[k + 3] && box[b + 3] > rect[k + 1];
}

/** Bakes the given (disjoint) rectangles of the window from the ground up. Pixels outside them are left as they are. */
function bakeRects(layer: Layer, rects: number[]): void {
  for (let k = 0; k < rects.length; k += 4) {                         // the neighbours the occlusion reads (four pixels around a rectangle) are the static ones
    for (let y = Math.max(0, rects[k + 1] - 5); y < Math.min(H, rects[k + 3] + 5); y++) for (let i = y * W + Math.max(0, rects[k] - 5), end = y * W + Math.min(W, rects[k + 2] + 5); i < end; i++) { pix[i] = bakedPix[i]; zb[i] = bakedZ[i]; }
  }
  shadowMask.fill(0);
  const count = tileCount(), box: number[] = [0, 0, 0, 0], boxes: number[] = [], shown: boolean[] = [];
  for (let t = 0; t < count; t++) { tileBox(t, box); boxes.push(box[0], box[1], box[2], box[3]); shown.push(onScreen(tileX(t), tileY(t), 40)); }
  for (let k = 0; k < rects.length; k += 4) {                        // phase 1: ground, dirt, objects and their shadows
    setClip(rects[k], rects[k + 1], rects[k + 2], rects[k + 3]);
    loadRect(layer, rects[k], rects[k + 1], rects[k + 2], rects[k + 3]);
    for (let t = 0; t < count; t++) {
      if ((world.road[t] || world.build[t] >= 0) && shown[t] && touches(boxes, t * 4, rects, k)) paintDirt(t, layer);
    }
    for (let t = 0; t < count; t++) {
      const x = tileX(t), y = tileY(t);
      if (world.terrain[t] === TERRAIN_VOID || !shown[t] || !touches(boxes, t * 4, rects, k)) continue;
      if (world.deco[t] === 1) { sphere(x - .3, y + .1, .22, .3, [74, 104, 62], 'rough'); sphere(x + .1, y - .2, .2, .26, [90, 118, 66], 'rough'); sphere(x - .05, y + .05, .5, .1, [186, 126, 102], 'solid'); }
      if (world.deco[t] === 2) for (let n = 0; n < 6; n++) sphere(x + (hash(t, n) - .5) * 1.2, y + (hash(n, t) - .5) * 1.2, .08, .06, hash(n, t + 3) > .5 ? [250, 244, 224] : [232, 196, 100], 'solid');
      if (world.tree[t] > 0) {
        const v = world.tree[t] - 1, tx = x + (hash(t, 7) - .5) * .7, ty = y + (hash(t, 8) - .5) * .7;
        models[MODEL_TREE + v].drawAt(tx, ty, 0); treeShadow(tx, ty, TREE_HEIGHT[v]);
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
    if (bx < 0 || by < 0 || bx >= layer.width || by >= layer.height || !layer.tuft[by * layer.width + bx]) continue;
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
    if (rects.length === 0 && dx === 0 && dy === 0) return;
    if (area(rects) * 10 > W * H * 6) full = true;                 // most of the window anyway
  }
  bakeCount++;
  if (full) {
    rects = [0, 0, W, H];
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

/** Makes sure the models and the ground of a zoom level exist, and points the renderer at the camera. */
function ensureLevel(level: number): void {
  const fixed = isFixed(level);
  const art = artLevel(level);
  resizeBuffer(windowWidth(level), windowHeight(level));
  useModels(art, scaleOf(art), fixed ? scaleOf(DEFAULT_ZOOM) : 0);
  forceFull = true;
  if (layers[art] === null) layers[art] = bakeLayer(art);
  applyCamera();
}

/** Prepares the renderer, the models and the ground of the current village, centred on its middle. */
export function bakeVillage(): void {
  configureRenderer(8, 1.1, -.25);
  forceFull = true;
  for (let i = 0; i < layers.length; i++) layers[i] = null;
  ensureLevel(camera.level);
  const start = startPoint();
  centerOn(start.x, start.y);
  rebakeStatic();
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
