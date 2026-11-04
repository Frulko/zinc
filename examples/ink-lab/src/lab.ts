// The lab's state: the strokes on the writing rectangle, the marks that settled, the live guess. Recognition is zinc:ink's
// (recogniseAsync on a worker thread); this file only decides when to ask and what to keep.
import { createSignal } from 'zinc:ui/solid';
import { Ink, Stroke, StrokeGrouper, recogniseAsync, Recognition, RecogniseOptions, netLoadBase64, netLoadBuiltin } from 'zinc:ink';
import { SYNTHETIC_NET } from './synthetic-net';

export const MODES: string[] = ['letters', 'shapes', 'all'];   // digits: no digit class in the model yet (docs/reports/handwriting-research-2026-11.md)
const CLASSES: string[][] = [['A', 'B', 'C', 'D', 'E', 'V'], ['circle', 'x', 'tick', 'line'], []];   // [] = every class of the model
const LIVE_EVERY_MS = 120;      // while the pen is down, a new guess at most this often

export class Mark { strokes: Stroke[] = []; r: Recognition | null = null; box: number[] = [0, 0, 0, 0]; }
export const ink = new Ink();
ink.width = 5;   // as Quill Lab's scribble: baked strokes, the live one drawn sample by sample on the Pen waveform
const grouper = new StrokeGrouper({ gapPx: 60 });
export const [mode, setMode] = createSignal(2);
export const [guess, setGuess] = createSignal<Recognition | null>(null);   // the live answer for the mark being written
export const [marks, setMarks] = createSignal<Mark[]>([]);               // settled marks, oldest first
export const [latency, setLatency] = createSignal(0);                    // pen-up (or last sample) -> answer shown, ms
let nowMs: number = 0;
let was: Stroke | null = null, seq: i32 = 0, lastAsk: number = -1e9;

function options(): RecogniseOptions { const c = CLASSES[mode()]; return c.length > 0 ? { classes: c } : {}; }

function boxOf(g: Stroke[]): number[] {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const s of g) { x0 = Math.min(x0, s.x0); y0 = Math.min(y0, s.y0); x1 = Math.max(x1, s.x1); y1 = Math.max(y1, s.y1); }
  return [x0, y0, x1, y1];
}

/** Asks for the guess of strokes; an answer that arrives after a newer question is dropped. */
function ask(strokes: Stroke[], t0: number): void {
  if (strokes.length === 0) { seq++; setGuess(null); return; }
  const my = ++seq;
  lastAsk = nowMs;
  recogniseAsync(strokes, options()).then((r: Recognition) => {
    if (my !== seq) return;
    setGuess(r); setLatency(Math.round(nowMs - t0));
  });
}

function near(a: Stroke, g: Stroke[]): boolean {
  for (const s of g) if (!(a.x0 - 60 > s.x1 || a.x1 + 60 < s.x0 || a.y0 - 60 > s.y1 || a.y1 + 60 < s.y0)) return true;
  return false;
}

function settle(g: Stroke[]): void {
  const m = new Mark(); m.strokes = g; m.box = boxOf(g);
  recogniseAsync(g, options()).then((r: Recognition) => {
    const i = marks().indexOf(m);
    if (i < 0) return;   // restarted or undone meanwhile
    const done = new Mark(); done.strokes = g; done.box = m.box; done.r = r;   // a new object: the list row redraws
    const ms = marks().slice(); ms[i] = done; setMarks(ms);
  });
  setMarks(marks().concat([m]));
}

/** Called after the writing canvas drew (it consumed the frame's pen samples): feeds the grouper, asks for guesses. */
export function afterDraw(): void {
  const live = ink.live;
  if (was !== null && live === null) { grouper.add(was, nowMs); ask(grouper.open, nowMs); }   // pen up: the guess at once
  else if (live !== null && nowMs - lastAsk >= LIVE_EVERY_MS && live.count() > 3) {
    ask(near(live, grouper.open) ? grouper.open.concat([live]) : [live], nowMs);             // pen down: a partial guess
  }
  was = live;
}

/** Once per frame (dt seconds): marks with no new stroke for the grouper's debounce settle. */
export function labStep(dt: number): void {
  nowMs += dt * 1000;
  const groups = grouper.poll(nowMs);
  if (groups !== null) for (const g of groups) settle(g);
}

export function restart(): void {
  ink.setStrokes([]); grouper.open = []; grouper.done = []; was = null; seq++;
  setMarks([]); setGuess(null); setLatency(0);
}

/** Takes the last stroke back, wherever it is, and reads again what is left of its mark. */
export function undoStroke(): void {
  if (ink.strokes.length === 0) return;
  const last = ink.strokes[ink.strokes.length - 1];
  ink.setStrokes(ink.strokes.slice(0, ink.strokes.length - 1));
  if (grouper.open.indexOf(last) >= 0) { grouper.open = grouper.open.filter((s: Stroke): boolean => s !== last); ask(grouper.open, nowMs); return; }
  const ms = marks().slice(), m = ms.length > 0 ? ms[ms.length - 1] : null;
  if (m === null) return;
  ms.pop(); setMarks(ms); setGuess(null);
  const rest = m.strokes.filter((s: Stroke): boolean => s !== last);
  if (rest.length > 0) settle(rest);
}

/** The classes changed: the live guess and the settled marks are read again with the new set. */
export function chooseMode(i: number): void {
  setMode(i);
  const old = marks().map((m: Mark): Stroke[] => m.strokes);
  setMarks([]);
  for (const g of old) settle(g);
  ask(grouper.open, nowMs);
}

export const NETS: string[] = ['new net', 'old net'];
export const [net, setNet] = createSignal(0);
/** Another net: the same marks are read again, so what changes on the rectangle is what the net changes. */
export function chooseNet(i: number): void {
  if (!(i === 0 ? netLoadBuiltin() : netLoadBase64(SYNTHETIC_NET))) return;
  setNet(i);
  chooseMode(mode());
}

/** The box of the mark being written (not settled yet), or null. */
export function openBox(): number[] | null { return grouper.open.length > 0 ? boxOf(grouper.open) : null; }

export function label(r: Recognition): string {
  if (r.candidates.length === 0) return '?';
  return (r.kind === 'unknown' ? '?' : r.candidates[0].label) + (r.circled ? ' (o)' : '');
}
