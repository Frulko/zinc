// The camera: where the map looks, how far, which way is up, and how it moves between those.
//   FOLLOW    the car sits in the lower third, travel direction up; bearing and zoom follow on lazy springs
//             (zoom in before a maneuver, out when fast), the position exactly (no drift of the car icon);
//   OVERVIEW  the whole route, north up, flat (route preview);
//   FREE      the user dragged or zoomed: the map stays where it was put; "Recenter" (or 12 s idle) flies back.
// Switching mode is a flight: every camera value is interpolated from where it is to the new mode's target
// (the target keeps moving with the car during the flight), angles along the shortest way round.
import { createSignal } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Projection } from 'zinc:citymap';
import { car, phase, DRIVING, ARRIVED } from './sim';
import { at, locate, headingAt, angleDelta, steps, nextStepAt, routePointCount, pointX, pointY } from './route';
import { easeInOut, lerp } from './motion';

export const FOLLOW: i32 = 0, OVERVIEW: i32 = 1, FREE: i32 = 2;
export const cam: Projection = new Projection();
const [modeSig, setModeSig] = createSignal<i32>(OVERVIEW);
/** Current mode (a signal: the Recenter button shows in FREE). */
export const cameraMode = modeSig;

/** Metres per pixel at zoom 0, at the latitude of Paris (web-mercator zoom levels, like zinc:map). */
const MPP0: number = 156543.03 * Math.cos(48.862 * Math.PI / 180);
export function scaleOf(zoom: number): number { return Math.pow(2, zoom) / MPP0; }

/** Width of the side panel (banner, sheet) plus its margins; the map's free area is to its right. Same breakpoints
 *  as the panel's classes in main.tsx (md: 768 px, lg: 1024 px). */
export function panelWidth(w: number): number { return w >= 1024 ? 368 : w >= 768 ? 316 : 0; }

// camera values: the world point at the anchor, bearing, zoom, tilt, and the anchor on screen
class CamState { x: number = 0; y: number = 0; bearing: number = -Math.PI / 2; zoom: number = 14; tilt: number = 0; ax: number = 0; ay: number = 0; }
const now = new CamState(), target = new CamState(), from = new CamState();
let flight: number = 1, flightTime: number = 1.4;
let bearingV: number = 0, zoomV: number = 0;
let idle: number = 0;
let panVX: number = 0, panVY: number = 0;
let orbit: number = 0;
let snapNext: boolean = true;   // the next frame jumps to the target (first frame, scripted states)
let downX: number = 0, downY: number = 0, lastX: number = 0, lastY: number = 0, dragging: boolean = false, pressed: boolean = false;

// route bounds, for the overview
let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
for (let i: i32 = 0; i < routePointCount; i++) {
  minX = Math.min(minX, pointX(i)); maxX = Math.max(maxX, pointX(i)); minY = Math.min(minY, pointY(i)); maxY = Math.max(maxY, pointY(i));
}

function followZoom(h: number): number {
  const kmh = car.v * 3.6;
  let z = 17.35 - 0.8 * Math.max(0, Math.min(1, (kmh - 20) / 30));
  const next = nextStepAt(car.d);
  if (steps[next].type !== 'arrive' && steps[next].at - car.d < 180) z = 17.85;
  if (phase() === ARRIVED) z = 17.6;
  return z - (h < 560 ? 0.35 : 0);   // small screens see a bit more
}

/** The target of the current mode for a map in the screen box (x, y, w, h). */
function computeTarget(x: number, y: number, w: number, h: number, dt: number): void {
  const left = x + panelWidth(w), mw = x + w - left;
  if (modeSig() === OVERVIEW) {
    const s = Math.min((mw - 80) / (maxX - minX), (h - 120) / (maxY - minY));
    target.x = (minX + maxX) / 2; target.y = (minY + maxY) / 2;
    target.bearing = -Math.PI / 2; target.zoom = Math.log(s * MPP0) / Math.log(2); target.tilt = 0;
    target.ax = left + mw / 2; target.ay = y + h / 2;
    return;
  }
  locate(car.d);
  target.x = at.x; target.y = at.y;
  target.bearing = headingAt(car.d, 9);
  if (phase() === ARRIVED) { orbit += dt * 0.12; target.bearing += orbit; }   // a slow turn around the arrival
  target.zoom = followZoom(h); target.tilt = 0.55;
  target.ax = left + mw / 2; target.ay = y + h * 0.72;
}

function copy(a: CamState, b: CamState): void { a.x = b.x; a.y = b.y; a.bearing = b.bearing; a.zoom = b.zoom; a.tilt = b.tilt; a.ax = b.ax; a.ay = b.ay; }

/** Changes mode with a flight of `seconds` from the current view. */
export function flyTo(mode: i32, seconds: number): void {
  copy(from, now);
  flight = 0; flightTime = seconds;
  orbit = 0;
  setModeSig(mode);
}
export function recenter(): void { if (modeSig() === FREE) flyTo(phase() === DRIVING || phase() === ARRIVED ? FOLLOW : OVERVIEW, 1.1); }
/** Jumps to the mode's view at once (scripted states). */
export function snapTo(mode: i32): void { setModeSig(mode); flight = 1; snapNext = true; }

