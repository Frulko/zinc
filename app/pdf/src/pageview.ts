// The page view: PDFium's picture of the page, the ink over it, and the pen (Zinc Web's, app/web/src/pageview.ts). Pen: writes (its eraser
// end, or the Eraser tool, erases; on a desktop the mouse writes in Pen mode). The finger gestures are the kit's ZoomView (main.tsx): a
// swipe turns the page, a drag pans a zoomed page, two fingers pinch; the picture is scaled while the fingers move and drawn sharp by
// PDFium when they lift (setView), one e-ink refresh per gesture. The wheel turns pages, Ctrl+wheel zooms.
import { rect, drawImageRect, penCount, penX, penY, penPressure, penFlags, PenFlag, pointerX, pointerY, pointerDown, commandCount } from 'zinc:gfx';
import { view, ink, penMode, onTablet, resize, turn, scale } from './state';

const SWIPE: number = 120;
let penFrames: i32 = 99;          // frames since the last pen sample: the Marker also moves the pointer

/** The picture and the ink: one image while the view stays put, plus the live stroke's new segments (zinc:ink drawOver). */
function draw(x: i32, y: i32, w: i32, h: i32): void {
  if (view.img < 0 || view.doc === null) { rect(x, y, w, h, 0xffffff); return; }
  const z = scale(), ox = view.ox, oy = view.oy;
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
