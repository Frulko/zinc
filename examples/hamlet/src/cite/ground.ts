import { createImage, beginImage, endImage, clear, polygon, drawImageRect, rect } from 'zinc:gfx';
import { world, tileIndex } from '../world/world';
import { TERRAIN_WATER, TERRAIN_VOID, TERRAIN_GRASS } from '../constants';
import { WATER_TONES, SAND_TONES, ROAD_COLOR, STONE } from '../palettes';
import { groundTone, tileMonth, snowShare, monthStep, flowerShare, reedColor } from '../view/seasons';
import { hash } from '../world/noise';
import { economy } from '../world/economy';
import { HW, HH, PXH, cam, view, stats, heightIJ, cornersOf, corner } from './geom';
import { shade } from './atlas';

// The ground of the map is cut into square regions of the map picture (iso pixels at zoom 1: x = (i - j) * 32, y = (i + j) * 16 - level * 9.8),
// each baked once into an opaque image (the software raster of beginImage) and drawn as one quad. A region is rebuilt only when a tile it shows
// changed (a signature of its tiles, checked a few regions a frame) or the month moved on. Regions do not overlap, so the draw order does not matter.
// Four levels of detail: the region image has 512 px whatever the level, so a far level covers more map and costs the same to bake and draw.
const SIZE = 512, MARGIN = 1, TEX = SIZE + 2 * MARGIN;
export const LOD_B: number[] = [2, 1, .5, .25];             // bake scale of each level: texture pixels per map pixel
const BG = 0x151a17;
const MAX_REGIONS = 56;

/** A square of the map picture. `img` is what is drawn; a rebuild of a region that is shown goes into `back` and swaps in when done (no torn picture).
 *  `s` is the next tile diagonal to paint (-1: not under way): a region is baked a few diagonals a frame. */
class Region {
  id: number = -1; img: number = -1; back: number = -1; rx: number = 0; ry: number = 0; lod: number = 1; sig: number = 0; acc: number = 0; month: number = -1; rev: number = -1; used: number = 0;
  ready: boolean = false; started: boolean = false; stale: boolean = false; s: number = -1; sMax: number = 0; ring: boolean = false;
}
const regions: Region[] = [];
const index = new Map<number, Region>();
const free: number[] = [];
let frameNo = 0;
const pending: Region[] = [];

function key(rx: number, ry: number, lod: number): number { return ((ry + 512) * 1024 + (rx + 512)) * 4 + lod; }
function span(lod: number): number { return SIZE / LOD_B[lod]; }

