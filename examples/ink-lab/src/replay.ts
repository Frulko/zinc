// Scripted session (tests/t1/ink_lab.sh): INK_LAB_REPLAY=<file> replays marks through the live pen path (Ink.feed, grouper, recogniser),
// then prints the lab's state and quits. { "steps": [ { "s": [[x, y, ...], ...] } | { "undo": true } | { "restart": true } | { "mode": n } ] },
// x, y are fractions of the writing rectangle (0..1).
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { quit } from 'zinc:gfx';
import { Recognition } from 'zinc:ink';
import { Mark, ink, marks, guess, label, restart, undoStroke, chooseMode } from './lab';

interface Step { s?: number[][]; undo?: boolean; restart?: boolean; mode?: number; log?: boolean; }
interface Script { steps: Step[]; }

const file = sys.env('INK_LAB_REPLAY');
const script: Script | null = file !== '' ? JSON.parse(fs.readText(file)) as Script : null;
let step: i32 = 0, stroke: i32 = 0, at: i32 = 0, wait: i32 = 0, warm: i32 = 6, padW: number = 0, padH: number = 0;
const PER_FRAME: i32 = 6;

export function setPad(w: number, h: number): void { padW = w; padH = h; }

/** One frame of the script, called before the frame's draw. */
export function replayStep(): void {
  if (script === null) return;
  if (warm > 0 || padW === 0) { if (padW > 0) warm--; return; }
  if (wait > 0) { wait--; return; }
  if (step >= script.steps.length) { quit(); return; }
  const st = script.steps[step];
  if (st.log === true) {
    console.log('lab-state marks=' + marks().map((m: Mark): string => m.r === null ? '?' : label(m.r)).join(',') + ' ink=' + ink.strokes.length + ' guess=' + (guess() === null ? '-' : label(guess() as Recognition)));
    step++; return;
  }
  if (st.undo === true) { undoStroke(); step++; wait = 40; return; }
  if (st.restart === true) { restart(); step++; wait = 10; return; }
  if (st.mode !== undefined) { chooseMode(st.mode); step++; wait = 40; return; }
  const strokes = st.s as number[][];
  const pts = strokes[stroke];
  for (let k = 0; k < PER_FRAME && at < pts.length; k++, at += 2) ink.feed(pts[at] * padW, pts[at + 1] * padH, 0.6, 1);
  if (at >= pts.length) {   // pen up
    ink.feed(0, 0, 0, 0);
    at = 0; stroke++;
    if (stroke >= strokes.length) { stroke = 0; step++; wait = 60; }   // 60 frames of 16 ms: past the 250 ms debounce, the answer is in
  }
}
