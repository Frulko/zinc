// The map canvas, drawn every frame under the camera: city (zinc:citymap), the route (driven part dimmed, traffic
// in red, progressive reveal in the preview), the white maneuver arrow on the next turn, alert pins, the
// destination flag, the car, and the arrival confetti. Day and night palettes are blended by `night` (0..1).
import { rect, rrect, stroke, polygon, shadow } from 'zinc:gfx';
import { readBytes } from 'zinc:assets';
import { platform } from 'zinc:sys';
import { CityMap, Palette, KINDS } from 'zinc:citymap';
import { cam } from './camera';
import { car, phase, PREVIEW, ARRIVED, JAM_FROM, JAM_TO } from './sim';
import { at, locate, headingAt, routeLength, pointX, pointY, segmentAt, steps, nextStepAt } from './route';
import { alerts, KIND_COLORS } from './alerts';
import { drawGlyph, drawFlag } from './icons';

/** Raspberry Pi 1: no buildings, no road casings (a third of the raster work). */
export const lite: boolean = platform() === 'rpi1';
const city = new CityMap(readBytes('city.bin'));

// ---------------------------------------------------------------- palettes
const day = new Palette();
day.park = 0xc4e7c4; day.water = 0x9fd3f4; day.building = 0xe0e2e6;
day.road = [0, 0, 0, 0xf6f7f9, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffe49b, 0xd9dde3];
day.casing = [0, 0, 0, 0xd8dce2, 0xd3d7de, 0xcdd1d8, 0xc3c8d0, 0xbcc2cb, 0xe3bd5f, 0xd9dde3];
const DAY_LAND: u32 = 0xeef0f3;
const night = new Palette();
night.park = 0x1c3a30; night.water = 0x123456; night.building = 0x2a3345;
night.road = [0, 0, 0, 0x323c4d, 0x3a4558, 0x46526a, 0x505d77, 0x5a6882, 0x8a7443, 0x2a3242];
night.casing = [0, 0, 0, 0x161c27, 0x161c27, 0x151b25, 0x141a24, 0x131923, 0x2b2416, 0x2a3242];
const NIGHT_LAND: u32 = 0x1d2433;
const pal = new Palette();
let land: u32 = DAY_LAND;
let blendedFor: number = -1;

function mix(a: u32, b: u32, t: number): u32 {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return ((Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl)) as u32;
}
function blend(t: number): void {
  if (t === blendedFor) return;
  blendedFor = t;
  pal.park = mix(day.park, night.park, t); pal.water = mix(day.water, night.water, t); pal.building = mix(day.building, night.building, t);
  for (let k: i32 = 0; k < KINDS; k++) { pal.road[k] = mix(day.road[k], night.road[k], t); pal.casing[k] = mix(day.casing[k], night.casing[k], t); }
  land = mix(DAY_LAND, NIGHT_LAND, t);
}

// ---------------------------------------------------------------- route geometry on screen
/** Distance up to which the route is drawn (grows from 0 in the preview: the route "draws itself"). */
export class Reveal { d: number = 0; }
export const reveal: Reveal = new Reveal();

/** The route between distances d0 and d1 as a screen polyline (points closer than 1 px are skipped). */
function routeLine(d0: number, d1: number): number[] {
  const out: number[] = [];
  if (d1 <= d0) return out;
  locate(d0); cam.project(at.x, at.y);
  out.push(cam.x); out.push(cam.y);
  let lx = cam.x, ly = cam.y;
  const i1 = segmentAt(d1);
  for (let i: i32 = segmentAt(d0) + 1; i <= i1; i++) {
    cam.project(pointX(i), pointY(i));
    if (Math.abs(cam.x - lx) + Math.abs(cam.y - ly) < 1) continue;
    out.push(cam.x); out.push(cam.y);
    lx = cam.x; ly = cam.y;
  }
  locate(d1); cam.project(at.x, at.y);
  out.push(cam.x); out.push(cam.y);
  return out;
}

/** Strokes the route between d0 and d1 in pieces of ~60 m, each as wide as the perspective makes it there. */
function routeStroke(d0: number, d1: number, width: number, color: u32, alpha: i32): void {
  let a = d0;
  while (a < d1) {
    const b = Math.min(d1, a + 60);
    locate((a + b) / 2); cam.project(at.x, at.y);
    const line = routeLine(a, b + (b < d1 ? 2 : 0));   // a little overlap: no seam between pieces
    if (line.length >= 4) stroke(line, width * cam.f, color, alpha, false);
    a = b;
  }
}

