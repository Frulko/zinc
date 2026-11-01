import {
  W, H, S, pix, zb, groundZ, kinds, bakedPix, bakedZ, shadowMask, pendingShadows, staticShadow, GRASS,
  copyInto, flushShadows, applyShadows, shadeEdgesRect, setTrackShadows, shadowSpans, rgbColor, rgb, clamp, hash, project, drawDots, haloDots, drawArrow, waterPoint, KIND_GRASS,
} from '../pixel';
import { TILE, HOUSE, ROLE_FISHER } from '../constants';
import { world, tileX, tileY, waterField, Building } from '../world/world';
import { TERRAIN_WATER } from '../constants';
import { economy } from '../world/economy';
import { isNight } from '../rules/needs';
import { tufts, bakeCount, bakeInfo, shiftColors } from './scenery';
import { settings } from '../settings';
import { focus } from './focus';
import { appealMarks, drawMarks, bubbleColor, drawBubble } from './overlay';
import { ST_SLEEP } from '../constants';
import { models, MODEL_HOUSE } from './models';
import { camera, ZOOM_VIEW } from './camera';
import { computeHints, Hint } from '../rules/hints';
import { drainFx, fxDirty, drawFxBodies, drawFxSparks, drawSmoke, drawGlow } from './fx';
import { beesDirty, drawBees } from './bees';
import { fireDirty, drawFire } from './fire';
import { drawPerson, drawDeer, actorAtlas } from './actors';

const GRASS_LIT = GRASS.map((c: number[]): u32 => rgbColor(c));
const GRASS_DARK = GRASS.map((c: number[]): u32 => rgb(c[0] * .54, c[1] * .52, c[2] * .72));
const FOAM = rgb(143, 177, 146), PEBBLE = rgb(77, 139, 122);
const OK = rgb(255, 214, 10), BAD = rgb(214, 84, 70);
// Attention hints: a bobbing arrow over the tile, red for the severe, yellow, then teal. At most six, none in the far zoom-out levels (they would be specks).
const ARROW_COLORS: u32[] = [rgb(120, 190, 200), rgb(120, 190, 200), rgb(255, 214, 10), rgb(214, 84, 70), rgb(255, 255, 255)];
const ARROWS_MAX = 6, ARROWS_MAX_VIEW = 1.5, BUBBLES_MAX = 14;
const ROOF: number[] = [2.9, 2.4, 2.8, 2.0];     // height of each building type's model (arrow tip sits above); other types use ROOF_DEFAULT
const ROOF_DEFAULT = 2.7, GATE_TOP = 2.6;
function arrowTop(tile: number): { x: number; y: number; z: number } {
  const id = world.build[tile];
  return { x: tileX(tile), y: tileY(tile), z: (tile === world.gate && id < 0 ? GATE_TOP : id < 0 ? 1 : world.buildings[id].type < ROOF.length ? ROOF[world.buildings[id].type] : ROOF_DEFAULT) + .3 };
}
/** Whether a building shows its smoke and lights: a house with people in it, a workshop with workers. */
const lit = (b: Building): boolean => b.alive && (b.type === HOUSE ? b.residents > 0 : b.workers > 0);

/** Pixels the wind redrew this frame, as one-pixel runs (row, column, column): put back from the static picture at the next frame. */
const touched: number[] = [];
function drawTufts(time: number): void {
  for (const i of tufts) {
    const ix = i % W, iy = Math.floor(i / W), phase = ix * .11 + iy * .19;
    const gust = Math.sin(time * .8 + phase) + .5 * Math.sin(time * 2.1 + phase * 2.3);
    const colors = staticShadow[i] ? GRASS_DARK : GRASS_LIT, height = 1 + (hash(ix, iy * 2) * 3 | 0);
    for (let k = 1; k <= height; k++) {
      const jx = ix + Math.round(gust * .95 * k / 3), j = (iy - k) * W + jx;
      if (jx < 0 || jx >= W || iy - k < 0 || (kinds[j] !== KIND_GRASS && kinds[j] !== 0) || zb[j] !== groundZ[j]) continue;
      pix[j] = colors[clamp(1 + k + (gust > 1 ? 1 : 0), 1, 4)];
      touched.push(iy - k, jx, jx);
    }
  }
}

/** Slow glints on the pond: positions drift with time, so the water breathes without renewing noise everywhere. */
function drawPond(time: number): void {
  if (world.pondR < .1) return;                                   // no pond on this map
  for (let k = 0; k < 90; k++) {
    const a = hash(k, 21) * 6.283, r = Math.sqrt(hash(k, 22)) * world.pondR * .85;
    const drift = (time * (.08 + hash(k, 23) * .12)) % 1;
    waterPoint(world.pondX + Math.cos(a) * r + drift * .4, world.pondY + Math.sin(a) * r * .9, hash(k, 24) > .4 ? FOAM : PEBBLE);
  }
}

