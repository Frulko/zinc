import {
  W, H, R2, COS, pix, zb, ground, groundZ, kinds, bakedPix, bakedZ, shadowMask, staticShadow, KIND_GRASS,
  configureRenderer, resizeBuffer, setView, copyInto, project, unproject, rgb, rgbColor, rampOf, noise, hash, clamp, castShadow, bakeOcclusion, applyShadows, sphere,
} from '../pixel';
import { TILE, TERRAIN_VOID } from '../constants';
import { GRASS_TONES, WATER_TONES, SAND_TONES, ROAD_COLOR } from '../palettes';
import { world, waterField, tileX, tileY, tileAt, tileCount, neighbor } from '../world/world';
import { models, MODEL_HOUSE, MODEL_GATE, MODEL_TREE, MODEL_ROCK, useModels, resetModels, TREE_HEIGHT } from './models';
import { settings } from '../settings';
import { camera, ZOOM_SCALES, DEFAULT_ZOOM, artLevel, windowWidth, windowHeight, scaleOf, layerWidth, layerHeight, layerOriginX, layerOriginY, applyCamera, centerOn, centerPoint, panBy } from './camera';

const KIND_SAND = 1, KIND_WATER = 2, KIND_ROAD = 4;
const WHITE = rgb(255, 255, 255);

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
  setView(scaleOf(level), layerOriginX(level), layerOriginY(level));
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

/** Copies the part of the ground under the camera's window into the renderer's buffers. */
function loadWindow(layer: Layer): void {
  for (let wy = 0; wy < H; wy++) for (let wx = 0; wx < W; wx++) {
    const i = wy * W + wx, bx = wx + camera.x, by = wy + camera.y;
    if (bx < 0 || by < 0 || bx >= layer.width || by >= layer.height) { pix[i] = WHITE; zb[i] = -1e9; kinds[i] = 0; ground[i] = 0; continue; }
    const bi = by * layer.width + bx;
    pix[i] = layer.pix[bi]; zb[i] = layer.z[bi]; kinds[i] = layer.kind[bi]; ground[i] = layer.kind[bi] > 0 ? 1 : 0;
  }
  copyInto(groundZ, zb);
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
  const left = Math.max(0, Math.floor(Math.min(a.sx, b.sx, c.sx, d.sx))), right = Math.min(W - 1, Math.ceil(Math.max(a.sx, b.sx, c.sx, d.sx)));
  const top = Math.max(0, Math.floor(Math.min(a.sy, b.sy, c.sy, d.sy))), bottom = Math.min(H - 1, Math.ceil(Math.max(a.sy, b.sy, c.sy, d.sy)));
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
    pix[i] = hash(ix * 5, iy * 3) > .94 ? ramp[4] : edge ? ramp[1] : ramp[clamp(Math.floor(2.2 + noise(p.x * 2.2, p.y * 2.2) * 1.8 + (hash(ix, iy) - .5) * .6), 1, 4)];
    kinds[i] = KIND_ROAD;
  }
}

function treeShadow(x: number, y: number, height: number): void { for (let z = 1; z < height; z += .45) castShadow(x, y, z, .6); }

/** True when the world point is near enough to the window to be worth drawing. */
function onScreen(x: number, y: number, margin: number): boolean {
  const p = project(x, y, 0);
  return p.sx > -margin && p.sx < W + margin && p.sy > -margin - 60 && p.sy < H + margin;
}

/** Everything that stands still (dirt, trees, rocks, flowers, buildings) is redone when the village or the camera changes, not every frame. */
/** Counts the static bakes, so the frame code knows when its kept picture is out of date. */
export let bakeCount = 0;
export function rebakeStatic(): void {
  bakeCount++;
  const layer = layers[artLevel(camera.level)] as Layer;
  loadWindow(layer);
  shadowMask.fill(0);
  const count = tileCount();
  for (let t = 0; t < count; t++) if ((world.road[t] || world.build[t] >= 0) && onScreen(tileX(t), tileY(t), 40)) paintDirt(t, layer);
  for (let t = 0; t < count; t++) {
    const x = tileX(t), y = tileY(t);
    if (world.terrain[t] === TERRAIN_VOID || !onScreen(x, y, 40)) continue;
    if (world.deco[t] === 1) { sphere(x - .3, y + .1, .22, .3, [74, 104, 62], 'rough'); sphere(x + .1, y - .2, .2, .26, [90, 118, 66], 'rough'); sphere(x - .05, y + .05, .5, .1, [186, 126, 102], 'solid'); }
    if (world.deco[t] === 2) for (let k = 0; k < 6; k++) sphere(x + (hash(t, k) - .5) * 1.2, y + (hash(k, t) - .5) * 1.2, .08, .06, hash(k, t + 3) > .5 ? [250, 244, 224] : [232, 196, 100], 'solid');
    if (world.tree[t] > 0) {
      const v = world.tree[t] - 1, tx = x + (hash(t, 7) - .5) * .7, ty = y + (hash(t, 8) - .5) * .7;
      models[MODEL_TREE + v].drawAt(tx, ty, 0); treeShadow(tx, ty, TREE_HEIGHT[v]);
    }
    if (world.rock[t] > 0) { models[MODEL_ROCK + world.rock[t] - 1].drawAt(x, y, 0); castShadow(x, y, .4, .6); }
    if (world.build[t] >= 0) {
      models[MODEL_HOUSE + world.buildings[world.build[t]].type].drawAt(x, y, 0);
      for (let z = .4; z < 2.6; z += .55) castShadow(x, y, z, .85);
    }
  }
  models[MODEL_GATE].drawAt(tileX(world.gate), tileY(world.gate), 0);
  bakeOcclusion();
  copyInto(staticShadow, shadowMask); applyShadows(groundZ);
  copyInto(bakedPix, pix); copyInto(bakedZ, zb);
  tufts.length = 0;
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const bx = ix + camera.x, by = iy + camera.y;
    if (bx < 0 || by < 0 || bx >= layer.width || by >= layer.height || !layer.tuft[by * layer.width + bx]) continue;
    const i = iy * W + ix;
    if (kinds[i] === KIND_GRASS && zb[i] === groundZ[i]) tufts.push(i);
  }
}

/** Makes sure the models and the ground of a zoom level exist, and points the renderer at the camera. */
function ensureLevel(level: number): void {
  const fixed = isFixed(level);
  const art = artLevel(level);
  resizeBuffer(windowWidth(level), windowHeight(level));
  useModels(art, scaleOf(art), fixed ? scaleOf(DEFAULT_ZOOM) : 0);
  if (layers[art] === null) layers[art] = bakeLayer(art);
  applyCamera();
}

/** Prepares the renderer, the models and the ground of the current village, centred on its middle. */
export function bakeVillage(): void {
  configureRenderer(8, 1.1, -.25);
  for (let i = 0; i < layers.length; i++) layers[i] = null;
  ensureLevel(camera.level);
  centerOn(0, 0);
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
export function resetView(): void { setZoom(DEFAULT_ZOOM); centerOn(0, 0); rebakeStatic(); }
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
