// Strings: concatenation, comparison, templates, number conversion and the string methods.
const a: string = 'hello';
const b: string = a + ', ' + 'world';
console.log(b, b.length);
console.log(a === 'hello', a !== 'hello', a === b, 'abc' < 'abd', 'b' > 'a', 'a' <= 'a', 'z' >= 'zz', 'a' < 'ab');
const n: i32 = 42;
console.log(`n=${n} quarter=${n / 8} flag=${n > 3}`);
const big: u32 = 4000000000;
const neg: i32 = -17;
const half: f64 = 0.1 + 0.2;
console.log(n.toString() + '!', neg.toString(), big.toString(), half.toString(), (1e21).toString());

const s: string = '  Hello, World  ';
console.log(s.trim() + '|', s.trim().length, s.toUpperCase(), s.toLowerCase());
const t: string = s.trim();
console.log(t.charCodeAt(0), t.charCodeAt(4), t.charAt(1), t.charAt(99) === '');
console.log(t.slice(7), t.slice(0, 5), t.slice(-5), t.slice(-5, -2), t.slice(5, 2) === '', t.slice(3, 100));
console.log(t.substring(7), t.substring(5, 0), t.substring(-3, 2), t.substring(4, 4) === '');
console.log(t.indexOf('o'), t.indexOf('World'), t.indexOf('xyz'), t.indexOf(''));
console.log(t.includes('lo, W'), t.includes('LO'), t.startsWith('Hell'), t.startsWith('ell'), t.endsWith('ld'), t.endsWith('Wor'));
console.log('ab'.repeat(3), 'x'.repeat(0) === '', 'abc'.repeat(1));

const csv: string = 'a,b,,c,';
const parts: string[] = csv.split(',');
console.log(parts.length, parts.join('|'), 'abc'.split('').join('.'), 'abc'.split('x').length, ''.split(',').length, ''.split('').length);
console.log('one two  three'.split(' ').length, 'k=v=w'.split('=').join(' '));

// UTF-16 lengths and indices over non-ASCII text
const u: string = 'héllo wörld';
console.log(u.length, u.charCodeAt(1), u.slice(1, 4), u.indexOf('w'), u.toUpperCase().length, u.split('ö').length);
const emoji: string = 'a😀b';
console.log(emoji.length, emoji.charCodeAt(1), emoji.charCodeAt(2), emoji.indexOf('b'), emoji.slice(0, 1) + emoji.slice(3));
console.log('ünï'.trim().length, ' \t\n x '.trim() === 'x');

let acc: string = '';
for (let i: i32 = 0; i < 5; i++) acc += i;
acc += '|' + 1.5 + true;
console.log(acc, acc.length);
function greet(who: string): string { return 'hi ' + who; }
console.log(greet('zinc'), greet('') === 'hi ');
