// ZN-417: borrowed parameters. tests/t0/rc_borrow.sh reads the IR and runs it.
class Item {
  n: number;
  constructor(n: number) { this.n = n; }
  // never stores or returns `this`: a borrowed receiver, and a call that cannot release keeps a loop element lent
  weight(k: number): number { return this.n * k; }
  // stores `this`: an owned receiver, which its caller retains first
  keepIn(list: Item[]): void { list.push(this); }
}
class Shelf {
  items: Item[] = [];
  total(): number { let s = 0; for (const it of this.items) s += it.weight(2); return s; }
}
// `it` is only read: borrowed
function describe(it: Item): string { return 'item ' + it.n; }
const shelf = new Shelf();
for (let i = 1; i <= 3; i++) shelf.items.push(new Item(i));
const kept: Item[] = [];
for (const it of shelf.items) it.keepIn(kept);
console.log(shelf.total());
console.log(describe(shelf.items[0]));
console.log(kept.length);