/** The water tiles that are not the pond (river, sea): found again when the village changes. */
let streamFor: number[] = [], stream: number[] = [];
function streamTiles(): number[] {
  if (streamFor === world.terrain) return stream;
  streamFor = world.terrain; stream = [];
  for (let t = 0; t < world.terrain.length; t++) if (world.terrain[t] === TERRAIN_WATER && waterField(tileX(t), tileY(t)) >= 1) stream.push(t);
  return stream;
}
/** The same slow glints on every river and sea tile in view: two per tile, drifting. */
function drawStream(time: number, rects: number[] | null): void {
  for (const t of streamTiles()) {
    const c = project(tileX(t), tileY(t), 0);
    if (c.sx < -TILE * S || c.sx > W + TILE * S || c.sy < -TILE * S || c.sy > H + TILE * S) continue;
    if (rects !== null) { addRect(rects, c.sx, c.sy, TILE * S, TILE * S * .6, TILE * S, TILE * S * .6); continue; }
    for (let k = 0; k < 2; k++) {
      const drift = (time * (.08 + hash(t, k + 23) * .12)) % 1;
      waterPoint(tileX(t) + (hash(t, k + 21) - .5) * TILE * .8 + drift * .4, tileY(t) + (hash(k + 22, t) - .5) * TILE * .8, hash(t, k + 24) > .4 ? FOAM : PEBBLE);
    }
  }
}

function outline(t: number, color: u32): void {
  const x0 = tileX(t) - TILE / 2, y0 = tileY(t) - TILE / 2, points: number[][] = [];
  for (let k = 0; k <= 20; k++) {
    const a = k / 20 * TILE;
    for (const [x, y] of [[x0 + a, y0], [x0 + a, y0 + TILE], [x0, y0 + a], [x0 + TILE, y0 + a]]) { const p = project(x, y, .02); points.push([p.sx, p.sy]); }
  }
  haloDots(points); drawDots(points, color);
}

// The picture is built once per static bake (the ground, trees, rocks and buildings with their shadows and edges: `edgedPix`), then each frame only the parts
// that move are put back and redrawn: rectangles around the people, deer, smoke, pond and pointer (restored from the unedged bake, drawn, edges redone), and runs
// of pixels for the wind and the moving shadows (restored from `edgedPix`). The cost follows what moves, not the size of the window.
let seenBake = -1;
let edgedPix: u32[] = [];
let prevRects: number[] = [];      // x0, y0, x1, y1 (x1, y1 excluded), four numbers each
let prevLoose: number[] = [];      // runs: row, first column, last column
/** What the scene must send to the screen: everything, or only these runs. */
export const frameDirty = { full: true, spans: [] as number[] };

function addRect(list: number[], sx: number, sy: number, left: number, up: number, right: number, down: number): void {
  const x0 = Math.max(0, Math.floor(sx - left) - 2), y0 = Math.max(0, Math.floor(sy - up) - 2), x1 = Math.min(W, Math.ceil(sx + right) + 3), y1 = Math.min(H, Math.ceil(sy + down) + 3);
  if (x1 > x0 && y1 > y0) list.push(x0, y0, x1, y1);
}
/** Overlapping rectangles become one, so no pixel is restored or edged twice. */
function merge(rects: number[]): number[] {
  const out: number[] = [];
  for (let k = 0; k < rects.length; k += 4) {
    let x0 = rects[k], y0 = rects[k + 1], x1 = rects[k + 2], y1 = rects[k + 3], again = true;
    while (again) {
      again = false;
      for (let m = 0; m < out.length; m += 4) {
        if (out[m] >= x1 || out[m + 2] <= x0 || out[m + 1] >= y1 || out[m + 3] <= y0) continue;
        x0 = Math.min(x0, out[m]); y0 = Math.min(y0, out[m + 1]); x1 = Math.max(x1, out[m + 2]); y1 = Math.max(y1, out[m + 3]);
        out.splice(m, 4); again = true; break;
      }
    }
    out.push(x0, y0, x1, y1);
  }
  return out;
}
function restore(spans: number[]): void {
  for (let k = 0; k < spans.length; k += 3) for (let i = spans[k] * W + spans[k + 1], end = spans[k] * W + spans[k + 2]; i <= end; i++) pix[i] = edgedPix[i];
}
function rectRows(rects: number[], into: number[]): void {
  for (let k = 0; k < rects.length; k += 4) for (let y = rects[k + 1]; y < rects[k + 3]; y++) into.push(y, rects[k], rects[k + 2] - 1);
}

