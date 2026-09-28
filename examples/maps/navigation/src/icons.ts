// Vector icons drawn with zinc:gfx (no icon font): maneuver arrows for the banner and the step list, lane arrows,
// alert glyphs (map pins, report menu, alert card) and the button icons. Coordinates are on a unit box scaled to
// the requested size, so every icon is sharp at any size and density.
import { stroke, polygon, rrect } from 'zinc:gfx';
import { Step } from './route';

const RAD: number = Math.PI / 180;

/** Points (u, v) of the unit box to the screen box at (x, y) of size s. */
class Box {
  constructor(public x: number, public y: number, public s: number) {}
  pts(uv: number[]): number[] {
    const out: number[] = [];
    for (let i: i32 = 0; i < uv.length; i += 2) { out.push(this.x + uv[i] * this.s); out.push(this.y + uv[i + 1] * this.s); }
    return out;
  }
}

/** A polyline with an arrow head at its end: shaft width lw (px). */
function arrow(p: number[], lw: number, color: u32, alpha: i32): void {
  const n = p.length;
  const tx = p[n - 2], ty = p[n - 1];
  let dx = tx - p[n - 4], dy = ty - p[n - 3];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len <= 0) return;
  dx /= len; dy /= len;
  const hl = lw * 1.9, hw = lw * 1.6;
  const shaft = p.slice(0, n - 2);
  shaft.push(tx - dx * hl * 0.7); shaft.push(ty - dy * hl * 0.7);
  stroke(shaft, lw, color, alpha, false);
  const bx = tx - dx * hl, by = ty - dy * hl;
  polygon([tx + dx * 1, ty + dy * 1, bx - dy * hw, by + dx * hw, bx + dy * hw, by - dx * hw], color, alpha);
}

/** Arc points around (cx, cy) from angle a0 to a1 (degrees, screen angles: 0 = right, 90 = down). */
function arc(out: number[], cx: number, cy: number, r: number, a0: number, a1: number): void {
  const n: i32 = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 12));
  for (let i: i32 = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * i / n) * RAD;
    out.push(cx + Math.cos(a) * r); out.push(cy + Math.sin(a) * r);
  }
}

/** Canonical angle of a turn (degrees, + = right): what the icon shows. */
function iconAngle(type: string, side: string): number {
  const a = type === 'slight' ? 45 : type === 'sharp' ? 135 : type === 'uturn' ? 180 : type === 'turn' ? 90 : 0;
  return side === 'left' ? -a : a;
}

/** The maneuver arrow of a step, in a box of size s at (x, y). */
export function drawManeuver(step: Step, x: number, y: number, s: number, color: u32): void {
  const b = new Box(x, y, s), lw = Math.max(2, s * 0.13);
  const t = step.type;
  if (t === 'arrive') { drawFlag(x, y, s, color); return; }
  if (t === 'roundabout') {
    const ring: number[] = [];
    arc(ring, 0.5, 0.42, 0.2, 0, 360);
    stroke(b.pts(ring), lw * 0.7, color, 110, true);
    // counterclockwise (right-hand traffic) from the entry at the bottom to the exit
    let exit = step.angle - 90;
    while (exit >= 80) exit -= 360;
    while (exit < -280) exit += 360;
    const p: number[] = [0.5, 0.97];
    arc(p, 0.5, 0.42, 0.2, 90, exit);
    const ex = Math.cos(exit * RAD), ey = Math.sin(exit * RAD);
    p.push(0.5 + ex * 0.46); p.push(0.42 + ey * 0.46);
    arrow(b.pts(p), lw, color, 255);
    return;
  }
  if (t === 'uturn') {
    const dir = step.side === 'right' ? -1 : 1;
    const p: number[] = [0.5 + 0.17 * dir, 0.95, 0.5 + 0.17 * dir, 0.42];
    arc(p, 0.5, 0.42, 0.17, dir > 0 ? 0 : 180, dir > 0 ? -180 : 0);
    p.push(0.5 - 0.17 * dir); p.push(0.72);
    arrow(b.pts(p), lw, color, 255);
    return;
  }
  const a = iconAngle(t, step.side) * RAD;
  const u0 = 0.5 - Math.sin(a) * 0.15;
  const p: number[] = [u0, 0.95, u0, 0.5];
  p.push(u0 + Math.sin(a) * 0.4); p.push(0.5 - Math.cos(a) * 0.4);
  arrow(b.pts(p), lw, color, 255);
}

