// Stage B of zinc:ink's recogniser (ZN-936): the tiny int8 letter net. The kernels are in native/ink.abi.cpp, the model (a .znm, written by
// tools/ink-train/train) is built in as base64 (model.ts) or loaded from a file with loadModel(). The answer is a probability per class.
import * as fs from 'zinc:fs';
import N from './native/ink.spec';
import { MODEL } from './model';

let state: i32 = 0;   // 0: the built-in model not loaded yet, 1: a model is loaded, 2: none (a build without model.ts, or a bad file)
let labels: string[] = [];

function ensure(): boolean {
  if (state === 0) {
    state = N.netLoadB64(MODEL) > 0 ? 1 : 2;
    if (state === 1) labels = N.netLabels().split(',');
  }
  return state === 1;
}

/** Loads a .znm model file in place of the built-in one; false when it cannot be read or is not a model (the loaded one stays). */
export function netLoadFile(path: string): boolean {
  try {
    const n = N.netLoad(fs.readBytes(path));
    if (n <= 0) return false;
    labels = N.netLabels().split(',');
    state = 1;
    return true;
  } catch (e) {
    return false;
  }
}

/** Loads a model given as base64 (what model.ts holds) in place of the current one; false when it is not a model (the loaded one stays). */
export function netLoadBase64(b64: string): boolean {
  if (N.netLoadB64(b64) <= 0) return false;
  labels = N.netLabels().split(',');
  state = 1;
  return true;
}

/** Back to the net that ships with the plugin. */
export function netLoadBuiltin(): boolean { return netLoadBase64(MODEL); }

/** The labels the net knows (empty when there is no model). */
export function netLabels(): string[] { return ensure() ? labels : []; }

function parseLogits(text: string): number[] {
  const out: number[] = [];
  for (const part of text.split(' ')) if (part !== '') out.push(parseInt(part));
  return out;
}

function lensOf(strokes: number[][]): i32[] { return strokes.map((s: number[]): i32 => s.length / 2); }
function ptsOf(strokes: number[][]): number[] { const a: number[] = []; for (const s of strokes) for (const v of s) a.push(v); return a; }

/** The probability of each of `want` (and 'scribble', the net's reject class, which takes its share), or null when the net cannot answer:
 *  no model, or a wanted label the model does not know. `logits` come from netLogits / netLogitsAsync. */
export function netProbs(logits: number[], want: string[]): Map<string, number> | null {
  if (!ensure() || logits.length !== labels.length) return null;
  const use: string[] = want.slice();
  if (use.indexOf('scribble') < 0 && labels.indexOf('scribble') >= 0) use.push('scribble');
  const scale = N.netScale();
  let top = -1e30;
  for (const l of use) { const i = labels.indexOf(l); if (i < 0) return null; top = Math.max(top, logits[i] * scale); }
  let sum = 0;
  const e = new Map<string, number>();
  for (const l of use) { const v = Math.exp(logits[labels.indexOf(l)] * scale - top); e.set(l, v); sum += v; }
  const out = new Map<string, number>();
  for (const l of use) out.set(l, (e.get(l) as number) / sum);
  return out;
}

/** The int8 logits of a mark (one entry per label of netLabels()), [] without a model. */
export function netLogits(strokes: number[][]): number[] {
  return ensure() ? parseLogits(N.netRun(ptsOf(strokes), lensOf(strokes))) : [];
}

/** netLogits on a worker thread. */
export async function netLogitsAsync(strokes: number[][]): Promise<number[]> {
  if (!ensure()) return [];
  const text = await N.netRunAsync(ptsOf(strokes), lensOf(strokes));
  return parseLogits(text);
}

/** The 3 x 24 x 24 raster the net sees (int8 as numbers): for tests and for looking at what the net looks at. */
export function netRaster(strokes: number[][]): number[] {
  const r = N.netRaster(ptsOf(strokes), lensOf(strokes));
  const out: number[] = [];
  for (const v of r) out.push(v);
  return out;
}

/** The logits of a raster (tests: the same input as the Python reference). */
export function netLogitsOfRaster(raster: number[]): number[] {
  ensure();
  return parseLogits(N.netLogits(raster.map((v: number): i32 => v)));
}
