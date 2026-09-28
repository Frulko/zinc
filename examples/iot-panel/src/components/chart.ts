// The temperature chart: an onDraw callback painting the sensor history with zinc:gfx (a canvas redraws every
// frame, which suits a live curve).
import { rect, stroke } from 'zinc:gfx';
import { history, HISTORY_LENGTH, MIN_C, MAX_C } from '../sensor';

const GRID_COLOR: u32 = 0xf4f4f5;   // zinc-100
const LINE_COLOR: u32 = 0x4f46e5;   // indigo-600

/** Screen y of a temperature inside a box of height h starting at y. */
function yOf(celsius: number, y: i32, h: i32): number {
  return y + h - (celsius - MIN_C) * h / (MAX_C - MIN_C);
}

export function drawChart(x: i32, y: i32, w: i32, h: i32): void {
  rect(x, y, w, h, 0xffffff);
  for (let c = MIN_C; c <= MAX_C; c += 5) rect(x, Math.round(yOf(c, y, h)), w, 1, GRID_COLOR);
  const points: number[] = [];
  for (let i = 0; i < history.length; i++) {
    points.push(x + i * w / (HISTORY_LENGTH - 1));
    points.push(yOf(history[i], y, h));
  }
  if (points.length >= 4) stroke(points, 2, LINE_COLOR, 255, false);
}
