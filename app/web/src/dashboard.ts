// Dashboard mode (TRMNL-style): one bookmarked page, page 1 only, full screen, rendered again by the relay every 5/15/30/60 minutes.
// The picture is replaced only when its bytes changed (sha256), then the panel gets one full refresh, so a dashboard left for days
// does not ghost. A tap renders it now. The widget (Accueil) shows the top of the same picture at half size, on the same timer.
// The mode and the period live in web.conf with the rest of the state: Accueil, a quit and a reopen come back to the dashboard.
import { createSignal } from 'zinc:ui/solid';
import { imageFromBytes, destroyImage, refreshDisplay, rect, drawImageRect, pointerDown, pointerX, pointerY } from 'zinc:gfx';
import { sha256, toHex } from 'zinc:web';
import * as sys from 'zinc:sys';
import { conf, relay, say } from './state';

export const PERIODS: i32[] = [5, 15, 30, 60];
/** The widget card: the top of the page at half size (the top 1620 x 1080 of a 1620 px wide page). */
export const WIDGET_W: i32 = 810;
export const WIDGET_H: i32 = 540;
// tests: a period in milliseconds instead of minutes
const testMs: number = parseFloat(sys.env('ZINC_WEB_DASH_MS'));

function savedPeriod(): i32 { const m = parseInt(conf.get('every')); return PERIODS.indexOf(m) >= 0 ? m : 15; }
export const [dashUrl, setDashUrl] = createSignal<string>(conf.get('dash'));
export const [every, setEvery] = createSignal<i32>(savedPeriod());
export const [updated, setUpdated] = createSignal<string>('');
export const [widgetPreview, setWidgetPreview] = createSignal<boolean>(false);   // the test script draws the widget

class Dash {
  img: i32 = -1;
  hash: string = '';
  w: i32 = 0; h: i32 = 0;     // the full-screen view's size: the relay renders at it
  next: number = 0;           // Date.now() of the next render
  busy: boolean = false;
  count: i32 = 0;             // renders asked (the test script waits on it)
  down: boolean = false;      // a finger is on the picture (a tap renders now)
}
export const dash = new Dash();

function periodMs(): number { return testMs > 0 ? testMs : every() * 60000; }
function hhmm(): string { const d = new Date(); return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0'); }

/** Renders the dashboard page now; swaps the picture and refreshes the whole panel only when it changed. */
export async function update(): Promise<void> {
  const url = dashUrl();
  if (dash.busy || url === '' || dash.w === 0) return;
  dash.busy = true;
  dash.count++;
  const n = dash.count.toString();
  try {
    const bytes = await relay.firstPage(url, dash.w, dash.h);
    const hash = toHex(sha256(bytes));
    if (hash === dash.hash) say('dashboard ' + n + ': unchanged');
    else {
      const img = imageFromBytes(bytes);
      if (img < 0) throw new Error('The relay sent a picture that is not a PNG.');
      if (dash.img >= 0) destroyImage(dash.img);
      dash.img = img; dash.hash = hash;
      refreshDisplay();   // asked now, sent by display-rmpp once the new picture's partial update is out: no ghost of the old one
      say('dashboard ' + n + ': new picture');
    }
    setUpdated(hhmm());
  } catch (e) { say('dashboard ' + n + ': ' + e.message); }
  dash.next = Date.now() + periodMs();
  dash.busy = false;   // ponytail: not in a finally (the async lowering skips it after a return await)
}

export function startDash(url: string): void {
  conf.set('dash', url); conf.save();
  dash.hash = ''; dash.next = 0;
  setDashUrl(url);
}
export function stopDash(): void {
  conf.set('dash', ''); conf.save();
  setDashUrl('');
}
export function setPeriod(min: i32): void {
  conf.set('every', min.toString()); conf.save();
  setEvery(min);
  dash.next = Date.now() + periodMs();
}

// The timer: checked every second against a deadline, so a new period takes effect at once and a late wake-up renders at once.
// display-rmpp keeps the program's loop running while the window is minimized or shown as the widget (rm_present waits 8 ms for input).
setInterval(() => { if (dashUrl() !== '' && Date.now() >= dash.next) update(); }, testMs > 0 ? Math.max(50, testMs / 4) : 1000);

/** A tap (down and up on the picture) renders now. */
function tap(x: number, y: number, w: number, h: number): void {
  const px = pointerX() - x, py = pointerY() - y, inside = px >= 0 && py >= 0 && px < w && py < h;
  if (pointerDown()) { if (inside) dash.down = true; return; }
  if (dash.down) { dash.down = false; if (inside) update(); }
}

/** The Canvas onDraw of the full-screen dashboard: page 1 at its size. */
export function dashView(x: i32, y: i32, w: i32, h: i32): void {
  if (w !== dash.w || h !== dash.h) { dash.w = w; dash.h = h; dash.next = 0; }   // a new size renders again
  tap(x, y, w, h);
  rect(x, y, w, h, 0xffffff);
  if (dash.img >= 0) drawImageRect(dash.img, 0, 0, dash.w, dash.h, x, y, w, h);
}

let widgetDrawn: i32 = -1;
/** The Canvas onDraw of the widget: the top of the page, scaled to the card. */
export function widgetView(x: i32, y: i32, w: i32, h: i32): void {
  tap(x, y, w, h);
  rect(x, y, w, h, 0xffffff);
  if (dash.img < 0 || dash.w === 0) return;
  const sw = dash.w, sh = Math.min(dash.h, dash.w * h / w);   // the width of the page, the height that keeps its aspect
  drawImageRect(dash.img, 0, 0, sw, sh, x, y, w, h);
  if (widgetDrawn !== dash.img) { widgetDrawn = dash.img; console.log('web: widget ' + w.toString() + 'x' + h.toString() + ' shows the top ' + sw.toString() + 'x' + Math.round(sh).toString()); }
}
