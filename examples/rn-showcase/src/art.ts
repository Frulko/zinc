// Generative covers and the chart, drawn on canvases (zinc:gfx): no image assets, deterministic for the goldens.
import { rrect, polygon, stroke, gradient, drawText, font } from 'zinc:gfx';
import { Palette } from './theme';

function hash(seed: i32, k: i32): number { let x = (seed * 374761393 + k * 668265263) % 2147483647; if (x < 0) x = -x; return (x % 10000) / 10000; }

/** A cover: a two-colour field with soft circles and a horizon, varied by `seed`. */
export function cover(x: number, y: number, w: number, h: number, seed: i32, c1: i32, c2: i32, p: Palette): void {
  gradient(x, y, w, h, 0, c1 as u32, c2 as u32, true, 255);
  for (let i = 0; i < 5; i++) {
    const r = 18 + hash(seed, i) * w * 0.28, cx = x + hash(seed, i + 9) * w, cy = y + hash(seed, i + 17) * h * 0.8;
    rrect(cx - r, cy - r, r * 2, r * 2, r, 0xFFFFFF, 18 + Math.round(hash(seed, i + 3) * 40));
  }
  const pts: number[] = [];
  const base = y + h * (0.62 + hash(seed, 31) * 0.15);
  pts.push(x); pts.push(y + h);
  for (let i = 0; i <= 8; i++) { pts.push(x + w * i / 8); pts.push(base - hash(seed, 40 + i) * h * 0.22); }
  pts.push(x + w); pts.push(y + h);
  polygon(pts, p.ink as u32, 70);
}

/** The weekly chart: rounded bars and a smoothed line of the same data, with day labels. */
export function chart(x: number, y: number, w: number, h: number, data: number[], p: Palette): void {
  const f = font('sans', 12);
  const max = 10;
  const n = data.length, gap = 10, bw = (w - gap * (n - 1)) / n, ch = h - 22;
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const line: number[] = [];
  for (let i = 0; i < n; i++) {
    const bh = Math.max(6, ch * data[i] / max), bx = x + i * (bw + gap);
    rrect(bx, y + ch - bh, bw, bh, Math.min(10, bw / 2), (i === n - 2 ? p.accent : p.raised) as u32, 255);
    line.push(bx + bw / 2); line.push(y + ch - bh - 10);
    drawText(f, bx + bw / 2 - 4, y + ch + 6, days[i], p.muted as u32, 255, 0);
  }
  stroke(line, 2.5, p.teal as u32, 255, false);
}
