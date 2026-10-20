// for...in (ZN-160): the keys of an object literal, a class instance (inherited fields first), an optional field when it is set,
// an array (its indices), and a parsed JSON value (array indices first, then insertion order).
const o = { a: 1, b: 'two', c: true };
for (const k in o) console.log('literal', k);

class Base { id = 1; protected tag = 'b'; describe(): string { return 'base'; } }
class Item extends Base { name = 'x'; count: number; get double(): number { return this.count * 2; } constructor(n: number) { super(); this.count = n; } }
const keys: string[] = [];
for (const k in new Item(3)) keys.push(k);
console.log(keys.join(','));

interface Opt { req: number; opt?: string }
const withOpt: Opt = { req: 1, opt: 'here' };
const without: Opt = { req: 2 };
for (const k in withOpt) console.log('with', k);
for (const k in without) console.log('without', k);

for (const i in ['p', 'q', 'r']) console.log('index', i, typeof i);

const data = JSON.parse('{"zeta": 1, "10": 2, "alpha": 3, "2": 4}');
const seen: string[] = [];
for (const k in data) seen.push(k);
console.log(seen.join(' '));
let n = 0;
for (const k in JSON.parse('[5, 6, 7]')) n += k.length;
console.log(n);

let total = 0;
const scores = { ann: 3, bob: 4 };
for (const name in scores) { if (name === 'bob') break; total += name.length; }
console.log(total);
