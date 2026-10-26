// The page view: one laid-out page, the ink over it, and the pen. Pen: writes (on a desktop the mouse writes in Pen mode). The finger
// gestures are the kit's ZoomView (main.tsx): a tap follows a link or ticks a task box, a swipe turns the page, a pinch scales the page
// while the fingers move and lays it out again at the nearest text size when they lift: one e-ink refresh per gesture. The wheel turns pages.
import { rect, line, drawText, drawImage, stroke, penCount, penX, penY, penPressure, penFlags, PenFlag } from 'zinc:gfx';
import { doc, ink, penMode, onTablet, version, resize, turn, fontIndex, setFont } from './state';
import { I_TEXT, I_FILL, I_BOX, I_IMAGE, I_CHECK } from './layout';
import { FONT_SIZES } from './constants';

const SWIPE: number = 120;

let penFrames: i32 = 99;   // frames since the last pen sample: the Marker also moves the pointer

/** The page and the ink: one image while the page stays put, plus the live stroke's new segments (zinc:ink drawOver). */
function draw(x: i32, y: i32, w: i32, h: i32): void {
  const v = version();   // the layout's version: a new layout redraws
  if (doc.lay.pages.length === 0) { rect(x, y, w, h, 0xffffff); return; }
  // the ink is in document pixels: page k starts k * h down
  ink.drawOver(x, y, w, h, 0, doc.page * doc.h, 1, v, (_w: i32, _h: i32) => { drawPage(); });
}
/** The laid-out page from (0, 0): the ink's baked layer. */
function drawPage(): void {
  for (const it of doc.lay.pages[doc.page]) {
    const ix = it.x, iy = it.y;
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

/** The pointer is the pen (or the mouse in Pen mode): ZoomView starts no gesture. */
export function writing(): boolean { return penFrames < 3 || ink.live !== null || (!onTablet && penMode()); }
/** A drag of the page: a long enough one turns it. */
export function swipe(dx: number, dy: number): void {
  if (Math.abs(dy) >= Math.abs(dx) ? Math.abs(dy) > SWIPE : Math.abs(dx) > SWIPE) turn((Math.abs(dy) >= Math.abs(dx) ? dy : dx) < 0 ? 1 : -1);
}
/** A pinch by `f` ended: the text size of FONT_SIZES nearest to the pinched one. */
export async function pinchFont(f: number): Promise<void> {
  const want = FONT_SIZES[fontIndex()] * f;
  let j: i32 = 0;
  for (let i: i32 = 1; i < FONT_SIZES.length; i++) if (Math.abs(FONT_SIZES[i] - want) < Math.abs(FONT_SIZES[j] - want)) j = i;
  setFont(j - fontIndex());
}

/** ZoomView's draw: the reading view. */
export function pageView(x: i32, y: i32, w: i32, h: i32): void {
  resize(w, h);
  pen(x, y, w, h);
  draw(x, y, w, h);
}