/** Checkered flag (arrival). */
export function drawFlag(x: number, y: number, s: number, color: u32): void {
  const b = new Box(x, y, s);
  stroke(b.pts([0.28, 0.92, 0.28, 0.1]), Math.max(1.5, s * 0.08), color, 255, false);
  for (let r: i32 = 0; r < 3; r++) for (let c: i32 = 0; c < 4; c++) {
    const u = 0.3 + c * 0.13, v = 0.12 + r * 0.12;
    rrect(x + u * s, y + v * s, s * 0.13, s * 0.12, 0, color, (r + c) % 2 === 0 ? 255 : 70);
  }
}

/** One lane of the lane guidance: its arrows (a lane can allow several directions: "through;right"). */
export function drawLane(lane: string, x: number, y: number, s: number, color: u32, alpha: i32): void {
  const b = new Box(x, y, s), lw = Math.max(1.8, s * 0.12);
  const tokens = lane.split(';');
  for (const tok of tokens) {
    const side = tok.indexOf('left') >= 0 ? 'left' : tok.indexOf('right') >= 0 ? 'right' : '';
    const type = tok.startsWith('slight') ? 'slight' : tok.startsWith('sharp') ? 'sharp' : side !== '' ? 'turn' : 'straight';
    const a = iconAngle(type, side) * RAD;
    const p: number[] = [0.5, 0.95, 0.5, 0.5];
    p.push(0.5 + Math.sin(a) * 0.36); p.push(0.5 - Math.cos(a) * 0.36);
    arrow(b.pts(p), lw, color, alpha);
  }
}

// ---------------------------------------------------------------- alert glyphs (white on the alert colour)
export const POLICE_GLYPH: i32 = 0, HAZARD_GLYPH: i32 = 1, TRAFFIC_GLYPH: i32 = 2;

export function drawGlyph(kind: i32, x: number, y: number, s: number, color: u32, ink: u32): void {
  const b = new Box(x, y, s);
  if (kind === POLICE_GLYPH) {
    polygon(b.pts([0.5, 0.1, 0.84, 0.24, 0.8, 0.58, 0.5, 0.9, 0.2, 0.58, 0.16, 0.24]), color, 255);
    // a star on the shield
    const star: number[] = [];
    for (let i: i32 = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 0.17 : 0.075, a = (-90 + i * 36) * RAD;
      star.push(0.5 + Math.cos(a) * r); star.push(0.47 + Math.sin(a) * r);
    }
    polygon(b.pts(star), ink, 255);
  } else if (kind === HAZARD_GLYPH) {
    const tri = b.pts([0.5, 0.12, 0.9, 0.84, 0.1, 0.84]);
    polygon(tri, color, 255);
    stroke(tri, s * 0.08, color, 255, true);
    rrect(x + s * 0.455, y + s * 0.36, s * 0.09, s * 0.26, s * 0.04, ink, 255);
    rrect(x + s * 0.455, y + s * 0.67, s * 0.09, s * 0.09, s * 0.045, ink, 255);
  } else {
    // a car seen from behind
    polygon(b.pts([0.28, 0.46, 0.35, 0.24, 0.65, 0.24, 0.72, 0.46]), color, 255);
    rrect(x + s * 0.16, y + s * 0.44, s * 0.68, s * 0.26, s * 0.08, color, 255);
    rrect(x + s * 0.22, y + s * 0.68, s * 0.14, s * 0.14, s * 0.04, color, 255);
    rrect(x + s * 0.64, y + s * 0.68, s * 0.14, s * 0.14, s * 0.04, color, 255);
    rrect(x + s * 0.23, y + s * 0.52, s * 0.1, s * 0.07, s * 0.03, ink, 255);
    rrect(x + s * 0.67, y + s * 0.52, s * 0.1, s * 0.07, s * 0.03, ink, 255);
  }
}

