// The matcher behind zinc:ink's recognition (ZN-932): the built-in templates, and the closest-template distance per class computed by the
// native C++ matcher (native/ink.abi.cpp) or by its TypeScript reference (recog.ts), which give the same numbers.
import N from './native/ink.spec';
import { Stroke } from './index';
import { Template, match as refMatch } from './recog';
import { TEMPLATES } from './templates';

/** One example of a class: its label and its strokes (flat x, y arrays). */
export class Example {
  label: string = '';
  strokes: number[][] = [];
}

/** The distance of a mark to a class: 0 is a perfect match, a unit-box letter is about 0.1 to 0.5 from a wrong one. */
export class Distance {
  label: string = '';
  d: number = 0;
}

let examples: Example[] = [];
let refTemplates: Template[] | null = null;
let loaded = false;

/** The strokes as the matcher takes them: one flat x, y array each. */
export function flat(strokes: Stroke[]): number[][] {
  const out: number[][] = [];
  for (const s of strokes) {
    const a: number[] = [];
    for (let i = 0; i < s.pts.length; i += 3) { a.push(s.pts[i]); a.push(s.pts[i + 1]); }
    out.push(a);
  }
  return out;
}

/** The pairs of a template file: [[label, [[x, y, x, y...], ...]], ...] (the format of templates.ts and tools/ink-train/make-templates). */
export function parseExamples(json: string): Example[] {
  const raw = JSON.parse(json) as [string, number[][]][];
  const out: Example[] = [];
  for (const r of raw) { const e = new Example(); e.label = r[0]; e.strokes = r[1]; out.push(e); }
  return out;
}

/** Replaces the templates (the built-in ones until this is called). */
export function setExamples(list: Example[]): void {
  examples = list;
  refTemplates = null;
  loaded = false;
}

function ensure(): void {
  if (loaded) return;
  if (examples.length === 0) examples = parseExamples(TEMPLATES);
  N.reset();
  for (const e of examples) {
    const pts: number[] = [], lens: i32[] = [];
    for (const s of e.strokes) { for (const v of s) pts.push(v); lens.push(s.length / 2); }
    N.add(e.label, pts, lens);
  }
  loaded = true;
}

export function templateCount(): i32 { ensure(); return N.count(); }

function lens(strokes: number[][]): i32[] { return strokes.map((s: number[]): i32 => s.length / 2); }
function pts(strokes: number[][]): number[] { const a: number[] = []; for (const s of strokes) for (const v of s) a.push(v); return a; }

/** Parses native match()'s "label distance;..." answer. */
export function parseDistances(text: string): Distance[] {
  const out: Distance[] = [];
  for (const part of text.split(';')) {
    if (part === '') continue;
    const at = part.lastIndexOf(' ');
    const d = new Distance();
    d.label = part.substring(0, at); d.d = parseFloat(part.substring(at + 1));
    out.push(d);
  }
  return out;
}

/** The distance of the strokes to each class of `classes` ('' for all), closest first. `reference` runs the TypeScript matcher instead of the native one. */
export function distances(strokes: number[][], classes: string, reference: boolean = false): Distance[] {
  ensure();
  if (reference) {
    if (refTemplates === null) refTemplates = examples.map((e: Example): Template => new Template(e.label, e.strokes));
    return parseDistances(refMatch(refTemplates, strokes, classes));
  }
  return parseDistances(N.match(pts(strokes), lens(strokes), classes));
}

/** distances() on a worker thread. */
export async function distancesAsync(strokes: number[][], classes: string): Promise<Distance[]> {
  ensure();
  return parseDistances(await N.matchAsync(pts(strokes), lens(strokes), classes));
}
