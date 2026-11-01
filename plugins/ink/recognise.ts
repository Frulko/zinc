// zinc:ink recognition (ZN-933, docs/plugins/ink.md): the strokes of one mark -> what it is. A mark is a letter, a shape (circle, x, tick,
// line) or unknown; a letter inside a circle is `circled`. The closest-template matcher (matcher.ts, native/ink.abi.cpp) does the naming; this
// file is what an app sees: scores, the restricted class set, priors, the rejection rule (never guess), the circle around a letter.
import * as fs from 'zinc:fs';
import { Stroke } from './index';
import { Distance, distances, distancesAsync, flat, parseExamples, setExamples } from './matcher';
import { netLoadFile, netLogits, netLogitsAsync, netProbs } from './net';

export interface Candidate { label: string; score: number }
export class Box { x: number = 0; y: number = 0; w: number = 0; h: number = 0; }
export class Recognition {
  /** 'letter' (a letter or digit), 'shape' (circle, x, tick, line) or 'unknown' (not sure enough: the app keeps the ink as it is). */
  kind: string = 'unknown';
  /** Every class asked for, best first; score 0..1, higher is better (priors applied). Filled even when the kind is 'unknown'. */
  candidates: Candidate[] = [];
  /** The bounding box of the strokes, circle included. */
  box: Box = new Box();
  /** A letter with a circle drawn around it (in either order): the circle is not part of the letter. */
  circled: boolean = false;
  /** Time spent matching, ms. */
  ms: number = 0;
}
export interface RecogniseOptions {
  /** The closed set to choose from (Murdoku: A-E, V, circle, x); default every class of the templates. */
  classes?: string[];
  /** Multiplies the score of a class (a letter already placed: 0.2). Missing labels count 1. */
  priors?: Map<string, number>;
  /** Run the TypeScript reference matcher instead of the native one (the same answer; for tests and engines without the native library). */
  reference?: boolean;
  /** false: the closest-template matcher alone (stage A), without the letter net (stage B). Default true; ignored when the net has no model or does not know a class. */
  net?: boolean;
}

/** A distance of 0.3 (unit box) scores 0.5. DISTANCE_SCALE, MIN_SCORE and MIN_MARGIN were fitted on the held-out synthetic writers of
 *  tools/ink-train: 95% of the marks accepted, none accepted wrongly, 2 of 56 scribbles accepted. Retune on real handwriting (docs/plugins/ink.md). */
export const DISTANCE_SCALE: number = 0.3;
/** The best score must reach this, or the answer is 'unknown'. */
export const MIN_SCORE: number = 0.4;
/** The best must beat the second by this much, or the answer is 'unknown' ("never guess"). */
export const MIN_MARGIN: number = 0.1;

/** With the net (stage B) the score of a class is NET_WEIGHT of the net's probability plus the rest of the template matcher's score (stage A). */
export const NET_WEIGHT: number = 0.9;

/** The labels of the shapes; any other label is a letter or digit. */
export const SHAPES: string[] = ['circle', 'x', 'tick', 'line', 'scribble'];

function boxOf(strokes: Stroke[]): Box {
  const b = new Box();
  let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
  for (const s of strokes) { x0 = Math.min(x0, s.x0); y0 = Math.min(y0, s.y0); x1 = Math.max(x1, s.x1); y1 = Math.max(y1, s.y1); }
  if (x0 > x1) return b;
  b.x = x0; b.y = y0; b.w = x1 - x0; b.h = y1 - y0;
  return b;
}

function pathLength(s: Stroke): number {
  let len = 0;
  for (let i = 3; i < s.pts.length; i += 3) len += Math.hypot(s.pts[i] - s.pts[i - 3], s.pts[i + 1] - s.pts[i - 2]);
  return len;
}

/** The stroke that is a circle drawn around the others: closed (its end within a quarter of its length of its start), roundish (aspect 0.6 to 1.6),
 *  and its box holds the boxes of all the other strokes. -1 when there is none (needs two strokes at least). */
