// zinc:ink's recognise / recogniseAsync / loadModel (ZN-933) on the held-out writers: one mark of each class, a circled letter, classes,
// priors, a scribble, the reference matcher, the worker thread, a model file. The output has no timing: tests/t0/ink_recognise.sh compares it
// between the interpreter, the AOT and QuickJS (and with the expected lines).
import { Stroke, Candidate, Recognition, recognise, recogniseAsync, loadModel } from 'zinc:ink';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';

interface Sample { w: string; c: string; s: number[][]; }
interface Writer { id: string; split: string; }
interface DataSet { writers: Writer[]; samples: Sample[]; }

const set = JSON.parse(fs.readText(sys.env('INK_SET'))) as DataSet;
const writer: string = set.writers.filter((w: Writer): boolean => w.split === 'test')[0].id;
const mine = set.samples.filter((s: Sample): boolean => s.w === writer);

function strokes(arrays: number[][]): Stroke[] {
  return arrays.map((a: number[]): Stroke => {
    const s = new Stroke(0, 3);
    for (let i = 0; i + 1 < a.length; i += 2) s.add(a[i], a[i + 1], 0.5);
    return s;
  });
}
function first(c: string): Stroke[] { return strokes(mine.filter((s: Sample): boolean => s.c === c)[0].s); }
function circleAround(list: Stroke[]): Stroke {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const s of list) { x0 = Math.min(x0, s.x0); y0 = Math.min(y0, s.y0); x1 = Math.max(x1, s.x1); y1 = Math.max(y1, s.y1); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.max(x1 - x0, y1 - y0) * 0.75;
  const c = new Stroke(0, 3);
  for (let i = 0; i <= 28; i++) { const a = -1.5 + i / 30 * 6.28; c.add(cx + r * Math.cos(a), cy + r * Math.sin(a), 0.5); }
  return c;
}
function show(name: string, r: Recognition): string {
  return name + ' ' + r.kind + ' ' + r.candidates[0].label + ' ' + r.candidates[0].score.toFixed(6) + ' circled=' + r.circled + ' box=' + Math.round(r.box.w) + 'x' + Math.round(r.box.h);
}

async function main(): Promise<void> {
  for (const c of ['A', 'C', 'E', 'V', 'circle', 'x', 'tick']) console.log(show(c, recognise(first(c))));
  const letter = first('B');
  console.log(show('B circled after', recognise(letter.concat([circleAround(letter)]))));
  console.log(show('B circled before', recognise([circleAround(letter)].concat(letter))));
  const restricted = recognise(first('E'), { classes: ['A', 'B', 'C', 'D', 'V'] });
  console.log('E among A-D,V ' + restricted.candidates.map((c: Candidate): string => c.label).join(','));
  const penalty = new Map<string, number>();
  penalty.set('V', 0.01);
  const plain = recognise(first('V'));
  const penalised = recognise(first('V'), { priors: penalty });
  console.log('priors V ' + plain.candidates[0].label + ' -> ' + penalised.candidates[0].label + ' ' + penalised.kind);
  const scribble = recognise(strokes(mine.filter((s: Sample): boolean => s.c === 'scribble')[0].s));
  console.log('scribble ' + scribble.kind);
  const ref = recognise(first('D'), { reference: true }), nat = recognise(first('D'));
  console.log('reference ' + (ref.candidates[0].label === nat.candidates[0].label && Math.abs(ref.candidates[0].score - nat.candidates[0].score) < 1e-9));
  const later = await recogniseAsync(first('A'));
  const now = recognise(first('A'));
  console.log('async ' + (later.kind === now.kind && later.candidates[0].label === now.candidates[0].label && later.candidates[0].score === now.candidates[0].score));
  console.log('empty ' + recognise([]).kind);
  console.log('loadModel missing ' + loadModel(sys.env('INK_TMP') + '/nope.json'));
  const model = sys.env('INK_TMP') + '/model.json';
  fs.writeText(model, '[["Z",[[0,0,100,0,100,100,0,100]]],["L",[[0,0,0,100,100,100]]]]');
  console.log('loadModel ' + loadModel(model));
  const z = recognise(strokes([[10, 10, 110, 12, 12, 108, 112, 110]]), { classes: ['Z', 'L'] });
  console.log('model ' + z.candidates.map((c: Candidate): string => c.label).join(','));
}
main();
