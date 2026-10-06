class Node { name: string | null = null; kids: string[] | null = null; m: Map<string, i32> | null = null; }
const n = new Node();
console.log(n.name, n.kids, n.m);
n.name = 'x';
n.kids = ['a', 'b'];
n.m = new Map<string, i32>();
const nm = n.name, ks = n.kids;
if (nm !== null) console.log(nm.length);
if (ks !== null) console.log(ks.length, ks);
const xs: (string | null)[] = ['a', null, 'c'];
console.log(xs, xs.length);
function show(s: string | null): string { return s === null ? 'none' : s.toUpperCase(); }
console.log(show(null), show('q'), n.name ?? 'dflt');
let t: string | null = null;
for (const s of xs) { if (s !== null) t = s; }
console.log(t);
// numbers and booleans that may be null
function half(x: number): number | null { return x > 1 ? x / 2 : null; }
const h1 = half(10);
const h2 = half(0);
console.log(h1, h2, h1 === null, h2 === null);
if (h1 !== null) console.log(h1 + 1);
console.log(h1 ?? -1, h2 ?? -1);
let flag: boolean | null = null;
console.log(flag);
flag = true;
if (flag !== null) console.log(!flag);
const bs: (boolean | null)[] = [true, null, false];
console.log(bs, bs.length);
const ns: (i32 | null)[] = [1, null, 3];
let sum = 0;
for (const v of ns) { if (v !== null) sum += v; }
console.log(sum, ns);
class P { w: number | null = null; }
const p = new P();
console.log(p.w);
p.w = 4.5;
const w = p.w;
if (w !== null) console.log(w * 2);
function g(x: number | null, y: number | null): string {
  if (x === 5) return 'five';
  if (x === y) return 'same';
  return x === null ? 'null' : 'other';
}
console.log(g(5, 1), g(null, null), g(2, null), g(2, 3));
const arr: (number | null)[] = [];
arr.push(1);
arr.push(null);
console.log(arr, arr[0] ?? 0, arr[1] ?? 7);
const m = new Map<string, number | null>();
m.set('a', null);
m.set('b', 2);
console.log(m);
