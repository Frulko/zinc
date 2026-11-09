// UTF-16 index reads on non-ASCII strings (ZN-1015): the same results on every engine, and linear loops (the string keeps a cursor).
// Mixed text: ASCII, 2-byte (é), 3-byte (€) and 4-byte characters (a pair: 😀), and lone halves of a pair.
const parts: string[] = ['a', 'é', '€', '😀', 'z', String.fromCharCode(0xd83d), 'ß', String.fromCharCode(0xde00), '中'];
let s = '';
for (let i = 0; i < 40; i++) s += parts[(i * 7) % parts.length] + parts[i % parts.length];
let h: number = 0;
const mix = (v: number): void => { h = (h * 31 + v) % 1000000007; };
// forward, backward and strided reads
for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i));
for (let i = s.length - 1; i >= 0; i--) mix(s.charCodeAt(i));
for (let i = 0; i < s.length; i += 7) { mix(s.charCodeAt(i)); mix(s.charCodeAt(s.length - 1 - i)); }
console.log('charCodeAt ' + h);
h = 0;
for (let i = 0; i < s.length; i++) mix(s.codePointAt(i));
console.log('codePointAt ' + h);
// slices that start or end between the halves of a pair, charAt, at
const out: string[] = [];
for (let i = 0; i + 3 <= s.length; i += 5) out.push(s.slice(i, i + 3) + '|' + s.substring(i + 3, i + 1) + '|' + s.charAt(i) + s.at(-i - 1));
h = 0;
const joined = out.join(',');
for (let i = 0; i < joined.length; i++) mix(joined.charCodeAt(i));
console.log('slices ' + out.length + ' ' + h);
// indexOf from each match, lastIndexOf, includes and split('')
let n = 0, at = s.indexOf('€');
while (at >= 0) { n += at; at = s.indexOf('€', at + 1); }
console.log('indexOf ' + n + ' ' + s.lastIndexOf('中') + ' ' + s.lastIndexOf('é', 30) + ' ' + s.includes('ß', 70) + ' ' + s.split('').length);
// a long accented text: a loop of charCodeAt over 1 MB is linear
let big = '';
const line = 'Le cœur a ses raisons que la raison ne connaît point, éé àà ùù. ';
while (big.length < 1000000) big += line;
const t0 = Date.now();
let sum = 0;
for (let i = 0; i < big.length; i++) sum += big.charCodeAt(i);
const ms = Date.now() - t0;
console.log(`[${String.fromCharCode(104, 105, 0x20ac)}][${String.fromCharCode()}][${String.fromCodePoint(0x1f600, 33)}]`);
console.log('big ' + big.length + ' ' + sum);
console.log(ms < 1000 ? 'linear' : 'slow: ' + ms + ' ms');
