// console.log of cyclic data and of functions, in Node's util.inspect format.
class Item {
  constructor(public name: string) {}
  next: Item | null = null;
  kids: Item[] = [];
  tags: Map<string, Item> = new Map<string, Item>();
}
const a = new Item('a');
a.next = a;
console.log(a);
const b = new Item('b');
const c = new Item('c');
b.next = c;
c.next = b;
console.log(b);
const root = new Item('root');
root.kids.push(root);
root.kids.push(new Item('leaf'));
console.log(root);
const holder = new Item('holder');
holder.tags.set('self', holder);
console.log(holder);
const p = new Item('p');
const q = new Item('q');
p.kids.push(q);
q.kids.push(p);
q.next = q;
console.log(p, [p, q]);

function named(x: number): number { return x + 1; }
const arrow = (x: number): number => x * 2;
const box = { run: (x: number) => x, plain: arrow };
class Handler {
  cb: (x: number) => number = (x: number) => x - 1;
  constructor(public fn: (x: number) => number) {}
}
console.log(named, arrow, box);
console.log([named, (x: number) => x], new Handler(named));
let later: (x: number) => number = (x: number) => x;
console.log(later);
later = arrow;
console.log(later);
