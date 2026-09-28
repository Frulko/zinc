// The canvas behind the hero: a faint dot grid and two soft colour glows drifting slowly.
// An onDraw callback paints with zinc:gfx directly; it runs every frame while a canvas is on screen.
import { rect, rrect } from 'zinc:gfx';
import { time } from '../state';

const GRID: i32 = 24;             // dot spacing in px
const DOT: u32 = 0xe4e4e7;        // zinc-200

const GLOW_STEPS: i32 = 12;

/** A soft glow: many faint concentric discs, denser toward the centre. */
function glow(cx: number, cy: number, radius: number, color: u32): void {
  for (let k = GLOW_STEPS; k >= 1; k--) {
    const r = radius * k / GLOW_STEPS;
    rrect(cx - r, cy - r, r * 2, r * 2, r, color, 7);
  }
}

export function drawBackdrop(x: i32, y: i32, w: i32, h: i32): void {
  rect(x, y, w, h, 0xfafafa);
  const t = time();
  glow(x + w * 0.25 + Math.sin(t * 0.4) * 40, y + h * 0.35, h * 0.45, 0xc7d2fe);   // indigo-200
  glow(x + w * 0.75 + Math.cos(t * 0.3) * 40, y + h * 0.65, h * 0.40, 0xe0e7ff);   // indigo-100
  for (let gy = GRID; gy < h; gy += GRID) {
    for (let gx = GRID; gx < w; gx += GRID) rect(x + gx, y + gy, 2, 2, DOT);
  }
}
