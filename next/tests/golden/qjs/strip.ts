// The type syntax of the Zinc subset is blanked: annotations, generics, interfaces, aliases, `as`, modifiers, implements, enums, parameter properties.
interface Shape { area(): number }
type Pair<T> = [T, T];
enum Color { Red, Green = 5, Blue }
abstract class Base<T> implements Shape {
  protected readonly tag: string = 'b';
  constructor(public name: string, private n: number = 2) {}
  abstract area(): number;
  describe(): string { return `${this.name}:${this.n}:${this.area()}`; }
}
class Square extends Base<number> {
  constructor(private side: number) { super('sq', 3); }
  area(): number { return this.side * this.side; }
}
function first<T>(p: Pair<T>): T { return p[0]; }
const sq = new Square(4);
const x: number = (sq.area() as number) + 1;
const m = new Map<string, number>();
m.set('a', x);
console.log(sq.describe(), first<string>(['p', 'q']), Color.Green, Color.Blue, Color[0], m.get('a'));
// modifiers after `static`, and Zinc's decorators (@weak, @pooled(n)): blanked, the declaration kept (ZN-568: lib/std/web.ts under this engine)
class Limits { static readonly MAX: number = 9; private static readonly min: number = 1; static lowest(): number { return Limits.min; } }
@pooled(4) class Leaf { @weak parent: Leaf | null = null; @weak private readonly tag: string = 't'; label(): string { return this.tag; } }
console.log(Limits.MAX, Limits.lowest(), new Leaf().parent, new Leaf().label());
// imports of names read only as types are elided, `import type` included (game-2d's `import { Scene, TitleScene }`)
import { Shape2, Id, Box as B } from './shapes';
import type { Shape2 as S2 } from './shapes';
const shapes: Shape2[] = [new B(3)];
const id: Id = 7;
const s2: S2 = shapes[0];
console.log(s2.area(), id);
