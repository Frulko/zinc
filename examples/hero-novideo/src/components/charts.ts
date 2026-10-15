// Canvas charts for the Home screen: a streaming area chart with a hover crosshair, and concentric progress rings.
import { rect, rrect, polygon, stroke, font, drawText, textWidth } from 'zinc:gfx';

const POINTS: i32 = 90;

/** A random walk sampled 8 times a second; the chart scrolls smoothly between samples. */
export class LiveSeries {
  values: number[] = [];
  private acc: number = 0;
  private seed: number = 7;
  hoverX: number = -1;   // pointer x inside the chart, -1 when outside
  constructor() { let v = 50; for (let i = 0; i < POINTS; i++) { v = this.next(v); this.values.push(v); } }
  private rand(): number { this.seed = (this.seed * 16807) % 2147483647; return (this.seed - 1) / 2147483646; }
  private next(v: number): number { return Math.max(8, Math.min(95, v + (this.rand() - 0.5) * 14 + (50 - v) * 0.04)); }
  step(dt: number): void {
    this.acc += dt * 8;
    while (this.acc >= 1) { this.acc -= 1; this.values.shift(); this.values.push(this.next(this.values[this.values.length - 1])); }
  }
  /** Fraction of the way to the next sample (0..1), for the smooth scroll. */
  phase(): number { return this.acc; }
  last(): number { return this.values[this.values.length - 1]; }
}

let labelFont: i32 = -1;

export function drawArea(s: LiveSeries, x: number, y: number, w: number, h: number, reveal: number,
  line: u32, grid: u32, text: u32): void {
  if (labelFont < 0) labelFont = font('sans', 12);
  for (let i = 1; i < 4; i++) rect(x, Math.round(y + h * i / 4), w, 1, grid);
  const step = w / (POINTS - 2), off = s.phase() * step;
  const px = (i: i32): number => x + i * step - off;
  // values rise from the baseline while the screen enters (reveal 0 → 1)
  const py = (i: i32): number => y + h - (s.values[i] / 100) * h * reveal;
  const top: number[] = [];
  for (let i = 0; i < POINTS; i++) { top.push(Math.max(x, Math.min(x + w, px(i)))); top.push(py(i)); }
  const area = top.slice();
  area.push(x + w); area.push(y + h); area.push(x); area.push(y + h);
  polygon(area, line, 40);
  stroke(top, 2.5, line, 255, false);
  if (s.hoverX >= 0) {
    const i: i32 = Math.max(0, Math.min(POINTS - 1, Math.round((s.hoverX + off) / step)));
    const hx = px(i), hy = py(i);
    rect(Math.round(hx), y, 1, h, grid);
    rrect(hx - 5, hy - 5, 10, 10, 5, 0xffffff, 255);
    rrect(hx - 3.5, hy - 3.5, 7, 7, 3.5, line, 255);
    const label = `${Math.round(s.values[i])} req/s`;
    const lw = textWidth(labelFont, label, 0) + 16;
    const lx = Math.min(x + w - lw, Math.max(x, hx - lw / 2));
    rrect(lx, y + 4, lw, 24, 6, text, 235);
    drawText(labelFont, lx + 8, y + 9, label, 0xffffff, 255, 0);
  }
}

/** Concentric arcs, outermost first; `values` in 0..1. */
export function drawRings(values: number[], colors: u32[], track: u32, x: number, y: number, w: number, h: number): void {
  const cx = x + w / 2, cy = y + h / 2, r0 = Math.min(w, h) / 2 - 8, width = Math.max(6, r0 * 0.16);
  for (let k = 0; k < values.length; k++) {
    const r = r0 - k * (width + 5);
    const full: number[] = [];
    for (let i = 0; i < 64; i++) { full.push(cx + Math.cos(i * 0.0982) * r); full.push(cy + Math.sin(i * 0.0982) * r); }
    stroke(full, width, track, 255, true);
    const v = Math.max(0, Math.min(1, values[k]));
    if (v <= 0.001) continue;
    const arc: number[] = [];
    const n: i32 = Math.max(2, Math.round(64 * v));
    for (let i = 0; i <= n; i++) { const a = -1.5708 + 6.2831853 * v * i / n; arc.push(cx + Math.cos(a) * r); arc.push(cy + Math.sin(a) * r); }
    stroke(arc, width, colors[k], 255, false);
    // round caps
    rrect(arc[0] - width / 2, arc[1] - width / 2, width, width, width / 2, colors[k], 255);
    rrect(arc[arc.length - 2] - width / 2, arc[arc.length - 1] - width / 2, width, width, width / 2, colors[k], 255);
  }
}
