import { rect, border, createImage, destroyImage, updatePixels, drawImageRect, ImageFlag } from 'zinc:gfx';
import { unproject, W, H } from '../pixel';
import { world, heightAt } from '../world/world';
import { TERRAIN_WATER, TERRAIN_VOID, TILE } from '../constants';
import { economy } from '../world/economy';
import { aimAt } from '../view/scenery';
import { settings } from '../settings';
import { citeJump, cornerWorld } from '../cite';
import { rgb } from '../pixel';
import { ui } from './state';
import { col, well } from './kit';

// The overview map of the control column, drawn like the main view: the village as a diamond (two pixels wide, one tall per tile), so the camera window is a plain
// rectangle on it. A click or a drag moves the camera there.
const GRASS = 0x5f7a3f, TREE = 0x2f5a30, WATER = 0x4a7fa6, ROCK = 0x8a8578, ROAD = 0xd8c898, HOUSE = 0xd9694a, WORK = 0xe0b04a, PERSON = 0xfff6db, DEER = 0xb8865a;
const box = { x: 0, y: 0, w: 1, h: 1, scale: 1 };

/** The tile under a pixel of the diamond picture, or -1 outside the village. */
function tileOfPixel(px: number, py: number): number {
  const n = world.size, u = px + .5 - n, v = (py + .5) * 2, i = Math.floor((u + v) / 2), j = Math.floor((v - u) / 2);
  return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i;
}
/** Where a world point falls on the diamond picture, in picture pixels. */
function pictureX(x: number, y: number): number { return world.size + ((x - y) / TILE); }
function pictureY(x: number, y: number): number { return (x + y + 2 * world.half) / TILE / 2; }

/** Brightness of a tile out of 256: light from the north-west on the drop to its west and north neighbours, and a little lighter the higher it stands. 256 on flat ground. */
function hillshade(t: number): number {
  const n = world.size, i = t % n, h = heightAt(t);
  const w = i > 0 ? heightAt(t - 1) : h, u = t >= n ? heightAt(t - n) : h, e = i < n - 1 ? heightAt(t + 1) : h, s = t < n * (n - 1) ? heightAt(t + n) : h;
  return Math.max(150, Math.min(340, 256 + (w + u - e - s) * 18 + h * 5));
}

// The ground is one small picture, redone when the village changed and at most twice a second: a draw call, not a rectangle per tile.
let image: i32 = -1, imageSize = 0, madeAt = -10, madeFor = -1;
function refresh(): void {
  if (image >= 0 && imageSize === world.size && (madeFor === world.revision || ui.time - madeAt < .5)) return;     // redone when the village changed, at most twice a second
  if (image < 0 || imageSize !== world.size) { if (image >= 0) destroyImage(image); image = createImage(2 * world.size, world.size); imageSize = world.size; }
  const px: u32[] = [];
  for (let y = 0; y < world.size; y++) for (let x = 0; x < 2 * world.size; x++) {
    const t = tileOfPixel(x, y);
    if (t < 0) { px.push(0); continue; }
    const terrain = world.terrain[t], id = world.build[t];
    const color = terrain === TERRAIN_VOID ? 0 : terrain === TERRAIN_WATER ? WATER : world.road[t] !== 0 ? ROAD : id >= 0 ? (economy.buildings[world.buildings[id].type].housing !== null ? HOUSE : WORK)
      : world.tree[t] !== 0 ? TREE : world.rock[t] !== 0 ? ROCK : GRASS;
    const shade = color === 0 || color === WATER ? 256 : hillshade(t);
    px.push(color === 0 ? 0 : rgb(Math.min(255, ((color >> 16) & 255) * shade >> 8), Math.min(255, ((color >> 8) & 255) * shade >> 8), Math.min(255, (color & 255) * shade >> 8)));
  }
  updatePixels(image, px, false);
  madeAt = ui.time; madeFor = world.revision;
}

export function minimapContains(x: number, y: number): boolean { return x >= box.x - 3 && y >= box.y - 3 && x < box.x + box.w + 3 && y < box.y + box.h + 3; }
export function minimapClick(x: number, y: number): void {
  const n = world.size, u = (x - box.x) / box.scale - n, v = (y - box.y) / box.scale * 2;
  const wx = ((u + v) / 2) * TILE - world.half, wy = ((v - u) / 2) * TILE - world.half;
  if (settings.view === 'cite') citeJump(wx, wy); else aimAt(wx, wy);
}
/** Draws the map in a well of (size x size) pixels; the picture is centred in it at the largest whole scale. */
export function drawMinimap(x: number, y: number, size: number): void {
  const n = world.size, sc = Math.max(1, Math.floor((size - 6) / (2 * n))), w = 2 * n * sc, h = n * sc, ox = x + Math.floor((size - w) / 2), oy = y + Math.floor((size - h) / 2);
  box.x = ox; box.y = oy; box.w = w; box.h = h; box.scale = sc;
  well(x, y, size, size);
  refresh();
  drawImageRect(image, 0, 0, 2 * n, n, ox, oy, w, h, 255, ImageFlag.Nearest);
  const d = Math.max(2, sc);
  const ps = Math.max(1, Math.floor(world.people.length / 400)), es = Math.max(1, Math.floor(world.deer.length / 400));   // a dot per unit up to a few hundred: a big map would draw thousands of rectangles every frame
  for (let k = 0; k < world.people.length; k += ps) { const p = world.people[k]; rect(ox + pictureX(p.x, p.y) * sc - d / 2, oy + pictureY(p.x, p.y) * sc - d / 2, d, d, PERSON); }
  for (let k = 0; k < world.deer.length; k += es) { const e = world.deer[k]; rect(ox + pictureX(e.x, e.y) * sc - d / 2, oy + pictureY(e.x, e.y) * sc - d / 2, d, d, DEER); }
  // The camera window: a rectangle on this picture (the same projection as the main view), kept inside it.
  const cite = settings.view === 'cite';
  const a = cite ? cornerWorld(0, 0) : unproject(0, 0), b = cite ? cornerWorld(1, 1) : unproject(W, H), c = cite ? cornerWorld(1, 0) : unproject(W, 0), e = cite ? cornerWorld(0, 1) : unproject(0, H);
  let x0 = Math.min(pictureX(a.x, a.y), pictureX(b.x, b.y), pictureX(c.x, c.y), pictureX(e.x, e.y)), x1 = Math.max(pictureX(a.x, a.y), pictureX(b.x, b.y), pictureX(c.x, c.y), pictureX(e.x, e.y));
  let y0 = Math.min(pictureY(a.x, a.y), pictureY(b.x, b.y), pictureY(c.x, c.y), pictureY(e.x, e.y)), y1 = Math.max(pictureY(a.x, a.y), pictureY(b.x, b.y), pictureY(c.x, c.y), pictureY(e.x, e.y));
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(2 * n, x1); y1 = Math.min(n, y1);
  if (x1 > x0 && y1 > y0) {
    const rx = ox + x0 * sc, ry = oy + y0 * sc, rw = (x1 - x0) * sc, rh = (y1 - y0) * sc;
    border(rx - 1, ry - 1, rw + 2, rh + 2, 0, 1, col('stoneDeep'), 255);       // dark outside line, then a light inside line
    border(rx, ry, rw, rh, 0, 1, 0xfff6db, 255);
  }
  rect(x, y, size, 1, col('stoneDeep'));
}