// ---- tile colours ----
function mixc(a: number[], b: number[], k: number): number[] { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
const SNOW = [236, 240, 244], ROCK_LOW = [122, 112, 98], ROCK_HIGH = [150, 148, 144];
function groundColor(t: number, lightSlope: number, avgLevel: number): number {
  const biome = world.biome[t], m = monthStep();
  const mm = tileMonth(biome, t, m);
  let c: number[];
  if (biome === 7) c = SAND_TONES[(hash(t, 3) * 3) | 0];
  else { const q = hash(t, 5); c = groundTone(biome, mm, q < .3 ? 1 : q < .75 ? 2 : q < .92 ? 3 : 0); }
  if (avgLevel >= 6.5) c = mixc(c, avgLevel >= 12 ? SNOW : avgLevel >= 9 ? ROCK_HIGH : ROCK_LOW, Math.min(1, (avgLevel - 6.5) / 2.5));
  else if (avgLevel >= 3) c = mixc(c, ROCK_LOW, (avgLevel - 3) / 14);
  if (snowShare(biome, mm) * .6 > hash(t, 31)) c = mixc(c, SNOW, .5);
  return shade(c, lightSlope * 1.12 * (.96 + hash(t, 9) * .08));
}
function darken(color: number, f: number): number { return shade([(color >> 16) & 255, (color >> 8) & 255, color & 255], f); }

// ---- drawing one tile into a region ----
// Map pixels -> texture pixels: (X - ox) * b + MARGIN.
let ox = 0, oy = 0, bs = 1;
const qbuf: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
function quad(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color: number, grow: number): void {
  // grown a little away from its centre so neighbours overlap (no seam between anti-aliased edges)
  const cx = (x0 + x1 + x2 + x3) / 4, cy = (y0 + y1 + y2 + y3) / 4;
  qbuf[0] = (x0 + (x0 > cx ? grow : -grow) - ox) * bs + MARGIN; qbuf[1] = (y0 + (y0 > cy ? grow : -grow) - oy) * bs + MARGIN;
  qbuf[2] = (x1 + (x1 > cx ? grow : -grow) - ox) * bs + MARGIN; qbuf[3] = (y1 + (y1 > cy ? grow : -grow) - oy) * bs + MARGIN;
  qbuf[4] = (x2 + (x2 > cx ? grow : -grow) - ox) * bs + MARGIN; qbuf[5] = (y2 + (y2 > cy ? grow : -grow) - oy) * bs + MARGIN;
  qbuf[6] = (x3 + (x3 > cx ? grow : -grow) - ox) * bs + MARGIN; qbuf[7] = (y3 + (y3 > cy ? grow : -grow) - oy) * bs + MARGIN;
  polygon(qbuf, color, 255);
}
function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, color: number, alpha: number = 255): void {
  polygon([(x0 - ox) * bs + MARGIN, (y0 - oy) * bs + MARGIN, (x1 - ox) * bs + MARGIN, (y1 - oy) * bs + MARGIN, (x2 - ox) * bs + MARGIN, (y2 - oy) * bs + MARGIN], color, alpha);
}
function blobAt(x: number, y: number, rx: number, ry: number, color: number, alpha: number = 255): void {
  const pts: number[] = [];
  for (let k = 0; k < 10; k++) { const a = k / 10 * 6.2832; pts.push((x + Math.cos(a) * rx - ox) * bs + MARGIN, (y + Math.sin(a) * ry - oy) * bs + MARGIN); }
  polygon(pts, color, alpha);
}
// tile-local point: u along i, v along j, both 0..1, with the bilinear level of the corners
let tdx = 0, tsy = 0;
function px(u: number, v: number): number { return tdx + (u - v) * HW; }
function py(u: number, v: number): number {
  const lv = corner[0] * (1 - u) * (1 - v) + corner[1] * u * (1 - v) + corner[2] * u * v + corner[3] * (1 - u) * v;
  return tsy + (u + v) * HH - lv * PXH;
}
function patch(u0: number, v0: number, u1: number, v1: number, color: number): void {
  quad(px(u0, v0), py(u0, v0), px(u1, v0), py(u1, v0), px(u1, v1), py(u1, v1), px(u0, v1), py(u0, v1), color, .15);
}
function isRoadish(i: number, j: number): boolean {
  if (i < 0 || j < 0 || i >= world.size || j >= world.size) return false;
  const t = j * world.size + i;
  return world.road[t] !== 0 || world.build[t] >= 0;
}

/** Light on a slope: surfaces rising toward the back-left face the sun. */
function slopeLight(): number {
  const f = ((corner[0] - corner[2]) + (corner[3] - corner[1])) * .5;
  return Math.max(.72, Math.min(1.22, 1 + f * .1));
}

