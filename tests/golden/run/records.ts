// Interfaces of data properties and object literals: typed by the interface, anonymous, nested, in arrays, Maps and returns.
interface Point {
  x: number;
  y: number;
}
interface Named {
  readonly name: string;
  tags: string[];
}
interface Line {
  from: Point;
  to: Point;
}

function dist2(p: Point, q: Point): number {
  const dx = p.x - q.x, dy = p.y - q.y;
  return dx * dx + dy * dy;
}
function zero(): Point { return { x: 0, y: 0 }; }
function withX(p: Point, x: number): Point { return { x, y: p.y }; }

const a: Point = { x: 3, y: 4 };
const b: Point = { y: 1, x: 2 };
console.log(dist2(a, zero()), dist2(a, b), withX(a, 9).x, withX(a, 9).y);

const n: Named = { name: 'zed', tags: ['a', 'b'] };
n.tags.push('c');
console.log(n.name, n.tags.join('+'), n.tags.length);

const line: Line = { from: { x: 1, y: 2 }, to: a };
line.to.x = 10;
console.log(line.from.y, line.to.x, a.x);

const pts: Point[] = [{ x: 1, y: 1 }, { x: 2, y: 4 }, a];
let sum = 0;
for (const p of pts) sum += p.x * p.y;
console.log(sum, pts.length);

const m = new Map<string, Point>();
m.set('k', { x: 5, y: 6 });
const got: Point = m.get('k') ?? zero();
console.log(got.x + got.y, m.has('z'));

// anonymous literals take their own shape; equal shapes are the same type
const anon = { id: 7, label: 'seven', ok: true };
const anon2 = { id: 8, label: 'eight', ok: false };
const both = [anon, anon2];
console.log(anon.id + anon2.id, both[1].label, both.length, anon.ok);
let cur = anon;
cur = anon2;
console.log(cur.label);
const nested = { inner: { v: 1.5 }, list: [1, 2, 3] };
console.log(nested.inner.v * 2, nested.list.length);
const key = 'q';
const sh = { key, n: 2 };
console.log(sh.key, sh.n);