/** The static picture with its edges, kept for the frames that follow: made whole after a full bake, else only the rectangles the bake redid (the rest slides with the camera). */
function prepare(): void {
  const whole = bakeInfo.full || edgedPix.length !== pix.length;
  if (edgedPix.length !== pix.length) edgedPix = Array.from({ length: pix.length }, (): u32 => 0);
  copyInto(zb, bakedZ);
  if (whole) { copyInto(pix, bakedPix); shadeEdgesRect(0, 0, W, H); copyInto(edgedPix, pix); }
  else {
    if (bakeInfo.shiftX !== 0 || bakeInfo.shiftY !== 0) shiftColors(edgedPix, bakeInfo.shiftX, bakeInfo.shiftY);
    for (let k = 0; k < bakeInfo.rects.length; k += 4) {
      const x0 = bakeInfo.rects[k], y0 = bakeInfo.rects[k + 1], x1 = bakeInfo.rects[k + 2], y1 = bakeInfo.rects[k + 3];
      for (let y = y0; y < y1; y++) for (let i = y * W + x0, end = y * W + x1; i < end; i++) pix[i] = bakedPix[i];
      shadeEdgesRect(x0, y0, x1, y1);
      for (let y = y0; y < y1; y++) for (let i = y * W + x0, end = y * W + x1; i < end; i++) edgedPix[i] = pix[i];
    }
    copyInto(pix, edgedPix);
  }
  bakeInfo.consumed = true;
  seenBake = bakeCount; prevRects = []; prevLoose = []; frameDirty.full = true;
}

