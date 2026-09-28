// destructuring, spread, optional chaining, discriminated unions, weak refs, pools, arenas, getters
interface Point { x: number; y: number }
type Shape = { kind: 'circle'; r: number } | { kind: 'rect'; w: number; h: number };
function area(s: Shape): number {
  switch (s.kind) {
    case 'circle': return Math.round(Math.PI * s.r * s.r);
    case 'rect': return s.w * s.h;
  }
}
const shapes: Shape[] = [{ kind: 'circle', r: 2 }, { kind: 'rect', w: 3, h: 4 }];
console.log(shapes.map(area), shapes);

const p: Point = { x: 1, y: 2 };
const { x, y } = p;
const [first, second] = [10, 20, 30];
console.log(x, y, first, second);
function len({ x, y }: Point): number { return Math.sqrt(x * x + y * y); }
console.log(len({ x: 3, y: 4 }));
const more = [...[1, 2], 3, ...[4]];
const q: Point = { ...p, y: 9 };
console.log(more, q);

class TreeNode {
  children: TreeNode[] = [];
  @weak parent: TreeNode | null = null;
  constructor(public name: string) {}
  add(c: TreeNode): void { c.parent = this; this.children.push(c); }
}
const root = new TreeNode('root');
root.add(new TreeNode('leaf'));
console.log(root.children[0].parent?.name ?? 'none', root.parent?.name ?? 'none');

@pooled(4)
class Bullet { x = 0; alive = true; }
const bullets: Bullet[] = [];
for (let i = 0; i < 6; i++) bullets.push(new Bullet());
console.log('bullets', bullets.length);

function frame(): number {
  using arena = Arena.frame(4096);
  let s = 0;
  for (let i = 0; i < 10; i++) { const t: Point = { x: i, y: i }; s += t.x + t.y; }
  return s;
}
console.log('arena sum', frame());

let counter: Map<string, i32> | null = null;
counter ??= new Map<string, i32>();
counter.set('k', 1);
console.log(counter.size);

// for (let ...): each iteration has its own binding, also when closures capture the counter.
const perIter: (() => number)[] = [];
for (let i = 0; i < 3; i++) { const k = i * 10; perIter.push(() => i + k); if (i === 1) i++; }
console.log('per-iteration', perIter.map((f: () => number) => f()).join(','));
