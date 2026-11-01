import { drawDots, project, rgb } from '../pixel';
import { appealTiles } from '../rules/appeal';
import { tileX, tileY } from '../world/world';

// The desirability overlay (settings.appeal): a tinted dot on each tile, green where it is pleasant to live, red where it is not; bigger for a stronger value.
const GOOD = rgb(96, 206, 118), BAD = rgb(222, 82, 70);

/** Screen position and colour of each dot: sx, sy, colour (a negative value is BAD), strength 1 to 3. */
export function appealMarks(): number[] {
  const out: number[] = [];
  for (const [t, v] of appealTiles()) { const a = project(tileX(t), tileY(t), 0); out.push(a.sx, a.sy, v > 0 ? GOOD : BAD, Math.min(3, Math.abs(v))); }
  return out;
}
export function drawMarks(marks: number[]): void {
  for (let k = 0; k < marks.length; k += 4) {
    const x = Math.round(marks[k]), y = Math.round(marks[k + 1]), r = marks[k + 3] - 1, pts: number[][] = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dy) <= r) pts.push([x + dx, y + dy]);
    drawDots(pts, marks[k + 2]);
  }
}
