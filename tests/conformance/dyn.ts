// zinc-test: gradual
// Dyn (section 9): `any` in the gradual profile, JSON.parse without a type, checked conversions.
// Strict profiles skip this program; dyn_unknown.ts covers `unknown` in every profile.
class Point {
  constructor(public x: number, public y: number) {}
  norm(): number { return Math.sqrt(this.x * this.x + this.y * this.y); }
}
interface Item { name: string; qty: number; tags?: string[] }

// JSON.parse -> Dyn tree (DYN-09)
const data: any = JSON.parse('{"items":[{"name":"apple","qty":3},{"name":"pear","qty":2,"tags":["green"]}],"ok":true,"n":null,"pi":3.25,"s":"a\\u00e9\\n","big":1e21}');
console.log(data);
console.log(typeof data, typeof data.items, typeof data.ok, typeof data.n, typeof data.pi, typeof data.s, typeof data.missing);
console.log(data.items.length, data.items[1].name, data.items[5], data['pi'] * 2, data.big);
let total = 0;
for (const it of data.items) total += it.qty;
console.log('total', total);

// narrowing: after typeof the value is static (DYN-08)
const v: unknown = data.pi;
if (typeof v === 'number') console.log('number', v.toFixed(2), v + 1);

// checked conversion into typed values (DYN-07): a copy with every field checked
const items = data.items as Item[];
console.log(items[1].tags, items[0].name.toUpperCase(), items.length, items[0].qty * 2);

// mutation through Dyn
data.extra = [1, 'two', { three: 3 }];
data.items[0].qty += 10;
data.count = 0;
data.count++;
data.list = [];
data.list[0] = 'first';
console.log(JSON.stringify(data.items[0]), data.count, data.extra, data.list);

// ECMAScript operators (DYN-06)
const a: any = 5, b: any = '5', c: any = null;
console.log(a + 1, b + 1, a - b, a == b, a === b, c == undefined, c === undefined, a < 10, b > '4', !c, a && b, c ?? 'def');
console.log(a * b, b / 2, -b, +b + a, [1, 2] + a, `${c}|${data.missing}`);

// typed objects through Dyn: fields are readable and writable (checked)
const p: any = new Point(3, 4);
console.log(p.x, p.y, p.z, p instanceof Point, (p as Point).norm());
p.x = 6;
console.log(JSON.stringify(p), p);

// dynamic object literals, computed keys, `in` (DYN-05)
const key = 'k' + 2;
const o: any = { a: 1, [key]: [true, null], nested: { deep: 'yes' } };
console.log(o, 'a' in o, 'zz' in o, o.nested.deep, `${o.a}-${o.k2}`);

function describe(x: any): string {
  if (x === null) return 'null';
  if (Array.isArray(x)) return `array(${x.length})`;
  return typeof x;
}
console.log(describe(1), describe('s'), describe(null), describe([1, 2]), describe(o), describe(undefined), describe(true), describe(p));
const bag: any[] = [1, 'x', null];
bag.push(o.a);
console.log(bag, bag.indexOf('x'), bag.join('/'));

// invalid JSON is a catchable Error
try {
  JSON.parse('{bad');
} catch (e) {
  console.log('caught', e.message);
}

// a failed conversion is an uncaught TypeError
const bad: number = data.s;
console.log('unreachable', bad);
