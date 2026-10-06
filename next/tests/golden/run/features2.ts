// optional chaining, interface properties, discriminated unions, object spread, ??=, per-iteration bindings, generic statics
interface User { name: string; friend: User | null; greet(): string }
class U implements User {
  name: string; friend: User | null = null;
  constructor(n: string) { this.name = n; }
  greet(): string { return 'hi ' + this.name; }
}
const u = new U('a');
u.friend = new U('b');
console.log(u.friend?.greet(), u.friend?.friend?.greet() ?? 'none', u.friend?.friend?.name ?? 'nobody', u.friend?.name);
type Shape = { kind: 'circle'; r: number } | { kind: 'rect'; w: number; h: number } | { kind: 'dot' };
function area(s: Shape): number {
  switch (s.kind) {
    case 'circle': return Math.round(Math.PI * s.r * s.r);
    case 'rect': return s.w * s.h;
    case 'dot': return 0;
  }
}
function label(s: Shape): string {
  if (s.kind === 'circle') return 'circle ' + s.r;
  if (s.kind !== 'rect') return 'dot';
  return 'rect ' + s.w + 'x' + s.h;
}
const shapes: Shape[] = [{ kind: 'circle', r: 2 }, { kind: 'rect', w: 3, h: 4 }, { kind: 'dot' }];
console.log(shapes.map(area), shapes.map(label), shapes);
interface Point { x: number; y: number }
const p: Point = { x: 1, y: 2 };
const q: Point = { ...p, y: 9 };
console.log(q, { ...q, x: 0 });
let cache: Map<string, i32> | null = null;
cache ??= new Map<string, i32>();
cache.set('k', 1);
let label2: string | null = null;
label2 ??= 'dflt';
console.log(cache.size, label2);
const fns: (() => number)[] = [];
for (let i = 0; i < 3; i++) { const k = i * 10; fns.push(() => i + k); if (i === 1) i++; }
console.log(fns.map(f => f()).join(','));
class Check {
  static same<T>(a: T, b: T): boolean { return a === b; }
  static first<T>(xs: T[]): T { return xs[0]; }
}
console.log(Check.same(1, 1), Check.same('a', 'b'), Check.first(['x', 'y']));
const m = new Map<string, number>();
m.set('a', 1);
console.log(m.get('a'), m.get('zz') ?? -1);