function circle(x: number, y: number, r: number, color: u32, alpha: i32): void { rrect(x - r, y - r, r * 2, r * 2, r, color, alpha); }

/** The white arrow painted on the route at the next maneuver (like Google Maps), when it is less than 400 m away. */
function maneuverArrow(width: number): void {
  const next = nextStepAt(car.d);
  const s = steps[next];
  if (s.type === 'arrive' || s.at - car.d > 400 || phase() === PREVIEW) return;
  const d0 = Math.max(car.d, s.at - 22), d1 = Math.min(routeLength, s.at + (s.type === 'roundabout' ? 50 : 20));
  const line = routeLine(d0, d1);
  if (line.length < 6) return;
  const n = line.length;
  let dx = line[n - 2] - line[n - 4], dy = line[n - 1] - line[n - 3];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.01) return;
  dx /= len; dy /= len;
  const w = width * 0.5, hl = w * 2.2, hw = w * 1.7;
  const tx = line[n - 2] + dx * hl * 0.6, ty = line[n - 1] + dy * hl * 0.6;
  const head = [tx + dx * 1.5, ty + dy * 1.5, tx - dx * hl - dy * hw, ty - dy * hl + dx * hw, tx - dx * hl + dy * hw, ty - dy * hl - dx * hw];
  stroke(line, w + 3, 0x0b3a75, 255, false);
  polygon([tx + dx * 3.5, ty + dy * 3.5, tx - dx * (hl + 1.5) - dy * (hw + 2.5), ty - dy * (hl + 1.5) + dx * (hw + 2.5), tx - dx * (hl + 1.5) + dy * (hw + 2.5), ty - dy * (hl + 1.5) - dx * (hw + 2.5)], 0x0b3a75, 255);
  stroke(line, w, 0xffffff, 255, false);
  polygon(head, 0xffffff, 255);
}

/** A map pin standing at (x, y): a disc on a point, with the alert's glyph. */
function pin(x: number, y: number, s: number, color: u32, glyph: i32): void {
  if (s < 0.02) return;
  rrect(x - 9 * s, y - 3 * s, 18 * s, 6 * s, 3 * s, 0x000000, 50);
  const cy = y - 36 * s;
  shadow(x - 19 * s, cy - 17 * s, 38 * s, 38 * s, 19 * s, 8 * s, 0x000000, 70);
  polygon([x - 12 * s, cy + 12 * s, x + 12 * s, cy + 12 * s, x, y], 0xffffff, 255);
  circle(x, cy, 20 * s, 0xffffff, 255);
  polygon([x - 8.5 * s, cy + 12 * s, x + 8.5 * s, cy + 12 * s, x, y - 4 * s], color, 255);
  circle(x, cy, 16.5 * s, color, 255);
  if (glyph >= 0) drawGlyph(glyph, x - 11 * s, cy - 11 * s, 22 * s, 0xffffff, color);
}

/** The car: a blue arrow with a white rim, its shadow and a soft pulsing halo. */
function drawCar(x: number, y: number, angle: number, pulse: number, nightT: number): void {
  const c = Math.cos(angle), s = Math.sin(angle);
  // local (right, forward) to screen
  const P = (pts: number[], k: number): number[] => {
    const out: number[] = [];
    for (let i: i32 = 0; i < pts.length; i += 2) { const r = pts[i] * k, f = pts[i + 1] * k; out.push(x + r * c + f * s); out.push(y + r * s - f * c); }
    return out;
  };
  circle(x, y, 26 + 6 * pulse, 0x3fb6f2, Math.round(55 * (1 - pulse)));
  shadow(x - 15, y - 13, 30, 30, 15, 9, 0x000000, 90);
  const shape = [0, 19, 13.5, -13, 0, -6, -13.5, -13];
  polygon(P(shape, 1.28), 0xffffff, 255);
  polygon(P(shape, 1), nightT > 0.5 ? 0x3fb6f2 : 0x1a73e8, 255);
}

