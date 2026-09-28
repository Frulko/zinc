// Canvas drawings for the dashboard: a 270° arc gauge and a streaming area chart. Plain zinc:gfx calls; the frame
// diff redraws only what moved, so a still gauge costs no pixels even though the canvas repaints every frame.
import { rrect, polygon, stroke, rect, font, drawText, textWidth, clip, unclip } from 'zinc:gfx';

const START: number = 2.356;   // 135°: the gauge opens at the bottom
const SWEEP: number = 4.712;   // 270°

function arc(cx: number, cy: number, r: number, from: number, to: number, segments: i32): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = from + (to - from) * i / segments;
    pts.push(cx + Math.cos(a) * r); pts.push(cy + Math.sin(a) * r);
  }
  return pts;
}

let big: i32 = -1, small: i32 = -1;

/** Arc gauge filling (x, y, w, h); `value` 0..1, shown in the middle as a percentage. */
export function drawGauge(x: number, y: number, w: number, h: number, value: number, color: u32, track: u32, text: u32, muted: u32): void {
  if (big < 0) { big = font('sans-bold', 24); small = font('sans', 10); }
  const cx = x + w / 2, cy = y + h / 2 + 4, r = Math.min(w, h) / 2 - 8, lw = 9;
  stroke(arc(cx, cy, r, START, START + SWEEP, 36), lw, track, 255, false);
  const v = Math.max(0.005, Math.min(1, value));
  const end = START + SWEEP * v;
  stroke(arc(cx, cy, r, START, end, Math.max(2, Math.round(36 * v))), lw, color, 255, false);
  // knob at the tip
  const kx = cx + Math.cos(end) * r, ky = cy + Math.sin(end) * r;
  rrect(kx - 3, ky - 3, 6, 6, 3, 0xffffff, 255);
  const label = `${Math.round(value * 100)}%`;
  drawText(big, cx - textWidth(big, label, 0) / 2, cy - 16, label, text, 255, 0);
  drawText(small, cx - textWidth(small, 'LOAD', 1) / 2, cy + 12, 'LOAD', muted, 255, 1);
}

/** Area chart of `values` (0..100), scrolled left by `phase` of a sample; the newest value rides the right edge. */
export function drawArea(values: number[], phase: number, x: number, y: number, w: number, h: number, color: u32, grid: u32): void {
  for (let i = 1; i < 4; i++) rect(x, Math.round(y + h * i / 4), w, 1, grid);
  const n = values.length;
  const step = w / (n - 2), off = phase * step;
  const py = (v: number): number => y + h - v / 100 * (h - 6);
  const line: number[] = [];
  for (let i = 0; i < n; i++) { line.push(x + i * step - off); line.push(py(values[i])); }
  const area = line.slice();
  area.push(line[line.length - 2]); area.push(y + h); area.push(line[0]); area.push(y + h);
  clip(x, y, w, h);
  polygon(area, color, 48);
  stroke(line, 2, color, 255, false);
  unclip();
  const edge = py(values[n - 2] + (values[n - 1] - values[n - 2]) * phase);
  rrect(x + w - 3.5, edge - 3.5, 7, 7, 3.5, color, 255);
}