// ---------------------------------------------------------------- button icons
export const PLAY_ICON: i32 = 0, PAUSE_ICON: i32 = 1, RESTART_ICON: i32 = 2, MOON_ICON: i32 = 3, SUN_ICON: i32 = 4,
  RECENTER_ICON: i32 = 5, UP_ICON: i32 = 6, DOWN_ICON: i32 = 7, CLOSE_ICON: i32 = 8, REPORT_ICON: i32 = 9;

export function drawIcon(kind: i32, x: number, y: number, s: number, color: u32): void {
  const b = new Box(x, y, s), lw = Math.max(1.6, s * 0.1);
  if (kind === PLAY_ICON) polygon(b.pts([0.3, 0.18, 0.84, 0.5, 0.3, 0.82]), color, 255);
  else if (kind === PAUSE_ICON) {
    rrect(x + s * 0.24, y + s * 0.2, s * 0.17, s * 0.6, s * 0.04, color, 255);
    rrect(x + s * 0.59, y + s * 0.2, s * 0.17, s * 0.6, s * 0.04, color, 255);
  } else if (kind === RESTART_ICON) {
    const p: number[] = [];
    arc(p, 0.5, 0.52, 0.3, -80, 215);
    arrow(b.pts(p), lw, color, 255);
  } else if (kind === MOON_ICON) {
    // crescent: the big circle's arc, then back along a smaller offset circle between their intersections
    const p: number[] = [];
    arc(p, 0.5, 0.5, 0.34, -30, 250);
    arc(p, 0.64, 0.36, 0.25, 175, -65);
    polygon(b.pts(p), color, 255);
  } else if (kind === SUN_ICON) {
    const p: number[] = [];
    arc(p, 0.5, 0.5, 0.18, 0, 360);
    polygon(b.pts(p), color, 255);
    for (let i: i32 = 0; i < 8; i++) {
      const a = i * 45 * RAD, c = Math.cos(a), sn = Math.sin(a);
      stroke(b.pts([0.5 + c * 0.29, 0.5 + sn * 0.29, 0.5 + c * 0.4, 0.5 + sn * 0.4]), lw * 0.8, color, 255, false);
    }
  } else if (kind === RECENTER_ICON) polygon(b.pts([0.5, 0.12, 0.8, 0.84, 0.5, 0.66, 0.2, 0.84]), color, 255);
  else if (kind === UP_ICON) stroke(b.pts([0.22, 0.62, 0.5, 0.36, 0.78, 0.62]), lw, color, 255, false);
  else if (kind === DOWN_ICON) stroke(b.pts([0.22, 0.38, 0.5, 0.64, 0.78, 0.38]), lw, color, 255, false);
  else if (kind === CLOSE_ICON) {
    stroke(b.pts([0.28, 0.28, 0.72, 0.72]), lw, color, 255, false);
    stroke(b.pts([0.72, 0.28, 0.28, 0.72]), lw, color, 255, false);
  } else if (kind === REPORT_ICON) {
    // speech bubble with an exclamation mark
    rrect(x + s * 0.14, y + s * 0.16, s * 0.72, s * 0.52, s * 0.16, color, 255);
    polygon(b.pts([0.3, 0.6, 0.48, 0.64, 0.26, 0.86]), color, 255);
    rrect(x + s * 0.46, y + s * 0.25, s * 0.08, s * 0.22, s * 0.04, 0xff7a00, 255);
    rrect(x + s * 0.46, y + s * 0.51, s * 0.08, s * 0.08, s * 0.04, 0xff7a00, 255);
  }
}