// ---------------------------------------------------------------- confetti (arrival)
class Bit { x: number = 0; y: number = 0; vx: number = 0; vy: number = 0; a: number = 0; va: number = 0; color: u32 = 0; }
const bits: Bit[] = [];
const CONFETTI: u32[] = [0x3fb6f2, 0xffc93c, 0xff5c8a, 0x5ad17a, 0xa66bff, 0xff8a00];
export function confetti(x: number, y: number): void {
  for (let i: i32 = 0; i < 140; i++) {
    const b = new Bit();
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 350 + Math.random() * 650;
    b.x = x; b.y = y; b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v;
    b.a = Math.random() * 6; b.va = (Math.random() - 0.5) * 16; b.color = CONFETTI[i % CONFETTI.length];
    bits.push(b);
  }
}
export function clearConfetti(): void { bits.splice(0, bits.length); }
function drawConfetti(dt: number, bottom: number): void {
  let i: i32 = 0;
  while (i < bits.length) {
    const b = bits[i];
    b.vy += 900 * dt; b.vx *= Math.exp(-dt * 1.2); b.vy *= Math.exp(-dt * 0.6);
    b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt;
    if (b.y > bottom + 20) { bits.splice(i, 1); continue; }
    const c = Math.cos(b.a), s = Math.sin(b.a), w = 5, h = 2.6 + 2.4 * Math.abs(Math.sin(b.a * 1.7));   // flutter
    polygon([b.x - c * w + s * h, b.y - s * w - c * h, b.x + c * w + s * h, b.y + s * w - c * h, b.x + c * w - s * h, b.y + s * w + c * h, b.x - c * w - s * h, b.y - s * w + c * h], b.color, 255);
    i++;
  }
}

// ---------------------------------------------------------------- the frame
let time: number = 0;
let frameDt: number = 1 / 60;
export function advanceScene(dt: number): void { time += dt; frameDt = Math.min(dt, 0.05); }

/** Canvas callback. `nightT`: 0 day .. 1 night. */
export function drawScene(x: number, y: number, w: number, h: number, nightT: number): void {
  blend(nightT);
  rect(x, y, w, h, land);
  city.draw(cam, pal, x, y, w, h, lite);

  // route: driven part dimmed, the rest in Waze blue with a darker rim, traffic in red
  const width = Math.max(7, Math.min(26, 14 * cam.scale));
  const end = Math.min(routeLength, reveal.d);
  if (car.d > 1) {
    routeStroke(0, car.d, width + 4, nightT > 0.5 ? 0x4a5566 : 0x9aa5b1, 255);
    routeStroke(0, car.d, width, nightT > 0.5 ? 0x5f6b7d : 0xbfc7d0, 255);
  }
  routeStroke(car.d, end, width + 5, nightT > 0.5 ? 0x0b5a94 : 0x0f6fb7, 255);
  routeStroke(car.d, end, width, 0x3fb6f2, 255);
  const j0 = Math.max(car.d, JAM_FROM), j1 = Math.min(end, JAM_TO);
  if (j1 > j0) { routeStroke(j0, j1, width, 0xe8423a, 255); }
  maneuverArrow(width);

  // destination flag, alert pins (farthest first, so nearer pins overlap farther ones)
  if (reveal.d >= routeLength) {
    locate(routeLength); cam.project(at.x, at.y);
    pin(cam.x, cam.y, Math.min(1.1, 0.7 + 0.3 * cam.f), 0x14a05a, -1);
    drawFlag(cam.x - 10, cam.y - 46, 20, 0xffffff);
  }
  for (let i: i32 = alerts.length - 1; i >= 0; i--) {
    const a = alerts[i];
    if (a.pop < 0.02) continue;
    const hd = headingAt(a.at, 5);
    locate(a.at);
    cam.project(at.x - Math.sin(hd) * 11, at.y + Math.cos(hd) * 11);   // on the right-hand side of the road
    pin(cam.x, cam.y, a.pop * Math.min(1.1, Math.max(0.6, cam.f)), KIND_COLORS[a.kind], a.kind);
  }

  // the car
  locate(car.d); cam.project(at.x, at.y);
  const carX = cam.x, carY = cam.y;
  const heading = headingAt(car.d, 6);
  const pulse = (time % 1.6) / 1.6;
  drawCar(carX, carY, heading - cam.bearing, phase() === ARRIVED ? 0 : pulse, nightT);

  if (bits.length > 0) drawConfetti(frameDt, y + h);
}

/** Car position on screen from the last frame (confetti origin). */
export function carOnScreen(): number[] { locate(car.d); cam.project(at.x, at.y); return [cam.x, cam.y]; }
export function mapStats(): string { return `${city.drawn} features, ~${city.points} floats`; }
