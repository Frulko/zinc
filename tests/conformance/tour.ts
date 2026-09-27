import { Shape, Base, Circle, Rect } from './shapes';

// --- classes, interfaces, virtual dispatch, instanceof narrowing ---
const shapes: Shape[] = [new Circle(1), new Rect(2, 3), new Rect(4, 4)];
for (const s of shapes) console.log(s.name());
console.log('created', Base.created);
const sorted = shapes.slice().sort((a, b) => a.area() - b.area());
console.log(sorted.map(s => s.name()).join(' < '));
const r = shapes[2];
if (r instanceof Rect) console.log('square?', r.isSquare, r.w);

// --- generics (monomorphized as C++ templates) ---
class Stack<T> {
  items: T[] = [];
  push(v: T): void { this.items.push(v); }
  pop(): T { return this.items.pop(); }
  get size(): i32 { return this.items.length; }
}
function first<T>(xs: T[]): T { return xs[0]; }
const st = new Stack<string>();
st.push('a'); st.push('b');
console.log(st.pop(), st.size, first([10, 20]));

// --- closures: captured mutable variable lives in a cell ---
function counter(): () => i32 {
  let n: i32 = 0;
  return () => { n++; return n; };
}
const c = counter();
c(); c();
console.log('counter', c());
const adders = [1, 2, 3].map(k => (x: number) => x + k);
console.log(adders.map(f => f(10)));

// --- machine integers (LNG-05) ---
let big: i32 = 2147483647;
big = big + 1;
console.log('i32 wrap', big);
const bytes: u8[] = [250, 3];
const b0: u8 = bytes[0] + 10;
console.log('u8 wrap', b0, 7 / 2, 7 % 3, -7 % 3, 1 << 31, -1 >>> 28);
let h: u32 = 2166136261;
for (const ch of 'zinc') h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
console.log('fnv', h);

// --- enums and switch ---
enum Dir { Up, Down, Left = 10, Right }
function label(d: Dir): string {
  switch (d) {
    case Dir.Up: return 'up';
    case Dir.Left:
    case Dir.Right: return 'side';
    default: return 'down';
  }
}
console.log([Dir.Up, Dir.Down, Dir.Left, Dir.Right].map(label).join(','), Dir.Right);

// --- strings ---
const s = '  Hello, Zinc world  ';
const t = s.trim();
console.log(t.length, t.toUpperCase(), t.slice(-5), t.indexOf('Zinc'), t.split(' ').length);
console.log('ab'.repeat(3), '7'.padStart(3, '0'), t.replaceAll('l', 'L'), 'é€'.length, 'naïve'.slice(2, 4));
console.log(parseInt('42px'), parseFloat('3.5e2'), (1234.5678).toFixed(2), String.fromCharCode(90));

// --- Map / Set, object literals with interfaces ---
interface Point { x: number; y: number }
const pts = new Map<string, Point>();
pts.set('a', { x: 1, y: 2 });
pts.set('b', { x: 3, y: 4 });
pts.delete('a');
pts.set('c', { x: 5, y: 6 });
for (const [k, p] of pts) console.log(k, p);
const seen = new Set<i32>();
for (const v of [3, 1, 3, 2, 1]) seen.add(v);
console.log('set', seen.size, seen.has(2), seen.values());
const counts = new Map<string, i32>();
for (const w of 'the cat the hat the end'.split(' ')) counts.set(w, (counts.get(w) ?? 0) + 1);
console.log(counts.keys(), counts.values());

// --- control flow, logical operators ---
let i = 0, acc = 0;
while (true) { i++; if (i % 2 === 0) continue; if (i > 9) break; acc += i; }
do { acc -= 1; } while (acc > 20);
const empty: string = t.slice(0, 0);
const name = empty || 'anon';
console.log(acc, name, acc > 10 ? 'big' : 'small', [1, 2, 3].some(x => x > 2), [1, 2, 3].every(x => x > 2));
console.log([5, 1, 4].reduce((a, b) => a + b, 0), [1, 2, 3, 4].filter(x => x % 2 === 0), [3, 1, 2].indexOf(2), [1, 2].concat([3]));
console.log({ x: 1.5, y: -2 } as Point, [[1, 2], [3]], 1 / 3 * 3, 100 / 3, 1e-7, 123e20, 2 ** 10, Math.max(3, 7), Math.round(2.5), Math.round(-2.5));
