// Record mode (ZN-931): the notes page becomes a handwriting-sample collector for zinc:ink's recogniser. The bar names the
// class to write ("Write: A  3/10"), Keep stores the strokes as one sample and clears the page, Redo clears it. One file per
// writer, ink-<writer>.json in the notes directory, the format tools/ink-train/make-dataset reads with --real:
//   { "writer": "me", "samples": [ { "c": "A", "s": [[x, y, x, y, ...], ...] } ] }   (integer pixels, one array per stroke)
// NOTES_RECORD=<writer> starts in record mode; NOTES_RECORD_DEMO=1 writes a few scripted samples through the live pen path and quits.
import { createSignal } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { ink, setStatus, DIR } from './notebook';

/** The classes, as tools/ink-train/make-dataset names them. */
export const CLASSES: string[] = ['A', 'B', 'C', 'D', 'E', 'V', 'circle', 'x', 'tick', 'line', 'scribble'];
const REPS: i32 = 10;

const writerEnv = sys.env('NOTES_RECORD');
export const [recording, setRecording] = createSignal<boolean>(writerEnv !== '');
export const [prompt, setPrompt] = createSignal<string>('');
let writer: string = writerEnv !== '' && writerEnv !== '1' ? writerEnv : 'writer';
let samples: string[] = [];   // one JSON object per kept sample
let count: i32 = 0;

function label(): string { return CLASSES[count % CLASSES.length]; }
function show(): void {
  setPrompt(count >= CLASSES.length * REPS ? 'Done: ' + count + ' samples' : 'Write: ' + label() + '   ' + (count + 1) + '/' + CLASSES.length * REPS);
}

export function startRecording(): void {
  samples = []; count = 0;
  ink.clear();
  setRecording(true);
  show();
}

export function stopRecording(): void { setRecording(false); ink.clear(); }

/** Stores the strokes on the page as the sample of the current class and moves to the next. false when the page is empty. */
export function keep(): boolean {
  if (ink.strokes.length === 0 || count >= CLASSES.length * REPS) return false;
  const strokes: string[] = [];
  for (const s of ink.strokes) {
    const p: i32[] = [];
    for (let i = 0; i < s.pts.length; i += 3) { p.push(Math.round(s.pts[i])); p.push(Math.round(s.pts[i + 1])); }
    strokes.push('[' + p.join(',') + ']');
  }
  samples.push('{"c":"' + label() + '","s":[' + strokes.join(',') + ']}');
  count++;
  ink.clear();
  try {
    fs.mkdir(DIR);
    fs.writeText(DIR + '/ink-' + writer + '.json', '{"writer":"' + writer + '","samples":[\n' + samples.join(',\n') + '\n]}\n');
    setStatus('kept ' + count + ' samples');
  } catch (e) {
    setStatus('save failed: ' + e.message);
  }
  show();
  return true;
}

export function redo(): void { ink.clear(); }

// ---- the scripted session ----
const DEMO: string[] = ['A', 'circle', 'x', 'V'];
let demoStep: i32 = sys.env('NOTES_RECORD_DEMO') === '1' ? 0 : -1;

/** One demo sample = a few pen samples per frame; the stroke shapes are the simplest of each class. */
function demoPoint(c: string, i: i32, n: i32): number[] {   // i of n, in 0..1 -> x, y, lift
  const t = i / (n - 1);
  if (c === 'circle') return [800 + 200 * Math.cos(t * 6.2), 900 + 200 * Math.sin(t * 6.2)];
  if (c === 'x') return t < 0.5 ? [700 + 400 * t * 2, 700 + 400 * t * 2] : [1100 - 400 * (t - 0.5) * 2, 700 + 400 * (t - 0.5) * 2];
  if (c === 'V') return t < 0.5 ? [700 + 200 * t * 2, 700 + 400 * t * 2] : [900 + 200 * (t - 0.5) * 2, 1100 - 400 * (t - 0.5) * 2];
  return t < 0.5 ? [700 + 200 * t * 2, 1100 - 400 * t * 2] : [900 + 200 * (t - 0.5) * 2, 700 + 400 * (t - 0.5) * 2];   // A (apex-less is enough here)
}

/** Called every frame by the app's step; does nothing unless NOTES_RECORD_DEMO=1. */
export function stepRecorder(): void {
  if (demoStep < 0) return;
  if (!recording()) startRecording();
  const N = 24;
  const k = demoStep % (N + 2), sample = Math.floor(demoStep / (N + 2));
  if (sample >= DEMO.length) { quit(); demoStep = -1; return; }
  // the prompt cycles through CLASSES; the scripted strokes must be the prompted class, so skip ahead to it
  const want = DEMO[sample];
  if (k === 0 && label() !== want) { count = CLASSES.indexOf(want); show(); }
  if (k < N) {
    const p = demoPoint(want, k, N);
    ink.feed(p[0], p[1], 0.6, 1);
  } else if (k === N) {
    ink.feed(0, 0, 0, 0);   // pen up
  } else {
    keep();
  }
  demoStep++;
}
