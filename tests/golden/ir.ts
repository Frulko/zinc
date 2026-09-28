// Golden program for --emit=hir and --emit=mir (TST-03): `zinc test --update-golden` rewrites ir.hir / ir.mir.
class Vec {
  constructor(public x: number, public y: number) {}
  len(): number { return Math.sqrt(this.x * this.x + this.y * this.y); }
}
class Vec3 extends Vec {
  constructor(x: number, y: number, public z: number) { super(x, y); }
  len(): number { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
}
interface Pt { x: number; y: number }

function sum(xs: i32[]): i32 {
  let s: i32 = 0;
  for (const x of xs) s += x;
  return s;
}
function pick(n: number): string {
  const k = 2 * 3 + 1;
  if (k > 5) return n > 0 ? 'pos' : 'neg';
  return 'never';
}
function grade(score: i32): string {
  switch (score) {
    case 1: return 'low';
    case 2: return 'mid';
    default: return 'high';
  }
}
function safeDiv(a: i32, b: i32): i32 {
  if (b === 0) throw new RangeError('div by zero');
  return a / b;
}
async function later(v: number): Promise<number> {
  const w = await Promise.resolve(v);
  return w * 2;
}

let count = 0;
const bump = (by: number) => { count += by; };
const shapes: Vec[] = [new Vec(3, 4), new Vec3(1, 2, 2)];
const { x, y }: Pt = { x: 1, y: 2 };
const d: any = JSON.parse('{"a":1}');
const u: unknown = d.a;
if (typeof u === 'number') console.log(u + 1);
try {
  console.log(safeDiv(7, 2), safeDiv(1, 0));
} catch (e) {
  console.log(e.message);
}
console.log(sum([1, 2, 3]), pick(-1), grade(2), shapes[1].len(), d.a + 1, shapes[0]?.x ?? 0, `${x},${y}`);
bump(2);
later(4).then(v => console.log(v, count));
