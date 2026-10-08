// Charts drawn into a <Canvas>: a line with its area, and bars. Values are scaled to [0, top].
import { rect, rrect, polygon, stroke } from 'zinc:gfx';

/** A theme colour ('#rrggbb') as the 0xRRGGBB the drawing calls take. */
export function rgb(c: string): u32 { return parseInt(c.slice(1), 16); }

export function drawLine(values: number[], top: number, x: number, y: number, w: number, h: number, line: u32, grid: u32): void {
  for (let i = 1; i < 4; i++) rect(x, Math.round(y + h * i / 4), w, 1, grid);
  if (values.length < 2) return;
  const pts: number[] = [];
  for (let i = 0; i < values.length; i++) { pts.push(x + i * w / (values.length - 1)); pts.push(y + h - Math.min(1, values[i] / top) * h); }
  const area = pts.slice();
  area.push(x + w); area.push(y + h); area.push(x); area.push(y + h);
  polygon(area, line, 36);
  stroke(pts, 2, line, 255, false);
}

export function drawBars(values: number[], top: number, x: number, y: number, w: number, h: number, bar: u32, grid: u32): void {
  rect(x, y + h - 1, w, 1, grid);
  const n = Math.max(1, values.length), bw = w / n;
  for (let i = 0; i < values.length; i++) {
    const bh = Math.min(1, values[i] / top) * (h - 2);
    if (bh > 0) rrect(x + i * bw + 1, y + h - 1 - bh, Math.max(1, bw - 2), bh, 2, bar, 255);
  }
}
