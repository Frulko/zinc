// zinc:ink's letter net (ZN-936). INK_GOLDEN is what tools/ink-train/inknet.py golden writes: 50 held-out marks with the rasters and int8 logits of
// the Python reference. The C kernels must give the same logits for the same raster (within 1 LSB; they are exact) and the C rasteriser the
// same raster. Then the held-out accuracy of the two stages, the time of one group, the worker thread and loadModel of a .znm.
// The output has no timing: tests/t0/ink_net.sh compares it between the interpreter, the AOT and QuickJS.
import { Candidate, Stroke, distances, netLabels, netLogits, netLogitsAsync, netLogitsOfRaster, netRaster, netProbs, recognise, loadModel } from 'zinc:ink';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';

interface Sample { w: string; c: string; s: number[][]; }
interface GSample { c: string; s: number[][]; r: string; l: number[]; }
interface Writer { id: string; split: string; }
interface DataSet { writers: Writer[]; samples: Sample[]; }
interface Golden { labels: string[]; samples: GSample[]; }

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function unb64(t: string): number[] {
  const out: number[] = [];
  let acc = 0, bits = 0;
  for (let i = 0; i < t.length; i++) {
    const v = B64.indexOf(t.charAt(i));
    if (v < 0) continue;
    acc = ((acc << 6) | v) & 0xffff; bits += 6;
    if (bits >= 8) { bits -= 8; const b = (acc >> bits) & 255; out.push(b > 127 ? b - 256 : b); }
  }
  return out;
}

function strokes(arrays: number[][]): Stroke[] {
  return arrays.map((a: number[]): Stroke => {
    const s = new Stroke(0, 3);
    for (let i = 0; i + 1 < a.length; i += 2) s.add(a[i], a[i + 1], 0.5);
    return s;
  });
}

const gold = JSON.parse(fs.readText(sys.env('INK_GOLDEN'))) as Golden;
const labels = netLabels();
console.log('labels ' + labels.join(',') + ' ' + (labels.join(',') === gold.labels.join(',')));

let maxLsb = 0, pixelsOff = 0, pixels = 0, rasterOk = 0;
for (const g of gold.samples) {
  const want = unb64(g.r);
  const got = netRaster(g.s);
  let off = 0;
  for (let i = 0; i < want.length; i++) if (want[i] !== got[i]) off++;
  pixelsOff += off; pixels += want.length;
  if (off === 0) rasterOk++;
  const lg = netLogitsOfRaster(want);   // the Python raster in: only the kernels are compared
  for (let i = 0; i < lg.length; i++) maxLsb = Math.max(maxLsb, Math.abs(lg[i] - g.l[i]));
}
console.log('logits ' + gold.samples.length + ' maxdiff ' + maxLsb + ' ' + (maxLsb <= 1 ? 'ok' : 'FAIL'));
console.log('raster ' + rasterOk + '/' + gold.samples.length + ' exact, ' + pixelsOff + ' of ' + pixels + ' values differ');

// Held-out accuracy, the protocol of tests/data/ink-recog: letters among A-E,V, shapes among circle, x, tick, line, top-1. Two sets: the held-out
// writers as they are (the matcher is at 99.7 % there, nothing to gain) and the same marks bent harder than the training augmentation (INK_STRESS,
// `inknet.py stress`: rotation 18 degrees, shear, stretch, warp, noise, dropped points), where a stage that only knows its train writers breaks first.
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'V'], SHAPES = ['circle', 'x', 'tick', 'line'];
function pct(a: number, n: number): string { return (Math.round(1000 * a / n) / 10).toFixed(1); }
function measure(name: string, file: string): Sample[] {
  const set = JSON.parse(fs.readText(file)) as DataSet;
  const test: string[] = set.writers.filter((w: Writer): boolean => w.split === 'test').map((w: Writer): string => w.id);
  const held = set.samples.filter((s: Sample): boolean => test.indexOf(s.w) >= 0 && s.c !== 'scribble');
  const acc: number[] = [0, 0, 0, 0, 0, 0, 0, 0];   // letters n, A, net, both; shapes n, A, net, both
  for (const s of held) {
    const isLetter = LETTERS.indexOf(s.c) >= 0;
    const set2 = isLetter ? LETTERS : SHAPES;
    const o = isLetter ? 0 : 4;
    acc[o]++;
    if (distances(s.s, set2.join(','))[0].label === s.c) acc[o + 1]++;
    const p = netProbs(netLogits(s.s), set2) as Map<string, number>;
    let best = set2[0];
    for (const l of set2) if ((p.get(l) as number) > (p.get(best) as number)) best = l;
    if (best === s.c) acc[o + 2]++;
    const rc = recognise(strokes(s.s), { classes: set2 });
    if (rc.candidates[0].label === s.c) acc[o + 3]++;
  }
  console.log(name + ' letters ' + acc[0] + ' stageA ' + acc[1] + ' ' + pct(acc[1], acc[0]) + ' net ' + acc[2] + ' ' + pct(acc[2], acc[0]) + ' both ' + acc[3] + ' ' + pct(acc[3], acc[0]));
  console.log(name + ' shapes ' + acc[4] + ' stageA ' + acc[5] + ' ' + pct(acc[5], acc[4]) + ' net ' + acc[6] + ' ' + pct(acc[6], acc[4]) + ' both ' + acc[7] + ' ' + pct(acc[7], acc[4]));
  return held;
}
const held = measure('plain', sys.env('INK_SET'));
measure('stress', sys.env('INK_STRESS'));

const t1 = performance.now();
for (const s of held) netLogits(s.s);
const ms = (performance.now() - t1) / held.length;
console.log('timing ' + (ms <= 5 ? 'ok' : 'SLOW') + ' ' + ms.toFixed(3));

async function main(): Promise<void> {
  const a = netLogits(held[3].s), b = await netLogitsAsync(held[3].s);
  console.log('async ' + (a.join(' ') === b.join(' ')));
  console.log('loadModel znm ' + loadModel(sys.env('INK_ZNM')) + ' ' + loadModel(sys.env('INK_TMP') + '/nope.znm'));
  fs.writeBytes(sys.env('INK_TMP') + '/bad.znm', [90, 78, 77, 49, 0, 0]);
  console.log('loadModel bad ' + loadModel(sys.env('INK_TMP') + '/bad.znm') + ' ' + (netLogits(held[3].s).join(' ') === a.join(' ')));
}
main();
