// ZN-413: loads that lend their value (no retain, no release) and those that must not. tests/t0/rc_lend.sh reads the IR and runs it.
class Item { n: number; label: string; constructor(n: number, label: string) { this.n = n; this.label = label; } }
class Box { item: Item; constructor(item: Item) { this.item = item; } }
const items: Item[] = [new Item(1, 'a'), new Item(2, 'bb'), new Item(3, 'ccc')];
// lent: the elements are only read (fields, a string row) while nothing can release
function sum(): number { let s = 0; for (const it of items) s += it.n + it.label.length; return s; }
// retained: the element is used after console output, which may run code (an object's toString)
function show(): number { let s = 0; for (const it of items) { console.log(it.n); s += it.n; } return s; }
function make(n: number): Box { return new Box(new Item(n, 'x')); }
// lent from a temporary: the box stays alive until the item's last use
function viaTemp(n: number): number { const it = make(n).item; return it.n * 2; }
console.log(sum());
console.log(show());
console.log(viaTemp(21));