/** The cliff walls under the two front edges of a tile (where a neighbour is lower). */
function drawWalls(i: number, j: number, avg: number, t: number): void {
  const n = world.size;
  const ex = tdx + HW, ey = tsy + HH - corner[1] * PXH, sx2 = tdx, wx = tdx - HW, wy = tsy + HH - corner[3] * PXH, bottom = tsy + 2 * HH;
  if (i + 1 < n) {
    const c1 = corner[1], c2 = corner[2];
    cornersOf(i + 1, j); const a = corner[0], b = corner[3]; cornersOf(i, j);
    if (c1 > a + .01 || c2 > b + .01) quad(ex, ey, sx2, bottom - c2 * PXH, sx2, bottom - b * PXH, ex, tsy + HH - a * PXH, darken(wallColor(avg, t), .78), .3);
  }
  if (j + 1 < n) {
    const c3 = corner[3], c2 = corner[2];
    cornersOf(i, j + 1); const a = corner[0], b = corner[1]; cornersOf(i, j);
    if (c3 > a + .01 || c2 > b + .01) quad(wx, wy, sx2, bottom - c2 * PXH, sx2, bottom - b * PXH, wx, tsy + HH - a * PXH, darken(wallColor(avg, t), .92), .3);
  }
}
/** A few tufts, flowers, reeds and the game trail: the grain of the grass. */
function drawGrain(t: number, avg: number): void {
  const k = hash(t, 12), by0 = tsy + HH - avg * PXH;
  if (k < .5) blobAt(tdx + (hash(t, 13) - .5) * 30, by0 + (hash(t, 14) - .5) * 14, 2.5, 1.1, shade([60, 92, 52], .9 + k * .4), 110);
  const deco = world.deco[t];
  if (deco === 1 || deco === 2) {
    if (flowerShare(world.biome[t], monthStep()) > hash(t, 9)) for (let q = 0; q < 4; q++) blobAt(tdx + (hash(t, q + 20) - .5) * 26, by0 + (hash(t, q + 30) - .5) * 12, 1.3, 1, q % 2 === 0 ? 0xf6eee0 : 0xe8c868);
  } else if (deco === 4) patch(.15, .15, .85, .85, shade([150, 118, 80], .85 + hash(t, 8) * .2));
  else if (deco === 3) {
    const r = reedColor(monthStep());
    for (let q = 0; q < 5; q++) { const bx = tdx + (hash(t, q + 40) - .5) * 28, by = by0 + (hash(t, q + 50) - .5) * 12; tri(bx - 1, by, bx + 1, by, bx + (q - 2) * .6, by - 9 - hash(t, q) * 4, shade(r, .9 + q * .05)); }
  }
}
/** The road of a tile: an edge, then the surface, with an arm toward each neighbour that is a road or a building. */
function drawRoad(i: number, j: number, t: number): void {
  const rc = shade(ROAD_COLOR, .86 + hash(t, 15) * .12), edge = shade(ROAD_COLOR, .66);
  const e = isRoadish(i + 1, j), w = isRoadish(i - 1, j), so = isRoadish(i, j + 1), no = isRoadish(i, j - 1);
  patch(.2, .2, .8, .8, edge);
  if (e) patch(.8, .2, 1.02, .8, edge);
  if (w) patch(-.02, .2, .2, .8, edge);
  if (so) patch(.2, .8, .8, 1.02, edge);
  if (no) patch(.2, -.02, .8, .2, edge);
  patch(.26, .26, .74, .74, rc);
  if (e) patch(.74, .26, 1.02, .74, rc);
  if (w) patch(-.02, .26, .26, .74, rc);
  if (so) patch(.26, .74, .74, 1.02, rc);
  if (no) patch(.26, -.02, .74, .26, rc);
}
/** Far levels: the static things are painted into the ground (no sprites). */
function drawFar(t: number, avg: number): void {
  const cx = tdx, cy = tsy + HH - avg * PXH;
  if (world.rock[t] > 0) blobAt(cx, cy - 4, 8, 6, 0x85837a);
  if (world.tree[t] > 0) { blobAt(cx, cy - 12, 11, 12, 0x2c5a34); blobAt(cx - 3, cy - 17, 6, 6, 0x4a7c44); }
  if (world.build[t] >= 0) {
    quad(cx - 24, cy, cx, cy + 12, cx, cy - 8, cx - 24, cy - 20, shade(STONE, .78), 0);
    quad(cx, cy + 12, cx + 24, cy, cx + 24, cy - 20, cx, cy - 8, shade(STONE, .9), 0);
    quad(cx - 26, cy - 20, cx, cy - 8, cx + 26, cy - 20, cx, cy - 36, shade([176, 104, 76], 1), 0);
  }
}
function drawTile(i: number, j: number, s: number, d: number, far: boolean): void {
  const n = world.size, t = j * n + i;
  if (world.terrain[t] === TERRAIN_VOID) return;
  cornersOf(i, j);
  tdx = d * HW; tsy = s * HH;
  const water = world.terrain[t] === TERRAIN_WATER;
  const avg = (corner[0] + corner[1] + corner[2] + corner[3]) / 4;
  if (!water || avg > 0) drawWalls(i, j, avg, t);
  const c0 = corner[0], c1 = corner[1], c2 = corner[2], c3 = corner[3];
  if (water) {
    quad(tdx, tsy - c0 * PXH, tdx + HW, tsy + HH - c1 * PXH, tdx, tsy + 2 * HH - c2 * PXH, tdx - HW, tsy + HH - c3 * PXH, shade(WATER_TONES[1 + ((hash(t, 4) * 2) | 0)], .9 + hash(t, 6) * .16), .7);
    if (hash(t, 77) < .35) blobAt(tdx + (hash(t, 78) - .5) * 30, tsy + HH + (hash(t, 79) - .5) * 12, 6, 1.4, shade(WATER_TONES[3], 1.05), 120);
    return;
  }
  quad(tdx, tsy - c0 * PXH, tdx + HW, tsy + HH - c1 * PXH, tdx, tsy + 2 * HH - c2 * PXH, tdx - HW, tsy + HH - c3 * PXH, groundColor(t, slopeLight(), avg), .7);
  if (!far && avg < 6.5) drawGrain(t, avg);
  if (world.build[t] >= 0 || t === world.gate) patch(.08, .08, .92, .92, shade(ROAD_COLOR, .78));
  if (world.road[t] !== 0) drawRoad(i, j, t);
  if (far) drawFar(t, avg);
}
function wallColor(avg: number, t: number): number {
  return avg >= 9 ? shade(ROCK_HIGH, 1) : avg >= 5 ? shade(ROCK_LOW, 1) : shade([132, 104, 76], 1 + (hash(t, 2) - .5) * .1);
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
  }
  const target = r.ready ? r.back : r.img;
  beginImage(target);
  if (first) clear(BG);
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
  endImage();
  r.s = s; r.acc = acc; r.started = true;
  const ms = performance.now() - t0;
  stats.bakeMs += ms; if (ms > stats.bakeMax) stats.bakeMax = ms;
  if (s <= r.sMax) return false;
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
  for (const r of regions) { if (r.img >= 0) free.push(r.img); if (r.back >= 0) free.push(r.back); }
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
  index.delete(r.id); regions.splice(worst, 1);
}
function drawRegion(r: Region, under: boolean): void {
  const sp = span(r.lod), z = cam.zoom;
  const xc = (cam.ci - cam.cj) * HW, yc = (cam.ci + cam.cj) * HH;
  const x0 = Math.floor(view.x + view.w / 2 + (r.rx * sp - xc) * z), x1 = Math.floor(view.x + view.w / 2 + ((r.rx + 1) * sp - xc) * z);
  const y0 = Math.floor(view.y + view.h / 2 + (r.ry * sp - yc) * z), y1 = Math.floor(view.y + view.h / 2 + ((r.ry + 1) * sp - yc) * z);
  if (x1 < view.x || x0 > view.x + view.w || y1 < view.y || y0 > view.y + view.h) return;
  drawImageRect(r.img, MARGIN, MARGIN, SIZE, SIZE, x0, y0, x1 - x0, y1 - y0, 255, 0);
  stats.quads++;
}
