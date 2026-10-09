// Drawing helpers over zinc:gfx: bitmap fonts, alpha-mask icons and the pixel-exact frames. No UI tree, so a screen
// costs no heap: the same code drives SDL, the Linux panel and an ESP32 LCD.
import { font, textWidth, drawText, image, drawImage, clip, unclip, rect } from 'zinc:gfx';
import { BLACK, WHITE, SCROLL_X, SCROLL_Y, SCROLL_H } from './theme';

// The three pixel fonts rasterise without partial coverage at 16 px only.
export let TITLE: i32 = -1;   // HaxrCorp 4090: status bar, idle screen, breadcrumbs
export let ROW: i32 = -1;     // Busy9px: menu labels and statuses
export let ROW_ACTIVE: i32 = -1;  // Born2bSporty: the selected label

const images = new Map<string, i32>();

export function initPanel(): void {
  TITLE = font('HaxrCorp', 16);
  ROW = font('Busy9px', 16);
  ROW_ACTIVE = font('Born2bSporty', 16);
}

export function text(f: i32, x: i32, y: i32, s: string, color: u32): void {
  drawText(f, x, y, s, color, 255, 0);
}
/** The prototype's textWidth: the sum of the advances minus the trailing spacing column. */
export function tw(f: i32, s: string): i32 {
  return Math.round(textWidth(f, s, 0)) - 1;
}
export function textRight(f: i32, right: i32, y: i32, s: string, color: u32): void {
  text(f, right - tw(f, s), y, s, color);
}
export function textCentre(f: i32, x: i32, w: i32, y: i32, s: string, color: u32): void {
  text(f, x + Math.floor((w - tw(f, s)) / 2), y, s, color);
}

function img(name: string): i32 {
  if (images.has(name)) return images.get(name) as i32;
  const id = image(name);
  images.set(name, id);
  return id;
}
/** An icon from assets/icons: `ink` picks the black or the white copy (zinc:ui images have no tint). */
export function icon(name: string, x: i32, y: i32, w: i32, h: i32, ink: u32): void {
  drawImage(img('icons/' + name + (ink === WHITE ? '-w.png' : '-k.png')), x, y, w, h, 255, 0);
}
/** The bolt is a real greyscale image, not a mask. */
export function bolt(x: i32, y: i32): void {
  drawImage(img('icons/charging_status_bar.png'), x, y, 16, 9, 255, 0);
}
/** One frame of a vertical strip of square-ish frames. */
export function strip(name: string, x: i32, y: i32, w: i32, h: i32, frames: i32, frame: i32, ink: u32): void {
  clip(x, y, w, h);
  drawImage(img('icons/' + name + (ink === WHITE ? '-w.png' : '-k.png')), x, y - frame * h, w, h * frames, 255, 0);
  unclip();
}

/** MenuSelectorFrame: a chamfered rectangle with 45 degree corners of radius r, optionally a drop shadow. */
export function frame(x: i32, y: i32, w: i32, h: i32, r: i32, fill: boolean, stroke: boolean, shadow: boolean): void {
  if (fill) {
    rect(x, y + r, w, h - 2 * r, BLACK);
    for (let i = 0; i < r; i++) {
      const inset = r - 1 - i;
      rect(x + inset, y + i, w - 2 * inset, 1, BLACK);
      rect(x + inset, y + h - 1 - i, w - 2 * inset, 1, BLACK);
    }
  }
  if (!stroke) return;
  rect(x + r, y, w - 2 * r, 1, BLACK);
  rect(x + r, y + h - 1, w - 2 * r, 1, BLACK);
  rect(x, y + r, 1, h - 2 * r, BLACK);
  rect(x + w - 1, y + r, 1, h - 2 * r, BLACK);
  for (let i = 0; i < r; i++) {
    rect(x + i, y + r - 1 - i, 1, 1, BLACK);
    rect(x + w - r + i, y + i, 1, 1, BLACK);
    rect(x + i, y + h - r + i, 1, 1, BLACK);
    rect(x + w - r + i, y + h - 1 - i, 1, 1, BLACK);
  }
  if (!shadow) return;
  rect(x + r, y + h, w - r - 2, 1, BLACK);
  rect(x + w, y + r, 1, h - r - 2, BLACK);
  rect(x + w - 2, y + h - 1, 1, 1, BLACK);
  rect(x + w - 1, y + h - 2, 1, 1, BLACK);
}

/** Dotted 1 px track over its full range with a 3 px thumb (UI.Scrollbar); only when more than a viewport of rows. */
export function drawScrollbar(total: i32, visible: i32, offset: i32): void {
  if (total <= visible) return;
  const range = SCROLL_H - 2;
  for (let d = 0; d * 2 < SCROLL_H; d++) rect(SCROLL_X, SCROLL_Y + d * 2, 1, 1, BLACK);
  const thumb = Math.max(5, Math.round(range * visible / total));
  rect(SCROLL_X - 1, SCROLL_Y + 1 + Math.round((range - thumb) * offset / (total - visible)), 3, thumb, BLACK);
}
