// The page view: one laid-out page, the ink over it, and the gestures. Pen: writes (on a desktop the mouse writes in Pen mode). Finger:
// a tap follows a link or ticks a task box, a swipe turns the page. Nothing moves while a finger does: one e-ink refresh per gesture.
// The wheel turns pages.
import { rect, line, clip, unclip, drawText, drawImage, stroke, penCount, penX, penY, penPressure, penFlags, PenFlag, pointerX, pointerY,
  pointerDown, wheel } from 'zinc:gfx';
import { Stroke } from 'zinc:ink';
import { doc, ink, penMode, onTablet, version, resize, turn, tapAt } from './state';
import { I_TEXT, I_FILL, I_BOX, I_IMAGE, I_CHECK } from './layout';

const TAP_SLOP: number = 24;
const SWIPE: number = 120;

let down: boolean = false;
let sx: number = 0, sy: number = 0, lx: number = 0, ly: number = 0;
let penFrames: i32 = 99;   // frames since the last pen sample: the Marker also moves the pointer

function draw(x: number, y: number, w: number, h: number): void {
  version();   // the layout's version: a new layout redraws
  rect(x, y, w, h, 0xffffff);
  if (doc.lay.pages.length === 0) return;
  clip(x, y, w, h);
  for (const it of doc.lay.pages[doc.page]) {
    const ix = x + it.x, iy = y + it.y;
    if (it.kind === I_TEXT) drawText(it.font, ix, iy, it.text, it.color, 255, 0);
    else if (it.kind === I_FILL) rect(ix, iy, it.w, it.h, it.color);
    else if (it.kind === I_BOX) {
      line(ix, iy, ix + it.w, iy, 0); line(ix, iy + it.h, ix + it.w, iy + it.h, 0);
      line(ix, iy, ix, iy + it.h, 0); line(ix + it.w, iy, ix + it.w, iy + it.h, 0);
    } else if (it.kind === I_IMAGE) drawImage(it.img, ix, iy, it.w, it.h, 255, 0);
    else if (it.kind === I_CHECK) {
      rect(ix, iy, it.w, it.h, 0x000000);
      rect(ix + 4, iy + 4, it.w - 8, it.h - 8, 0xffffff);
      if (it.on) {
        stroke([ix + it.w * 0.2, iy + it.h * 0.52, ix + it.w * 0.42, iy + it.h * 0.75, ix + it.w * 0.82, iy + it.h * 0.25], 5, 0x000000, 255, false);
      }
    }
  }
  // the ink of this page: document pixels, page k starts k * h down
  const top = doc.page * doc.h;
  for (const s of ink.strokes) {
    if (s.y1 < top || s.y0 > top + h) continue;
    for (let i: i32 = 0; i < s.count(); i++) segment(s, i, x, y - top);
  }
  unclip();
}
function segment(s: Stroke, i: i32, x: number, y: number): void {
  const p = s.pts, a = Math.max(0, i - 1) * 3, b = i * 3;
  stroke([x + p[a], y + p[a + 1], x + p[b], y + p[b + 1]], s.segWidth(i), s.color, 255, false);
}

/** One pen sample at (vx, vy) of the view; the test script writes through it too. */
export function feedPen(vx: number, vy: number, pressure: number, flags: i32): void { ink.feed(vx, vy + doc.page * doc.h, pressure, flags); }

function pen(x: number, y: number, w: number, h: number): void {
  const n = penCount();
  if (n > 0) penFrames = 0; else if (penFrames < 99) penFrames++;
  if (!onTablet && !penMode()) return;
  for (let i: i32 = 0; i < n; i++) {
    const vx = penX(i) - x, vy = penY(i) - y, f = penFlags(i);
    if ((vx < 0 || vy < 0 || vx >= w || vy >= h) && ink.live === null && (f & PenFlag.Down) !== 0) continue;   // strokes start on the page
    feedPen(vx, vy, penPressure(i), f);
  }
}

function finger(x: number, y: number, w: number, h: number): void {
  const writing = penFrames < 3 || ink.live !== null || (!onTablet && penMode());
  const d = pointerDown() && !writing;
  const px = pointerX() - x, py = pointerY() - y;
  if (d && !down) {
    if (px < 0 || py < 0 || px >= w || py >= h) return;
    down = true; sx = px; sy = py; lx = px; ly = py;
    return;
  }
  if (d && down) { lx = px; ly = py; return; }
  if (!d && down) {
    down = false;
    const dx = lx - sx, dy = ly - sy;
    if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) { tapAt(sx, sy); return; }
    if (Math.abs(dy) >= Math.abs(dx) ? Math.abs(dy) > SWIPE : Math.abs(dx) > SWIPE) turn((Math.abs(dy) >= Math.abs(dx) ? dy : dx) < 0 ? 1 : -1);
  }
}

/** The Canvas onDraw of the reading view. */
export function pageView(x: i32, y: i32, w: i32, h: i32): void {
  resize(w, h);
  pen(x, y, w, h);
  finger(x, y, w, h);
  const s = wheel();
  if (s !== 0) turn(s > 0 ? -1 : 1);
  draw(x, y, w, h);
}
