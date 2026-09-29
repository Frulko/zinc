class Base {
  value: i32 = 0;
  compute(a: i32, b: i32): i32 { return this.value + a + b; }
}
class Derived extends Base {
  compute(a: i32, b: i32): i32 { return this.value + 100 + a + b; }
}
const source = new Base(); source.value = 1;
const receiver = new Derived(); receiver.value = 20;
const fromBase = source.compute.bind(receiver, 2);
console.log('base identity', fromBase(3));
const dynamic: Base = new Derived();
const fromDerived = dynamic.compute.bind(receiver, 2);
console.log('virtual identity', fromDerived(3));
receiver.value = 30;
console.log('receiver live', fromBase(4), fromDerived(4));
function add(a: i32, b: i32): i32 { return a + b; }
const addFive = add.bind(null, 5);
console.log('plain', addFive(7));
const again = fromBase.bind(new Base(), 8);
console.log('rebind ignores receiver', again());
class Static { static twice(value: i32): i32 { return value * 2; } }
const twice = Static.twice.bind(null);
console.log('static', twice(7));
class Thrower { fail(value: i32): i32 { if (value < 0) throw new Error('bound error'); return value; } }
const thrower = new Thrower();
const fail = thrower.fail.bind(thrower);
try { console.log(fail(-1)); } catch (e) { console.log('caught', e.message); }
const retained: ((value: i32) => i32)[] = [];
for (let i: i32 = 0; i < 500; i++) {
  const a = new Base(); const b = new Derived(); b.value = i;
  const bound = a.compute.bind(b, 2);
  if (i < 3) retained.push(bound);
  const junk: string[] = ['noise ' + i, 'allocation ' + i];
  bound(junk.length);
}
console.log('retained', retained[0](10), retained[1](10), retained[2](10));
let order = '';
function origin(): Base { order += 's'; return source; }
function other(): Derived { order += 'r'; return receiver; }
function initial(): i32 { order += 'a'; return 2; }
const ordered = origin().compute.bind(other(), initial());
console.log('order', order, ordered(3));