function circleAround(strokes: Stroke[]): i32 {
  if (strokes.length < 2) return -1;
  for (let i = 0; i < strokes.length; i++) {
    const c = strokes[i], n = c.pts.length;
    if (c.count() < 8) continue;
    const w = c.x1 - c.x0, h = c.y1 - c.y0;
    if (w <= 0 || h <= 0 || w / h < 0.6 || w / h > 1.6) continue;
    if (Math.hypot(c.pts[n - 3] - c.pts[0], c.pts[n - 2] - c.pts[1]) > 0.25 * pathLength(c)) continue;
    const mx = 0.1 * w, my = 0.1 * h;
    let holds = true;
    let ix0 = 1e18, iy0 = 1e18, ix1 = -1e18, iy1 = -1e18;
    for (let j = 0; j < strokes.length && holds; j++) {
      if (j === i) continue;
      const o = strokes[j];
      holds = o.x0 >= c.x0 - mx && o.x1 <= c.x1 + mx && o.y0 >= c.y0 - my && o.y1 <= c.y1 + my;
      ix0 = Math.min(ix0, o.x0); iy0 = Math.min(iy0, o.y0); ix1 = Math.max(ix1, o.x1); iy1 = Math.max(iy1, o.y1);
    }
    // a circle leaves room around what it holds: the loop of a B drawn in two strokes does not "circle" the B's stem, which spans its whole height
    if (holds && (ix1 - ix0 > 0.85 * w || iy1 - iy0 > 0.85 * h)) holds = false;
    if (holds) return i;
  }
  return -1;
}

function classesOf(opts: RecogniseOptions | undefined): string {
  return opts !== undefined && opts.classes !== undefined ? opts.classes.join(',') : '';
}

function useNet(opts: RecogniseOptions | undefined): boolean {
  return opts === undefined || (opts.net !== false && opts.reference !== true);
}

function finish(r: Recognition, d: Distance[], circled: boolean, opts: RecogniseOptions | undefined, logits: number[]): Recognition {
  const out: Candidate[] = [];
  const want: string[] = [];
  for (const x of d) if (!(circled && SHAPES.indexOf(x.label) >= 0)) want.push(x.label);
  const p = logits.length > 0 ? netProbs(logits, want) : null;
  for (const x of d) {
    if (circled && SHAPES.indexOf(x.label) >= 0) continue;   // inside a circle a letter is asked for, not a shape
    let prior = 1;
    if (opts !== undefined && opts.priors !== undefined) { if (opts.priors.has(x.label)) prior = opts.priors.get(x.label) as number; }
    const q = x.d / DISTANCE_SCALE;
    const sa = 1 / (1 + q * q);
    out.push({ label: x.label, score: prior * (p === null ? sa : NET_WEIGHT * (p.get(x.label) as number) + (1 - NET_WEIGHT) * sa) });
  }
  out.sort((a: Candidate, b: Candidate): i32 => b.score > a.score ? 1 : b.score < a.score ? -1 : 0);
  r.candidates = out;
  r.circled = circled;
  if (out.length > 0 && out[0].score >= MIN_SCORE && (out.length === 1 || out[0].score - out[1].score >= MIN_MARGIN)) r.kind = SHAPES.indexOf(out[0].label) >= 0 ? 'shape' : 'letter';
  return r;
}

/** What the strokes of one mark are. Synchronous: a few milliseconds on a computer; use recogniseAsync on a tablet. */
export function recognise(strokes: Stroke[], opts?: RecogniseOptions): Recognition {
  const t0 = performance.now();
  const r = new Recognition();
  r.box = boxOf(strokes);
  const c = circleAround(strokes);
  const inner = c < 0 ? strokes : strokes.filter((_s: Stroke, i: i32): boolean => i !== c);
  if (inner.length > 0) {
    const f = flat(inner);
    finish(r, distances(f, classesOf(opts), opts !== undefined && opts.reference === true), c >= 0, opts, useNet(opts) ? netLogits(f) : []);
  }
  r.ms = performance.now() - t0;
  return r;
}

/** recognise() on a worker thread: the answer arrives on the UI thread. */
export async function recogniseAsync(strokes: Stroke[], opts?: RecogniseOptions): Promise<Recognition> {
  const t0 = performance.now();
  const r = new Recognition();
  r.box = boxOf(strokes);
  const c = circleAround(strokes);
  const inner = c < 0 ? strokes : strokes.filter((_s: Stroke, i: i32): boolean => i !== c);
  if (inner.length > 0) {
    const f = flat(inner);
    finish(r, await distancesAsync(f, classesOf(opts)), c >= 0, opts, useNet(opts) ? await netLogitsAsync(f) : []);
  }
  r.ms = performance.now() - t0;
  return r;
}

/** Replaces the built-in model by the one in a file. A `.znm` file is a letter net (stage B, tools/ink-train/train writes one); any other file is a
 *  template list (stage A):
 *
 *  Replaces the built-in templates by those of a file ([[label, [[x, y, x, y...], ...]], ...]: tools/ink-train/make-templates writes the format).
 *  false when the file cannot be read or is not that format; the built-in templates stay then. */
export function loadModel(path: string): boolean {
  if (path.endsWith('.znm')) return netLoadFile(path);
  try {
    const list = parseExamples(fs.readText(path));
    if (list.length === 0) return false;
    setExamples(list);
    return true;
  } catch (e) {
    return false;
  }
}
