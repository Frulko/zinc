// Map and Set: insertion order, update, delete, clear, keys, values, size, `??` on Map.get, string, number and object keys.
const m: Map<i32, i32> = new Map<i32, i32>();
for (let i: i32 = 0; i < 20; i++) m.set(i % 7, (m.get(i % 7) ?? 0) + i);
console.log(m.size, m.get(0) ?? -1, m.get(3) ?? -1, m.get(6) ?? -1, m.get(100) ?? -1, m.has(4), m.has(7));
console.log(m.delete(3), m.delete(3), m.size, m.has(3), m.get(3) ?? 0);
m.set(3, 1);
let ks: string = '';
for (const k of m.keys()) ks += k + ' ';
let vs: string = '';
for (const v of m.values()) vs += v + ' ';
console.log(ks, '|', vs);
m.clear();
console.log(m.size, m.get(1) ?? 7);

const counts: Map<string, i32> = new Map<string, i32>();
const text: string[] = 'the cat and the hat and the bat'.split(' ');
for (const w of text) counts.set(w, (counts.get(w) ?? 0) + 1);
let line: string = '';
for (const k of counts.keys()) line += k + '=' + (counts.get(k) ?? 0) + ' ';
console.log(counts.size, line);

const seen: Set<string> = new Set<string>();
for (const w of text) seen.add(w);
console.log(seen.size, seen.has('cat'), seen.has('dog'), seen.delete('cat'), seen.has('cat'), seen.size);
let rest: string = '';
for (const w of seen.values()) rest += w + ',';
console.log(rest);

const floats: Map<f64, string> = new Map<f64, string>();
floats.set(NaN, 'nan');
floats.set(0, 'zero');
floats.set(-0, 'negzero');
floats.set(1.5, 'x');
console.log(floats.size, floats.get(NaN) ?? '?', floats.get(0) ?? '?', floats.get(1.5) ?? '?', floats.get(2) ?? '?');

class Box {
  constructor(public v: i32) {}
}
const boxes: Map<string, Box> = new Map<string, Box>();
boxes.set('a', new Box(1));
console.log(boxes.has('a'), boxes.has('b'), (boxes.get('a') ?? new Box(9)).v, (boxes.get('b') ?? new Box(9)).v);

const byObj: Set<Box> = new Set<Box>();
const b1: Box = new Box(1);
byObj.add(b1);
byObj.add(b1);
byObj.add(new Box(1));
console.log(byObj.size, byObj.has(b1), byObj.has(new Box(1)));

const lists: Map<string, string[]> = new Map<string, string[]>();
lists.set('x', []);
(lists.get('x') ?? []).push('never');
console.log(lists.size, lists.has('x'));

const ids: Set<i32> = new Set<i32>();
let state: u32 = 12345;
for (let i: i32 = 0; i < 5000; i++) {
  state = (state * 1664525 + 1013904223) >>> 0;
  ids.add((state >>> 16) % 1000);
}
let sum: i32 = 0;
for (const v of ids.values()) sum += v;
console.log(ids.size, sum);
