// Object.assign, freeze, fromEntries, getOwnPropertyNames and defineProperty on typed records and on any values (ZN-161.01);
// object_statics.out is Node 24's output.
interface Point { x: number; y: number; label?: string }
interface BoxInit { w?: number; tag?: string }
class Box {
  w: number = 1;
  h: number = 2;
  tag: string = 'box';
  get area(): number { return this.w * this.h; }
  constructor(init: BoxInit) { Object.assign(this, init); }
}

// assign on records
const p: Point = { x: 1, y: 2 };
const copy = Object.assign({}, p);
copy.x = 10;
console.log(p.x, copy.x, copy.y);
const merged = Object.assign({}, p, { y: 7 }, { label: 'm' });
console.log(merged.x, merged.y, merged.label);
const same = Object.assign(p, { x: 5 });
console.log(p.x, same === p);
Object.assign(p, { label: 'p' }, null, undefined);
console.log(p.label);
const b = new Box({ w: 3, tag: 'big' });
console.log(b.w, b.h, b.tag, b.area);

// assign with any values
const d: any = JSON.parse('{"x":4,"z":5,"2":"two","1":"one"}');
const fromAny: Point = { x: 0, y: 0 };
Object.assign(fromAny, d);
console.log(fromAny.x, fromAny.y);
const both = Object.assign({}, d, { w: 1 });
console.log(JSON.stringify(both));
const into: any = JSON.parse('{"a":1}');
Object.assign(into, p, JSON.parse('"hi"'));
console.log(JSON.stringify(into));

// getOwnPropertyNames
console.log(Object.getOwnPropertyNames(p).join(','));
console.log(Object.getOwnPropertyNames({ x: 1, y: 2 }).join(','));
console.log(Object.getOwnPropertyNames(b).join(','));
console.log(Object.getOwnPropertyNames([7, 8]).join(','));
console.log(Object.getOwnPropertyNames(d).join(','));

// fromEntries
const e = Object.fromEntries([['a', 1], ['b', 2], ['a', 3]]);
console.log(JSON.stringify(e), e.b);
const pairs: [string, string][] = [['k', 'v'], ['n', 'm']];
console.log(JSON.stringify(Object.fromEntries(pairs)));
const m = new Map<string, number>();
m.set('one', 1);
m.set('two', 2);
const fm = Object.fromEntries(m);
console.log(JSON.stringify(fm), Object.getOwnPropertyNames(fm).join(','));
console.log(JSON.stringify(Object.fromEntries(JSON.parse('[["q",1],["r",[2]]]'))));

// defineProperty
const o: any = JSON.parse('{"a":1}');
Object.defineProperty(o, 'hidden', { value: 42 });
Object.defineProperty(o, 'shown', { value: 'yes', enumerable: true, writable: true });
console.log(JSON.stringify(o), o.hidden, Object.getOwnPropertyNames(o).join(','));
console.log(o);
try { o.hidden = 1; } catch (err) { console.log('write:', (err as Error).name); }
o.shown = 'changed';
console.log(o.shown, 'hidden' in o);
const pt: Point = { x: 1, y: 1 };
const back = Object.defineProperty(pt, 'y', { value: 9 });
console.log(pt.y, back === pt);

// freeze
const f: any = Object.freeze(JSON.parse('{"k":1}'));
try { f.k = 2; } catch (err) { console.log('frozen:', (err as Error).name); }
try { f.z = 2; } catch (err) { console.log('frozen:', (err as Error).name); }
console.log(f.k, JSON.stringify(f));
const fr = Object.freeze({ k: 1, s: 'a' });
console.log(fr.k, fr.s);
const fp: Point = Object.freeze(p);
console.log(fp === p, fp.x);
