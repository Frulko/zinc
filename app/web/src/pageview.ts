// The page view: the relay's picture, the ink over it, and the gestures. Pen: writes (on a desktop the mouse writes in Pen mode). Finger:
// a tap follows a link, a swipe turns the page (pans when zoomed), two fingers pinch to zoom. The picture is scaled while a finger
// moves and fetched sharp from the relay when it lifts: one e-ink refresh per gesture. The wheel turns pages, Ctrl+wheel zooms.
import { rect, drawImageRect, penCount, penX, penY, penPressure, penFlags, PenFlag, touchCount, touchX, touchY,
  pointerX, pointerY, pointerDown, wheel, modifiers, Mod } from 'zinc:gfx';
import { view, ink, penMode, onTablet, resize, turn, zoomTo, pan, tapAt } from './state';

const TAP_SLOP: number = 24;
const SWIPE: number = 120;

// gesture state, in view pixels
let fingers: i32 = 0;            // 0 none, 1 one finger (or the mouse), 2 pinch
let sx: number = 0, sy: number = 0, lx: number = 0, ly: number = 0;
let d0: number = 1, mx: number = 0, my: number = 0, scale: number = 1;
let penFrames: i32 = 99;          // frames since the last pen sample: the Marker also moves the pointer

/** The picture and the ink: one image while the view stays put, plus the live stroke's new segments (zinc:ink drawOver). */
function draw(x: i32, y: i32, w: i32, h: i32): void {
  if (view.img < 0) { rect(x, y, w, h, 0xffffff); return; }
  // the live transform: a pinch scales around its middle, a drag of a zoomed page moves it
  const z = view.zoom * scale;
  let ox = view.ox, oy = view.oy;
  if (scale !== 1) { ox += mx / view.zoom - mx / z; oy += my / view.zoom - my / z; }
  else if (fingers === 1 && view.zoom > 1) { ox -= (lx - sx) / view.zoom; oy -= (ly - sy) / view.zoom; }
  ink.drawOver(x, y, w, h, ox, oy, z, view.shot, (_w: i32, _h: i32) => {
    drawImageRect(view.img, 0, 0, view.w, view.h, (view.ix - ox) * z, (view.iy - oy) * z, view.iw * z, view.ih * z);
  });
}

/** Pen samples of this frame: page pixels of the ink. */
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
/** One pen sample at (vx, vy) of the view; the test script writes through it too. */
export function feedPen(vx: number, vy: number, pressure: number, flags: i32): void {
  ink.feed(view.ox + vx / view.zoom, view.oy + vy / view.zoom, pressure, flags);
}

function fingersInput(x: number, y: number, w: number, h: number): void {
  const t = touchCount();
  if (t >= 2) {
    const ax = touchX(0) - x, ay = touchY(0) - y, bx = touchX(1) - x, by = touchY(1) - y;
    const d = Math.max(1, Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by)));
    if (fingers !== 2) { fingers = 2; d0 = d; mx = (ax + bx) / 2; my = (ay + by) / 2; }
    scale = Math.max(1 / view.zoom, Math.min(4 / view.zoom, d / d0));
    return;
  }
  if (fingers === 2) {   // the pinch ends when the fingers lift
    if (t === 0) { const s = scale; scale = 1; fingers = 0; zoomTo(view.zoom * s, mx, my); }
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
    if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) { tapAt(sx, sy); return; }
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
  draw(x, y, w, h);
}
