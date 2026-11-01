// Scripted pen session (ZN-935 test): MURDOKU_PEN_REPLAY=<file> replays marks through the live pen path (Ink.feed, the grouper, the
// recogniser, the game's actions) and a two-finger tap through the engine's touch path, then prints the state and quits.
// { "steps": [ { "cell": 29, "s": [[x, y, x, y...], ...] } | { "undo": true } ] }; x, y are fractions of the cell (0..1).
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { quit } from 'zinc:gfx';
import { touchAt } from 'zinc:ui';
import { puzzle, placements, notes, eliminated } from './state';
import { cellSize } from './layout';
import { ink, ox, oy, feedEnd } from './pen';

interface Step { cell?: number; s?: number[][]; undo?: boolean; }
interface Script { steps: Step[]; }

const file = sys.env('MURDOKU_PEN_REPLAY');
const script: Script | null = file !== '' ? JSON.parse(fs.readText(file)) as Script : null;
let step: i32 = 0, stroke: i32 = 0, at: i32 = 0, wait: i32 = 0, phase: i32 = 0, warm: i32 = 6, crossed: number = 0;
const PER_FRAME: i32 = 6;

/** One frame of the script, called before the frame's draw. */
export function replayStep(): void {
  if (script === null) return;
  if (warm > 0) { warm--; return; }   // the first frames lay the plan out
  if (wait > 0) { wait--; return; }
  if (step >= script.steps.length) {
    console.log('pen-state placements=' + placements().join(',') + ' notes=' + notes().join(',') + ' eliminated=' + eliminated().join(',') + ' ink=' + ink.strokes.length + ' crossed=' + crossed);
    quit(); return;
  }
  const st = script.steps[step];
  if (st.undo === true) {   // a two-finger tap: both down in one frame, both up in the next
    if (phase === 0) { crossed = eliminated().reduce((a: number, b: number) => a + b, 0); touchAt(1, 5, 5, 0); touchAt(2, 40, 5, 0); phase = 1; return; }
    touchAt(2, 40, 5, 2); touchAt(1, 5, 5, 2);
    phase = 0; step++; wait = 40; return;   // 40 frames of 16 ms: settled
  }
  const cs = cellSize(), c = st.cell as number, p = puzzle();
  const x0 = ox + (c % p.columns) * cs, y0 = oy + Math.floor(c / p.columns) * cs;
  const strokes = st.s as number[][];
  const pts = strokes[stroke];
  for (let k = 0; k < PER_FRAME && at < pts.length; k++, at += 2) ink.feed(x0 + pts[at] * cs, y0 + pts[at + 1] * cs, 0.6, 1);
  if (at >= pts.length) {   // pen up
    ink.feed(0, 0, 0, 0);
    at = 0; stroke++;
    if (stroke >= strokes.length) { stroke = 0; step++; wait = 60; }   // 60 frames: past the 450 ms debounce, and the recogniser answers
  }
  feedEnd();
}
