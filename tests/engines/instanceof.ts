interface Shape { size(): i32; }
class Base implements Shape { size(): i32 { return 1; } }
class Derived extends Base { extra: i32 = 4; size(): i32 { return this.extra; } }
class Other implements Shape { size(): i32 { return 2; } }
class Empty {}
class SameShape {}
const d: Shape = new Derived();
console.log('hierarchy', d instanceof Derived, d instanceof Base, d instanceof Other);
if (d instanceof Derived) console.log('narrowing', d.extra);
const base: Base = new Base();
console.log('base', base instanceof Base, base instanceof Derived);
const empty = new Empty();
console.log('nominal', empty instanceof Empty, empty instanceof SameShape);
function missing(): Base | null { return null; }
const absent = missing();
console.log('null', absent instanceof Base);
class Box<T> { constructor(public value: T) {} }
const ints = new Box<i32>(1), strings = new Box<string>('one');
console.log('generic', ints instanceof Box, strings instanceof Box, ints instanceof Base);
let total: i32 = 0;
for (let i: i32 = 0; i < 1000; i++) {
  const item: Shape = new Derived();
  const noise: string[] = ['allocation ' + i];
  if (item instanceof Base) total += item.size() + noise.length;
}
console.log('gc', total, d instanceof Derived);
function isDerived(value: any): boolean { return value instanceof Derived; }
console.log('dynamic', isDerived(d), isDerived(base), isDerived(3), isDerived('text'), isDerived(null), isDerived(undefined));