/** One picture of the village. `hover` is the tile under the pointer (-1 for none), `preview` the model to ghost on it (-1 for none). */
export function drawVillage(time: number, hover: number, ok: boolean, preview: number): void {
  if (seenBake !== bakeCount || edgedPix.length !== pix.length) prepare();
  const dirty: number[] = [], night = isNight();
  for (const p of world.people) { const a = project(p.x, p.y, 0); addRect(dirty, a.sx, a.sy, (p.role === ROLE_FISHER ? 3.4 : 2.2) * S, 4.4 * S, (p.role === ROLE_FISHER ? 3.4 : 2.2) * S, 2.4 * S); }
  for (const d of world.deer) { const a = project(d.x, d.y, 0); addRect(dirty, a.sx, a.sy, 2.2 * S, 3.2 * S, 2.2 * S, 1.4 * S); }
  if (settings.fx) for (const b of world.buildings) {
    if (!lit(b)) continue;
    const def = economy.buildings[b.type], t = b.j * world.size + b.i;
    for (const s of def.smoke) { const a = project(tileX(t) + s[0], tileY(t) + s[1], s[2] + 1.2); addRect(dirty, a.sx, a.sy, 1.6 * S, 2.4 * S, 1.6 * S, 2.4 * S); }
    if (night) for (const s of def.glow) { const a = project(tileX(t) + s[0], tileY(t) + s[1], s[2]); addRect(dirty, a.sx, a.sy, .5 * S, .5 * S, .5 * S, .5 * S); }
  }
  if (hover >= 0) { const a = project(tileX(hover), tileY(hover), 0); addRect(dirty, a.sx, a.sy, 2 * TILE * S, 5 * S, 2 * TILE * S, 1.2 * TILE * S); }
  beesDirty((sx: number, sy: number, l: number, u: number, r: number, d: number): void => addRect(dirty, sx, sy, l, u, r, d), S);
  fireDirty((sx: number, sy: number, l: number, u: number, r: number, d: number): void => addRect(dirty, sx, sy, l, u, r, d), S);
  drainFx(time);
  fxDirty((sx: number, sy: number, l: number, u: number, r: number, d: number): void => addRect(dirty, sx, sy, l, u, r, d), S);
  if (world.pondR >= .1) { const pond = project(world.pondX + .2, world.pondY, 0); addRect(dirty, pond.sx, pond.sy, world.pondR * S * 1.5, world.pondR * S * .8, world.pondR * S * 1.5, world.pondR * S * .8); }
  drawStream(0, dirty);
  const hints: Hint[] = settings.hints && ZOOM_VIEW[camera.level] <= ARROWS_MAX_VIEW ? computeHints().slice(0, ARROWS_MAX) : [];
  const arrowAt: number[] = [];                                   // sx, sy, colour of each arrow
  for (const h of hints) {
    const top = arrowTop(h.tile), a = project(top.x, top.y, top.z);
    if (a.sx < -8 || a.sx > W + 8 || a.sy < -4 || a.sy > H + 20) continue;
    arrowAt.push(a.sx, a.sy, h.severity);
    addRect(dirty, a.sx, a.sy, 9, 18, 9, 4);
  }
  if (focus.tile >= 0) {                                          // the tile a message pointed at: a white arrow, shown at every zoom
    const top = arrowTop(focus.tile), a = project(top.x, top.y, top.z);
    if (a.sx >= -8 && a.sx <= W + 8 && a.sy >= -4 && a.sy <= H + 20) { arrowAt.push(a.sx, a.sy, 4); addRect(dirty, a.sx, a.sy, 9, 18, 9, 4); }
  }
  const bubbleAt: number[] = [];                                  // sx, sy, colour of each thought bubble: the people who are not content, at most BUBBLES_MAX, in the near zoom levels only
  if (settings.thoughts && ZOOM_VIEW[camera.level] <= ARROWS_MAX_VIEW) for (const p of world.people) {
    const c = bubbleColor(p.feel);
    if (c === 0 || p.state === ST_SLEEP || bubbleAt.length >= BUBBLES_MAX * 3) continue;
    const a = project(p.x, p.y, 1.95);
    if (a.sx < -8 || a.sx > W + 8 || a.sy < -4 || a.sy > H + 20) continue;
    bubbleAt.push(a.sx, a.sy, c);
    addRect(dirty, a.sx, a.sy, 6, 12, 6, 6);
  }
  const marks = settings.appeal ? appealMarks() : [];            // the desirability overlay
  for (let k = 0; k < marks.length; k += 4) addRect(dirty, marks[k], marks[k + 1], 3, 3, 3, 3);
  const rects = merge(prevRects.concat(dirty));
  const rows: number[] = [];
  restore(prevLoose);
  for (let k = 0; k < rects.length; k += 4) for (let y = rects[k + 1]; y < rects[k + 3]; y++) for (let i = y * W + rects[k], end = y * W + rects[k + 2]; i < end; i++) { pix[i] = bakedPix[i]; zb[i] = bakedZ[i]; }
  rectRows(rects, rows);
  touched.length = 0;
  pendingShadows.length = 0;
  if (settings.shadows) setTrackShadows(true); else { setTrackShadows(false); shadowMask.fill(0); }
  drawTufts(time * settings.wind); drawPond(time * settings.wind); drawStream(time * settings.wind, null);
  const loose: number[] = touched.slice();
  const atlas = settings.atlas ? actorAtlas() : null;
  for (const d of world.deer) drawDeer(d, time, atlas);
  for (const p of world.people) drawPerson(p, time, atlas);
  drawFxBodies(time);
  drawBees(time);
  if (preview >= 0 && hover >= 0 && Math.floor(time * 3) % 2 === 0) models[MODEL_HOUSE + preview].drawAt(tileX(hover), tileY(hover), 0);
  if (settings.shadows) { flushShadows(); applyShadows(bakedZ); } else pendingShadows.length = 0;
  if (settings.edges) for (let k = 0; k < rects.length; k += 4) shadeEdgesRect(rects[k], rects[k + 1], rects[k + 2], rects[k + 3]);
  if (settings.fx) for (const b of world.buildings) {
    if (!lit(b)) continue;
    const def = economy.buildings[b.type], t = b.j * world.size + b.i, seed = b.i * 7 + b.j;
    for (const s of def.smoke) drawSmoke(tileX(t) + s[0], tileY(t) + s[1], s[2], time, seed, s.length > 3 ? s[3] : 0);
    if (night) for (const s of def.glow) drawGlow(tileX(t) + s[0], tileY(t) + s[1], s[2], time, seed);
  }
  drawFxSparks(time);
  drawFire(time);
  if (hover >= 0) outline(hover, ok ? OK : BAD);
  drawMarks(marks);
  for (let k = 0; k < bubbleAt.length; k += 3) drawBubble(bubbleAt[k], bubbleAt[k + 1], bubbleAt[k + 2]);
  for (let k = 0; k < arrowAt.length; k += 3) drawArrow(arrowAt[k], arrowAt[k + 1], time, ARROW_COLORS[clamp(arrowAt[k + 2], 0, 4)]);
  // what to send: the pixels restored from last frame's runs, plus every run and rectangle of this one
  const spans = rows.concat(prevLoose).concat(loose).concat(shadowSpans);
  prevLoose = loose.concat(shadowSpans); prevRects = dirty;
  frameDirty.spans = spans;
  setTrackShadows(false);
}