/** Per frame: moves the camera and writes it into `cam`. */
export function stepCamera(dt: number, x: number, y: number, w: number, h: number): void {
  computeTarget(x, y, w, h, dt);
  const mode = modeSig();
  if (snapNext) { snapNext = false; if (mode !== FREE) copy(now, target); flight = 1; }
  if (flight < 1) {
    flight = Math.min(1, flight + dt / flightTime);
    const e = easeInOut(flight);
    now.x = lerp(from.x, target.x, e); now.y = lerp(from.y, target.y, e);
    now.bearing = from.bearing + angleDelta(from.bearing, target.bearing) * e;
    now.zoom = lerp(from.zoom, target.zoom, e) - Math.sin(flight * Math.PI) * (mode === FOLLOW ? 0.6 : 0);   // a little hop
    now.tilt = lerp(from.tilt, target.tilt, e);
    now.ax = lerp(from.ax, target.ax, e); now.ay = lerp(from.ay, target.ay, e);
    bearingV = 0; zoomV = 0;
  } else if (mode !== FREE) {
    now.x = target.x; now.y = target.y;
    // lazy springs (critically damped): the map turns and zooms smoothly behind the car
    const h1 = Math.min(dt, 0.05);
    bearingV += (7 * angleDelta(now.bearing, target.bearing) - 5.3 * bearingV) * h1;
    now.bearing += bearingV * h1;
    zoomV += (4 * (target.zoom - now.zoom) - 4 * zoomV) * h1;
    now.zoom += zoomV * h1;
    now.tilt = target.tilt; now.ax = target.ax; now.ay = target.ay;
  } else {
    // free: pan inertia after a release; back to the car after 12 s without touching while driving
    if (!pressed) { now.x += panVX * dt; now.y += panVY * dt; }
    const k = Math.exp(-dt * 5);
    panVX *= k; panVY *= k;
    idle += dt;
    if (idle > 12 && phase() === DRIVING) recenter();
  }
  cam.cx = now.x; cam.cy = now.y; cam.bearing = now.bearing; cam.scale = scaleOf(now.zoom);
  cam.tilt = now.tilt; cam.ax = now.ax; cam.ay = now.ay; cam.depth = h;
  cam.update();
}

// ---------------------------------------------------------------- gestures (pointer events of the map canvas)

function toFree(): void {
  if (modeSig() !== FREE) { setModeSig(FREE); flight = 1; }
  idle = 0;
}
export function pointerDown(e: ui.PointerEvent): void {
  pressed = true; dragging = false;
  downX = e.x; downY = e.y; lastX = e.x; lastY = e.y;
  panVX = 0; panVY = 0;
}
export function pointerMove(e: ui.PointerEvent): void {
  if (!pressed) return;
  if (!dragging && Math.abs(e.x - downX) + Math.abs(e.y - downY) < 5) return;
  if (!dragging) { dragging = true; toFree(); }
  // the world point under the pointer stays under it
  cam.toWorld(lastX, lastY);
  const ax = cam.wx, ay = cam.wy;
  cam.toWorld(e.x, e.y);
  now.x += ax - cam.wx; now.y += ay - cam.wy;
  panVX = panVX * 0.6 + (ax - cam.wx) * 60 * 0.4; panVY = panVY * 0.6 + (ay - cam.wy) * 60 * 0.4;
  cam.cx = now.x; cam.cy = now.y;
  lastX = e.x; lastY = e.y;
  idle = 0;
}
export function pointerUp(e: ui.PointerEvent): void {
  pressed = false;
  if (!dragging) { panVX = 0; panVY = 0; }
  dragging = false;
}
/** Wheel notches and trackpad pinch zoom around the pointer. */
export function wheel(e: ui.PointerEvent): void {
  const dz = e.wheel * 0.25 + Math.log(e.pinch) / Math.log(2);
  if (dz === 0) return;
  toFree();
  cam.toWorld(e.x, e.y);
  const ax = cam.wx, ay = cam.wy;
  now.zoom = Math.max(13, Math.min(19, now.zoom + dz));
  cam.scale = scaleOf(now.zoom); cam.update();
  cam.toWorld(e.x, e.y);
  now.x += ax - cam.wx; now.y += ay - cam.wy;
}
/** Moves the map by (dx, dy) screen pixels (arrow keys, scripted states). */
export function panBy(dx: number, dy: number): void {
  toFree();
  cam.toWorld(cam.ax, cam.ay);
  const ax = cam.wx, ay = cam.wy;
  cam.toWorld(cam.ax + dx, cam.ay + dy);
  now.x += ax - cam.wx; now.y += ay - cam.wy;
}
/** Keyboard / button zoom around the anchor. */
export function zoomBy(dz: number): void { toFree(); now.zoom = Math.max(13, Math.min(19, now.zoom + dz)); }
