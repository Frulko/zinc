// zinc-test: skip ps1 esp32 ps2
// Number(x) / Boolean(x), the Number constants and statics, parseFloat's decimal-only prefix, replace / replaceAll
// substitutions ($$ $& $` $'), the empty replaceAll pattern, `undefined` for optional arguments and JSON.parse's
// SyntaxError; found by zinc compat (test262 built-ins/Number, String, JSON). Number(x) exists in f64 profiles only.
const flag = true;
console.log(Number('42'), Number(' 0x1F '), Number('1e3'), Number(''), Number('12px'), Number('-Infinity'), Number(flag), Number(2.5), Number());
console.log(Boolean(''), Boolean('0'), Boolean(0), Boolean(-1), Boolean(NaN), Boolean(), Boolean([1].length));
console.log(Number.MAX_VALUE, Number.MIN_VALUE, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN, Number.MIN_SAFE_INTEGER);
console.log(Number.isSafeInteger(2 ** 53 - 1), Number.isSafeInteger(2 ** 53), Number.isSafeInteger(1.5), Number.parseFloat('3.5kg'), Number.parseInt('ff', 16));
console.log(parseFloat('0x10'), parseFloat('inf'), parseFloat('nan'), parseFloat('-Infinity!'), parseFloat('1e'), parseFloat('.5.5'), parseFloat('+.25e1x'));
console.log('a-b-c'.replace('-', '[$&|$`|$\'|$$|$1]'), 'aXbXc'.replaceAll('X', '<$&>'), 'abc'.replaceAll('', '-'), ''.replaceAll('', 'x'), 'x'.replace('', '$$'));
console.log('abc'.padEnd(5, undefined) + '|', 'abc'.slice(1, undefined), [1, 2, 3].slice(1, undefined).join(), 'abc'.indexOf('c', undefined));
try { JSON.parse('{bad'); } catch (e) { console.log(e.name, e instanceof Error); }
const hex = '0x1F', neg = ' -2.5 ', yes = true;
console.log(+hex, -neg, +'', +'abc', +yes, -yes, +('0x0') === 0);
