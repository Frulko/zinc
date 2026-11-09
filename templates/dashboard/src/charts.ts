// Charts drawn into a <Canvas>: a line and the point where it ends, and bars (docs/design.md: no gradient under a line). Values are scaled to [0, top].
import { rect, rrect, stroke } from 'zinc:gfx';

export function drawLine(values: number[], top: number, x: number, y: number, w: number, h: number, line: u32, grid: u32): void {
  for (let i = 1; i < 4; i++) rect(x, Math.round(y + h * i / 4), w, 1, grid);
  if (values.length < 2) return;
  const pts: number[] = [];
  for (let i = 0; i < values.length; i++) { pts.push(x + i * w / (values.length - 1)); pts.push(y + h - Math.min(1, values[i] / top) * h); }
  stroke(pts, 1.75, line, 255, false);
  rrect(pts[pts.length - 2] - 3, pts[pts.length - 1] - 3, 6, 6, 3, line, 255);
}

export function drawBars(values: number[], top: number, x: number, y: number, w: number, h: number, bar: u32, grid: u32): void {
  rect(x, y + h - 1, w, 1, grid);
  const n = Math.max(1, values.length), bw = w / n;
  for (let i = 0; i < values.length; i++) {
    const bh = Math.min(1, values[i] / top) * (h - 2);
    if (bh > 0) rrect(x + i * bw + 1, y + h - 1 - bh, Math.max(1, bw - 2), bh, 2, bar, 255);
  }
}
