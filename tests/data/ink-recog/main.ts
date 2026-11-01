// zinc:ink's matcher on the committed held-out writers (ZN-932): top-1 accuracy of the letters (A-E, V) and the shapes (circle, x, tick, line),
// native against the TypeScript reference on a slice, time per group. tests/t0/ink_recog.sh runs it on every engine and checks the lines.
import { Stroke, StrokeGrouper, distances, flat, templateCount } from 'zinc:ink';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';

interface Sample { w: string; c: string; s: number[][]; }
interface Writer { id: string; split: string; }
interface DataSet { writers: Writer[]; samples: Sample[]; }

const LETTERS = 'A,B,C,D,E,V', SHAPES = 'circle,x,tick,line';
const set = JSON.parse(fs.readText(sys.env('INK_SET'))) as DataSet;   // tests/t0/ink_recog.sh passes the path: a run moves into its project
const test: string[] = set.writers.filter((w: Writer): boolean => w.split === 'test').map((w: Writer): string => w.id);
const held = set.samples.filter((s: Sample): boolean => test.indexOf(s.w) >= 0 && s.c !== 'scribble');

let letters = 0, lettersOk = 0, shapes = 0, shapesOk = 0, agree = 0, compared = 0, worst = 0;
const t0 = performance.now();
let groups = 0;
for (let i = 0; i < held.length; i++) {
  const s = held[i];
  const isLetter = LETTERS.split(',').indexOf(s.c) >= 0;
  const top = distances(s.s, isLetter ? LETTERS : SHAPES)[0].label;
  groups++;
  if (isLetter) { letters++; if (top === s.c) lettersOk++; } else { shapes++; if (top === s.c) shapesOk++; }
}
const ms = (performance.now() - t0) / groups;
for (let i = 0; i < held.length && compared < 24; i += 5) {   // the TypeScript reference on a slice: same order of classes, same distances
  const a = distances(held[i].s, '', false), b = distances(held[i].s, '', true);
  let same = a.length === b.length;
  for (let k = 0; same && k < a.length; k++) {
    same = a[k].label === b[k].label && Math.abs(a[k].d - b[k].d) < 1e-9;
    worst = Math.max(worst, Math.abs(a[k].d - b[k].d));
  }
  compared++;
  if (same) agree++;
}
function box(x0: number, y0: number, x1: number, y1: number): Stroke {
  const s = new Stroke(0, 3);
  s.add(x0, y0, 0.5); s.add(x1, y1, 0.5);
  return s;
}
const g = new StrokeGrouper({ debounceMs: 450, gapPx: 40 });
g.add(box(100, 100, 160, 160), 0);
g.add(box(180, 100, 200, 160), 100);   // 20 px away: the same mark
const early = g.poll(300);             // 200 ms of pen-up: not finished
g.add(box(600, 600, 660, 660), 350);   // elsewhere: closes the first group at once
const closed = g.poll(360);
const late = g.poll(800);              // 450 ms after the last stroke
console.log('grouper ' + (early === null) + ' ' + (closed !== null && closed.length === 1 && closed[0].length === 2) + ' ' +
  (late !== null && late.length === 1 && late[0].length === 1) + ' ' + (g.poll(900) === null));
console.log('templates ' + templateCount());
console.log('letters ' + lettersOk + '/' + letters + ' ' + Math.round(1000 * lettersOk / letters) / 10);
console.log('shapes ' + shapesOk + '/' + shapes + ' ' + Math.round(1000 * shapesOk / shapes) / 10);
console.log('agree ' + agree + '/' + compared);
console.log('timing ' + (ms < 5 ? 'ok' : 'SLOW') + ' ' + Math.round(ms * 100) / 100);
