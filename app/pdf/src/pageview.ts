// The page view: PDFium's picture of the page, the ink over it, and the gestures (Zinc Web's, app/web/src/pageview.ts). Pen: writes
// (its eraser end, or the Eraser tool, erases; on a desktop the mouse writes in Pen mode). Finger: a swipe turns the page (pans when
// zoomed), two fingers pinch to zoom. The picture is scaled while the fingers move and drawn sharp by PDFium when they lift: one e-ink
// refresh per gesture. The wheel turns pages, Ctrl+wheel zooms.
import { rect, drawImageRect, penCount, penX, penY, penPressure, penFlags, PenFlag, touchCount, touchX, touchY,
  pointerX, pointerY, pointerDown, wheel, modifiers, Mod, commandCount } from 'zinc:gfx';
import { view, ink, penMode, onTablet, resize, turn, zoomTo, pan, scale } from './state';
import { MAX_ZOOM } from './constants';

const TAP_SLOP: number = 24;
const SWIPE: number = 120;

let fingers: i32 = 0;            // 0 none, 1 one finger (or the mouse), 2 pinch
let sx: number = 0, sy: number = 0, lx: number = 0, ly: number = 0;
let d0: number = 1, mx: number = 0, my: number = 0, pinch: number = 1;
let penFrames: i32 = 99;          // frames since the last pen sample: the Marker also moves the pointer

/** The picture and the ink: one image while the view stays put, plus the live stroke's new segments (zinc:ink drawOver). */
function draw(x: i32, y: i32, w: i32, h: i32): void {
  if (view.img < 0 || view.doc === null) { rect(x, y, w, h, 0xffffff); return; }
  // the live transform: a pinch scales around its middle, a drag of a zoomed page moves it
  const s0 = scale(), z = s0 * pinch;
  let ox = view.ox, oy = view.oy;
  if (pinch !== 1) { ox += mx / s0 - mx / z; oy += my / s0 - my / z; }
  else if (fingers === 1 && view.zoom > 1) { ox -= (lx - sx) / s0; oy -= (ly - sy) / s0; }
  const k = z / view.iscale;   // the picture is the view at (iox, ioy) and iscale
  ink.drawOver(x, y, w, h, ox, oy, z, view.shot, (_w: i32, _h: i32) => {
    drawImageRect(view.img, 0, 0, view.w, view.h, (view.iox - ox) * z, (view.ioy - oy) * z, view.w * k, view.h * k);
  });
}

/** One pen sample at (vx, vy) of the view, into page points; the test script writes through it too. */
export function feedPen(vx: number, vy: number, pressure: number, flags: i32): void {
  const s = scale();
  ink.feed(view.ox + vx / s, view.oy + vy / s, pressure, flags);
}

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

function fingersInput(x: number, y: number, w: number, h: number): void {
  const t = touchCount();
  if (t >= 2) {
    const ax = touchX(0) - x, ay = touchY(0) - y, bx = touchX(1) - x, by = touchY(1) - y;
    const d = Math.max(1, Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by)));
    if (fingers !== 2) { fingers = 2; d0 = d; mx = (ax + bx) / 2; my = (ay + by) / 2; }
    pinch = Math.max(1 / view.zoom, Math.min(MAX_ZOOM / view.zoom, d / d0));
    return;
  }
  if (fingers === 2) {   // the pinch ends when the fingers lift
    if (t === 0) { const p = pinch; pinch = 1; fingers = 0; zoomTo(view.zoom * p, mx, my); }
    return;
  }
  const writing = penFrames < 3 || ink.live !== null || (!onTablet && penMode());
  const down = pointerDown() && !writing;
  const px = pointerX() - x, py = pointerY() - y;
  if (down && fingers === 0) {
    if (px < 0 || py < 0 || px >= w || py >= h) return;
    fingers = 1; sx = px; sy = py; lx = px; ly = py;
    return;
  }
  if (down && fingers === 1) { lx = px; ly = py; return; }
  if (!down && fingers === 1) {
    fingers = 0;
    const dx = lx - sx, dy = ly - sy;
    if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) return;
    if (view.zoom > 1) { pan(dx, dy); return; }
    if (Math.abs(dy) >= Math.abs(dx) ? Math.abs(dy) > SWIPE : Math.abs(dx) > SWIPE) turn((Math.abs(dy) >= Math.abs(dx) ? dy : dx) < 0 ? 1 : -1);
  }
}

function wheelInput(x: number, y: number): void {
  const s = wheel();
  if (s === 0) return;
  if ((modifiers() & Mod.Ctrl) !== 0 || (modifiers() & Mod.Meta) !== 0) zoomTo(view.zoom * (s > 0 ? 1.25 : 0.8), pointerX() - x, pointerY() - y);
  else turn(s > 0 ? -1 : 1);
}

/** The Canvas onDraw of the page view. */
export function pageView(x: i32, y: i32, w: i32, h: i32): void {
  resize(w, h);
  pen(x, y, w, h);
  fingersInput(x, y, w, h);
  wheelInput(x, y);
  const c0 = commandCount();
  draw(x, y, w, h);
  if (ink.live !== null) penCmds = Math.max(penCmds, commandCount() - c0);
}
let penCmds: i32 = 0;   // the most draw commands of a frame while the pen writes (the test script's `write`)
export function penCommands(): i32 { return penCmds; }

/** The Canvas onDraw of the page strip: the document as a bar, the page as a block. A finger on it moves the block; the page under it
 *  opens when the finger lifts (one page drawn, one refresh). */
export function pageStrip(x: i32, y: i32, w: i32, h: i32, go: (page: i32) => void): void {
  rect(x, y, w, h, 0xffffff);
  const n = view.count;
  if (n <= 0) return;
  const down = pointerDown() && penFrames >= 3;
  const px = pointerX() - x, py = pointerY() - y;
  if (down && (stripPage >= 0 || (px >= 0 && py >= 0 && px < w && py < h))) stripPage = Math.max(0, Math.min(n - 1, Math.floor(px / w * n))) as i32;
  else if (!down && stripPage >= 0) { const p = stripPage; stripPage = -1; if (p !== view.page) go(p); }
  const shown = stripPage >= 0 ? stripPage : view.page;
  rect(x, y + h / 2 - 2, w, 4, 0x000000);
  const bw = Math.max(24, w / n), bx = x + (w - bw) * (n === 1 ? 0 : shown / (n - 1));
  rect(bx, y + 8, bw, h - 16, 0x000000);
}
let stripPage: i32 = -1;   // the page under the finger while it is on the strip
