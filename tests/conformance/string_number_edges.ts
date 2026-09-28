// JS edge cases the native runtime got wrong while the sim (JavaScript) was right; found by zinc compat (test262).
// toFixed: exact ties round up in magnitude (printf rounds them to even), |x| >= 1e21 and NaN print like ToString
const vals = [0.5, 1.5, 2.5, -2.5, 0.125, -0.375, 9.5, 99.5, 1.005, 1.45, 123.456, 1e21, -1e21, 1.7976931348623157e308, NaN, Infinity, -Infinity, -1.5e-7, 0];
for (const v of vals) console.log(v, v.toFixed(0), v.toFixed(2), v.toFixed(3));
console.log((0.5).toFixed(20), (2 ** -30).toFixed(40), (4.35).toFixed(1), (1.25).toFixed(1), (-1.25).toFixed(1));
// parseInt: the 0x prefix without a radix, radices out of range
console.log(parseInt('0x1F'), parseInt('-0xff'), parseInt('0x'), parseInt('11', 2), parseInt('z', 36), parseInt('10', 1), parseInt('10', 37), parseInt('  42px'));
// trim: Unicode white space and line terminators
const ws = '\u00a0\ufeff\u2003 x y\u3000\u2028\u00a0';
console.log(ws.trim().length, ws.trimStart().length, ws.trimEnd().length, `[${'\t a \n'.trimStart()}]`, `[${'\t a \n'.trimEnd()}]`, 'é\u00a0'.trim().length);
// String(x), charAt, concat and the position arguments of includes / startsWith / endsWith
const n: i32 = 42;
console.log(String(n), String(1.5), String(true), String('s'), String(), String([1, 2]).length);
console.log('abc'.charAt(1), `[${'abc'.charAt(3)}]`, `[${'abc'.charAt(-1)}]`, 'héllo'.charAt(1), 'ab'.concat('cd'));
console.log('abcabc'.includes('a', 1), 'abcabc'.includes('a', 4), 'abcabc'.includes('', 99), 'héllo'.startsWith('llo', 2), 'abc'.startsWith('a', -5), 'abc'.startsWith('c', 2));
console.log('abc'.endsWith('b', 2), 'abc'.endsWith('c', 99), 'abc'.endsWith('a', 0), 'héllo'.endsWith('hé', 2), 'abc'.endsWith('', -1));
// Math.min / Math.max take any number of values
console.log(Math.max(1, 5, 3), Math.min(4, -2, 8, 0), Math.max(2), Math.max(), Math.min(), Math.max(1, NaN, 3), Math.min(0, -0, 0) === 0, 1 / Math.min(0, -0, 0));
// -0 literals keep their sign natively
console.log(1 / -0, -0 === 0, [-0].includes(0), 1 / [0, -0][1], (-0).toFixed(1));
