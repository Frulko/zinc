// Pen input (ZN-935): the strokes written on the plan are grouped into marks, each mark is attributed to a cell and named by zinc:ink; the
// name becomes one of the existing actions, so deduction.ts and state.ts stay the only rules: a letter in a circle places that person,
// a bare letter is a pencil note, an X crosses the cell out. What is not recognised stays on the page as ink; what is recognised is
// erased and the cell shows the typeset state (docs/reports/murdoku-eink-handwriting.md s2 D-d, s3).
import { Ink, Stroke, StrokeGrouper, recogniseAsync, Recognition, RecogniseOptions } from 'zinc:ink';
import { refreshRect } from 'zinc:gfx';
import { puzzle, placements, notes, eliminated, setActiveCell, setSelected, place, toggleElimination } from './state';
import { personLetter } from './puzzle';
import { cellSize } from './layout';

export const ink = new Ink();
ink.width = 4; ink.overlay = true;
const grouper = new StrokeGrouper({ debounceMs: 450, gapPx: 40 });
let nowMs: number = 0;
export let ox: number = 0, oy: number = 0;   // the plan's top left corner on the surface, as the overlay canvas drew last
let was: Stroke | null = null;

/** The plan's overlay canvas draws here: it feeds the pen samples of the frame and the finished strokes go to the grouper. */
export function penDraw(x: i32, y: i32, w: i32, h: i32): void {
  ox = x; oy = y;
  ink.draw(x, y, w, h);
  feedEnd();
}
/** A stroke that was live and is not any more is finished: the grouper takes it. (Scripted replays call ink.feed, then this.) */
export function feedEnd(): void {
  if (was !== null && ink.live === null) grouper.add(was, nowMs);
  was = ink.live;
}

/** Cell under a mark: the one holding at least 60 % of the mark's box (by area), else -1 (several cells: stays ink). */
export function cellOf(x0: number, y0: number, x1: number, y1: number): number {
  const cs = cellSize(), p = puzzle();
  const cx = Math.floor(((x0 + x1) / 2 - ox) / cs), cy = Math.floor(((y0 + y1) / 2 - oy) / cs);
  if (cx < 0 || cy < 0 || cx >= p.columns || cy >= p.rows) return -1;
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  const iw = Math.min(x1, ox + (cx + 1) * cs) - Math.max(x0, ox + cx * cs), ih = Math.min(y1, oy + (cy + 1) * cs) - Math.max(y0, oy + cy * cs);
  return iw > 0 && ih > 0 && iw * ih >= 0.6 * w * h ? cy * p.columns + cx : -1;
}

function person(letter: string): number {
  for (let a = 0; a < 6; a++) if (personLetter(puzzle(), a) === letter) return a;
  return -1;
}

/** Applies a recognised mark to a cell through the game's own actions; true when the game state changed. */
function act(cell: number, r: Recognition): boolean {
  const p0 = placements(), n0 = notes(), e0 = eliminated();
  const top = r.candidates.length > 0 ? r.candidates[0].label : '';
  if (r.kind === 'letter') {
    const a = person(top);
    if (a >= 0) { setSelected(a); place(cell, !r.circled); }
  } else if (r.kind === 'shape' && top === 'x') {
    setActiveCell(cell); toggleElimination();
  }
  return p0 !== placements() || n0 !== notes() || e0 !== eliminated();
}

function settle(group: Stroke[], r: Recognition): void {
  const cell = cellOf(r.box.x, r.box.y, r.box.x + r.box.w, r.box.y + r.box.h);
  if (cell < 0 || !act(cell, r)) return;   // unknown, or refused by the game: the ink stays
  ink.setStrokes(ink.strokes.filter((s: Stroke): boolean => group.indexOf(s) < 0));
  const cs = cellSize(), p = puzzle();
  refreshRect(ox + (cell % p.columns) * cs, oy + Math.floor(cell / p.columns) * cs, cs, cs, 'quality');   // the typeset state, one clean refresh
}

function classify(group: Stroke[]): void {
  const priors = new Map<string, number>();
  const letters: string[] = [];
  for (let a = 0; a < 6; a++) {
    letters.push(personLetter(puzzle(), a));
    if (placements()[a] >= 0) priors.set(personLetter(puzzle(), a), 0.2);   // a letter already placed is less likely
  }
  const opts: RecogniseOptions = { classes: letters.concat(['circle', 'x']), priors };
  recogniseAsync(group, opts).then((r: Recognition) => settle(group, r));
}

/** Once per frame (dt seconds): finished groups are named. */
export function penStep(dt: number): void {
  nowMs += dt * 1000;
  const groups = grouper.poll(nowMs);
  if (groups !== null) for (const g of groups) classify(g);
}
