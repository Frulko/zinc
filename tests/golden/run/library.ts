// Array callbacks, string methods, parsing, value-returning || and &&, for-of over strings, Maps and Sets, Math.imul.
const xs: i32[] = [1, 2, 3, 4, 5];
console.log(xs.map(x => x * 2), xs.map(x => x + 0.5), xs.map(x => `n${x}`));
console.log(xs.filter(x => x % 2 === 1), xs.some(x => x > 4), xs.every(x => x > 1), xs.findIndex(x => x === 3), xs.findIndex(x => x > 9));
console.log(xs.reduce((a, b) => a + b, 0), xs.reduce((a, b) => a * b, 1), xs.reduce((s, x) => s + x + ',', ''));
console.log(xs.concat([6, 7]), xs.slice().length, xs.slice(2), xs.slice(1, -1));
let total = 0;
xs.forEach(x => { total += x; });
console.log(total);
const people = [{ name: 'ann', age: 31 }, { name: 'bob', age: 25 }, { name: 'cy', age: 40 }];
console.log(people.map(p => p.name).join('/'), people.filter(p => p.age > 30).length);
const sorted = people.slice().sort((a, b) => a.age - b.age);
console.log(sorted.map(p => p.name));
const adders = [1, 2, 3].map(k => (x: number) => x + k);
console.log(adders.map(f => f(10)));

console.log('7'.padStart(3, '0'), 'ab'.padStart(6, 'xyz'), 'ab'.padEnd(5), 'ab'.padEnd(5, '-') + '|', 'long'.padStart(2), '5'.padStart(4));
console.log('a-b-c'.replaceAll('-', '+'), 'a-b-c'.replace('-', '+'), 'aaa'.replaceAll('a', 'bb'), 'abc'.replaceAll('', '.'), 'abc'.replace('', '.'), 'x'.replaceAll('y', 'z'));
console.log(parseInt('42px'), parseInt('  -17'), parseInt('0x1f'), parseInt('ff', 16), parseInt('z'), parseInt(''), parseFloat('3.5e2'), parseFloat('.5x'), parseFloat('abc'), parseFloat('-Infinity'), parseFloat('1e'));
console.log(String.fromCharCode(90), String.fromCharCode(233), String.fromCharCode(65 + 256));
console.log(Math.imul(65537, 65537), Math.imul(-5, 12), Math.imul(0x7fffffff, 2));

const empty = ''.slice(0, 0);
const name = empty || 'anon';
const word = 'x'.repeat(1);
const full = word || 'y';
const zero: i32 = 0;
const five = zero || 5;
const nan: number = NaN;
const dflt = nan || 7;
const both = word && 'b';
const none = empty && 'b';
const three: i32 = 3;
console.log(name, full, five, dflt, both, none === '', three && 4, zero && 4);

let chars = '';
for (const ch of 'héy') chars += '[' + ch + ']';
console.log(chars);
const m = new Map<string, i32>();
m.set('one', 1);
m.set('two', 2);
for (const [k, v] of m) console.log(k, v);
const st = new Set<number>();
st.add(5);
st.add(6);
let sum = 0;
for (const v of st) sum += v;
console.log(sum);
