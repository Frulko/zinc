// conversions, string positions, array methods with indices, variadic Math
const s = ' 42 ';
console.log(Number(s), Number('0b101'), Number('1e2'), Number('1_0'), Boolean(''), Boolean('x'), Boolean(0.5), String(12), String(true), String([1, 2, 3]));
console.log(+'7', -'3', +true, Math.max(1, 9, 4), Math.min(5, 2, 8, 3), Math.max(), Number.MAX_SAFE_INTEGER, Number.isSafeInteger(3), Number.parseInt('12px'));
console.log('abcabc'.indexOf('b', 2), 'abcabc'.includes('c', 5), 'abc'.startsWith('b', 1), 'abc'.endsWith('b', 2), '  x '.trimStart() + '|', '  x '.trimEnd() + '|', 'ab'.concat('cd'));
console.log('a.b'.replace('.', '[$&]'), 'x-y'.replace('-', "<$`|$'>"), 'aaa'.replaceAll('a', '$$'));
const xs = [3, 1, 2];
console.log(xs.map((x, i) => x * 10 + i), xs.filter((x, i) => i !== 1), xs.reduce((acc, x, i) => acc + x * i, 0), xs.reduceRight((acc, x) => acc + x, ''));
console.log(xs.indexOf(2), xs.lastIndexOf(3), xs.includes(1, 2), xs.join('-'), [0, 0, 0].fill(5, 1).join(), xs.findLast(x => x > 1), xs.findLastIndex(x => x > 5));
console.log('é\x41\u{1F600}'.length, 'é\x41'.charCodeAt(0));
