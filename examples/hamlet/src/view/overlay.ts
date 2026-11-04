import { drawDots, project, rgb } from '../pixel';
import { appealTiles } from '../rules/appeal';
import { tileX, tileY, tileIndex, world, footprint } from '../world/world';
import { economy } from '../world/economy';
import { isRuin } from '../engine/risk';

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

// The risk overlay (calque "Risques"): per building, the dearest of its fire, wear and theft counters against the line where the event happens. `kind` 0 fire, 1 collapse, 2 theft, 3 a ruin;
// `level` 0 safe (under a third of the line), 1 rising, 2 close. Read from the same counters as engine/risk.ts, so the picture is the truth of the simulation.
export const RISK_FIRE = 0, RISK_COLLAPSE = 1, RISK_CRIME = 2, RISK_RUIN = 3;
export function riskTiles(): number[][] {
  const out: number[][] = [], r = economy.risk;
  if (!world.risks) return out;
  for (const b of world.buildings) {
    if (!b.alive || b.fixed || economy.buildings[b.type].risk === null && !isRuin(b.type)) continue;
    if (isRuin(b.type)) { for (const t of footprint(b)) out.push([t, 2, RISK_RUIN]); continue; }
    const f = b.fire / r.fireAt, c = b.damage / r.collapseAt, k = b.crime / r.crimeAt, top = Math.max(f, c, k);
    for (const t of footprint(b)) out.push([t, top < .35 ? 0 : top < .7 ? 1 : 2, top === f ? RISK_FIRE : top === c ? RISK_COLLAPSE : RISK_CRIME]);
  }
  return out;
}

// The thought bubbles over the heads of people who are not content (settings.thoughts): a small speech bubble whose centre says what is wrong by its colour.
const BUBBLE: string[] = ['.ooooooo.', 'oWWWWWWWo', 'oWXXXXXWo', 'oWXXXXXWo', 'oWWWWWWWo', '.oooWooo.', '....oWo..', '.....o...'];
const BUBBLE_INK = rgb(40, 32, 28), BUBBLE_PAPER = rgb(250, 244, 230);
const FEEL_COLORS: number[] = [0, 0, rgb(232, 140, 40), rgb(110, 150, 220), rgb(240, 210, 60), rgb(160, 160, 160), rgb(214, 60, 50)];
/** The colour of the bubble of a FEEL_* state, 0 when that state shows none (content, so-so). */
export function bubbleColor(feel: number): number { return FEEL_COLORS[feel]; }
export function drawBubble(sx: number, sy: number, color: number): void {
  const left = Math.round(sx) - 4, top = Math.round(sy) - BUBBLE.length, ink: number[][] = [], paper: number[][] = [], fill: number[][] = [];
  BUBBLE.forEach((row: string, y: number): void => { for (let x = 0; x < row.length; x++) { const c = row[x]; if (c === 'o') ink.push([left + x, top + y]); else if (c === 'W') paper.push([left + x, top + y]); else if (c === 'X') fill.push([left + x, top + y]); } });
  drawDots(ink, BUBBLE_INK); drawDots(paper, BUBBLE_PAPER); drawDots(fill, color);
}
