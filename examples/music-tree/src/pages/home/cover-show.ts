// ============================================================================
// pages/home/cover-show.ts — The clock face where the cover moves slowly
// ============================================================================
// Five slow scenes one after the other, with the hour floating over them. Nothing here waits or loads: `seconds` alone says what shows.

import { drawImageRect, imageHeight, imageWidth } from 'zinc:gfx';

const SCENE_SECONDS = 20;
const SCENE_COUNT: i32 = 5;
const ENTRANCE = 0.2;   // the share of a scene spent arriving, and the same to leave

function smooth(x: number): number {
  const clamped = Math.max(0, Math.min(1, x));
  return clamped * clamped * (3 - 2 * clamped);
}
function lerp(from: number, to: number, x: number): number {
  return from + (to - from) * x;
}

/** The cover centred on (x, y) at `side` pixels, `squash` being the share of its width still showing (a turn seen from the side). */
function drawCover(image: i32, x: number, y: number, side: number, alpha: number, rotation: number = 0, squash: number = 1, tint: u32 = 0xffffff): void {
  const shownWidth = side * squash;
  drawImageRect(image, 0, 0, imageWidth(image), imageHeight(image), x - shownWidth / 2, y - side / 2, shownWidth, side, Math.round(alpha * 255) as i32, 0, rotation, tint);
}

/** Comes in from one side, tilted, drawing nearer as it straightens. */
function sceneApproach(image: i32, w: number, h: number, p: number): void {
  const shown = smooth(p / ENTRANCE) * smooth((1 - p) / ENTRANCE);
  const glide = smooth(p);
  const side = Math.min(w, h) * lerp(0.62, 0.86, p);
  drawCover(image, w / 2 + lerp(-110, 70, glide), h / 2 + lerp(26, -18, glide), side, shown, lerp(-0.05, 0.025, glide));
}

/** The whole screen is the cover, seen too close: the camera travels across it (Ken Burns), a little dimmed for the hour to read. */
function sceneTravel(image: i32, w: number, h: number, p: number): void {
  const shown = smooth(p / ENTRANCE) * smooth((1 - p) / ENTRANCE);
  const side = Math.max(w, h) * lerp(1.18, 1.42, p);
  const roomX = (side - w) / 2;
  const roomY = (side - h) / 2;
  drawCover(image, w / 2 + lerp(roomX, -roomX, p) * 0.8, h / 2 + lerp(-roomY, roomY, p) * 0.8, side, shown, 0, 1, 0x9a9a9a);
}

/** Turns over as it arrives and as it leaves, like a record sleeve, and breathes in between. */
function sceneTurn(image: i32, w: number, h: number, p: number): void {
  const arriving = smooth(p / ENTRANCE);
  const leaving = smooth((1 - p) / ENTRANCE);
  const squash = Math.sin((arriving * leaving * Math.PI) / 2);
  if (squash < 0.01) return;
  const side = Math.min(w, h) * (0.74 + 0.05 * Math.sin(p * Math.PI));
  drawCover(image, w / 2 + lerp(-30, 30, p), h / 2, side, 1, 0, squash);
}

/** The cover is cut in tiles that drift in from everywhere, settle one after the other, and part again. */
function sceneTiles(image: i32, w: number, h: number, p: number): void {
  const count: i32 = 4;
  const side = Math.min(w, h) * lerp(0.74, 0.82, p);
  const tile = side / count;
  const sourceTile = imageWidth(image) / count;
  const sourceTileY = imageHeight(image) / count;
  const left = (w - side) / 2;
  const top = (h - side) / 2;
  for (let row: i32 = 0; row < count; row++) {
    for (let column: i32 = 0; column < count; column++) {
      const order = ((column * 7 + row * 5) % 16) / 16;   // each tile its own moment and its own direction, always the same
      const settled = smooth((p - order * 0.14) / ENTRANCE) * smooth((1 - p - (1 - order) * 0.14) / ENTRANCE);
      const away = (1 - settled) * Math.max(w, h) * 0.34;
      const angle = order * Math.PI * 2 + 0.6;
      const gap = (1 - settled) * 3;
      drawImageRect(
        image,
        column * sourceTile,
        row * sourceTileY,
        sourceTile,
        sourceTileY,
        left + column * tile + gap + Math.cos(angle) * away,
        top + row * tile + gap + Math.sin(angle) * away,
        tile - gap * 2 + 0.5,
        tile - gap * 2 + 0.5,
        Math.round(settled * 255) as i32,
        0,
        (1 - settled) * (order - 0.5) * 1.4
      );
    }
  }
}

/** Copies of the cover widen slowly from the centre and fade, like rings in water, around the cover itself. */
function sceneRipples(image: i32, w: number, h: number, p: number): void {
  const shown = smooth(p / ENTRANCE) * smooth((1 - p) / ENTRANCE);
  const base = Math.min(w, h) * 0.66;
  const copies: i32 = 2;   // each copy is a wide see-through layer: the fill rate of a Tegra 3 pays for it
  for (let index: i32 = copies - 1; index >= 0; index--) {
    const wave = (p * 3 + index / copies) % 1;
    drawCover(image, w / 2, h / 2, base * (1 + wave * 0.75), shown * (1 - wave) * (1 - wave) * 0.42);
  }
  drawCover(image, w / 2, h / 2, base * lerp(0.98, 1.06, p), shown);
}

/** Draws the scene of the moment, `seconds` after this song's show started. */
export function drawCoverShow(image: i32, w: number, h: number, seconds: number, roomBelow: number): void {
  const scene = Math.floor(seconds / SCENE_SECONDS) as i32;
  const p = seconds / SCENE_SECONDS - scene;
  const kind = scene % SCENE_COUNT;
  const above = h - roomBelow;   // the card with the controls stays clear of the cover, except where the cover is the whole screen
  if (kind === 0) sceneApproach(image, w, above, p);
  else if (kind === 1) sceneTiles(image, w, above, p);
  else if (kind === 2) sceneTravel(image, w, h, p);
  else if (kind === 3) sceneTurn(image, w, above, p);
  else sceneRipples(image, w, above, p);
}

/** True while the moving cover hides the whole screen: nothing needs drawing under it. */
export function coverHidesScreen(seconds: number): boolean {
  const scene = Math.floor(seconds / SCENE_SECONDS) as i32;
  const p = seconds / SCENE_SECONDS - scene;
  return scene % SCENE_COUNT === 2 && p >= ENTRANCE && p <= 1 - ENTRANCE;
}

/** Where the hour floats: a slow path that never rests, and never crosses the centre where the cover is. */
export function floatingHourOffset(seconds: number): number[] {
  return [Math.sin(seconds / 23) * 22 + Math.sin(seconds / 9) * 5, Math.cos(seconds / 31) * 14];
}
