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
