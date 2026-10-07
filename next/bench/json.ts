// JSON.parse into Dyn and JSON.stringify of a 1.5 MB document (ZN-092). Time it with `time` or Date.now under ZINC_REALTIME=1; bench/json.js is the same for QuickJS.
const rows: unknown[] = [];
for (let i = 0; i < 12000; i++) rows.push({ id: i, name: 'item-' + i, price: i * 1.37, tags: ['a', 'b', 'c' + (i % 7)], ok: i % 3 === 0, nested: { x: i / 7, y: null, z: 'text with "quotes" and \\ and é' } });
let t = Date.now();
const text = JSON.stringify(rows);
const t1 = Date.now();
let n = 0;
for (let i = 0; i < 10; i++) { const v: any = JSON.parse(text); n += v.length; }
const t2 = Date.now();
let m = 0;
for (let i = 0; i < 10; i++) m += JSON.stringify(JSON.parse(text)).length;
const t3 = Date.now();
console.log(text.length, n, m);
console.log('ms: stringify', t1 - t, 'parse x10', t2 - t1, 'parse+stringify x10', t3 - t2);
