// The page view: the relay's picture, the ink over it, and the pen. Pen: writes (on a desktop the mouse writes in Pen mode). The finger
// gestures are the kit's ZoomView (main.tsx): a tap follows a link, a swipe turns the page, a drag pans a zoomed page, two fingers pinch;
// the picture is scaled while the fingers move and fetched sharp from the relay when they lift (setView), one e-ink refresh per gesture.
import { rect, drawImageRect, penCount, penX, penY, penPressure, penFlags, PenFlag } from 'zinc:gfx';
import { view, ink, penMode, onTablet, resize, turn } from './state';

const SWIPE: number = 120;
let penFrames: i32 = 99;          // frames since the last pen sample: the Marker also moves the pointer

/** The picture and the ink: one image while the view stays put, plus the live stroke's new segments (zinc:ink drawOver). */
function draw(x: i32, y: i32, w: i32, h: i32): void {
  if (view.img < 0) { rect(x, y, w, h, 0xffffff); return; }
  const z = view.zoom, ox = view.ox, oy = view.oy;
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

/** The pointer is the pen (or the mouse in Pen mode): ZoomView starts no gesture. */
export function writing(): boolean { return penFrames < 3 || ink.live !== null || (!onTablet && penMode()); }
/** A drag of the page at zoom 1: a long enough one turns it. */
export function swipe(dx: number, dy: number): void {
  if (Math.abs(dy) >= Math.abs(dx) ? Math.abs(dy) > SWIPE : Math.abs(dx) > SWIPE) turn((Math.abs(dy) >= Math.abs(dx) ? dy : dx) < 0 ? 1 : -1);
}

/** ZoomView's draw: the page view. */
export function pageView(x: i32, y: i32, w: i32, h: i32): void {
  resize(w, h);
  pen(x, y, w, h);
  draw(x, y, w, h);
}
