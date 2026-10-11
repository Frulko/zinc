// Array patterns with a rest element and with default values (ZN-160), in declarations, assignments, parameters and for...of.
const [a, b, ...r] = [1, 2, 3, 4];
console.log(a, b, r.join(','), r.length);
const [only, ...none] = [9];
console.log(only, none.length);

const xs: number[] = [10, 20];
const [p = 7, q = 8, s = 9] = xs;
console.log(p, q, s);
const [t0 = 1, t1 = 2] = [5];
console.log(t0, t1);

const words: string[] = ['x'];
let w1 = '', w2 = '';
[w1 = 'one', w2 = 'two'] = words;
console.log(w1, w2);

let calls = 0;
function fallback(): number { calls++; return 100; }
const [u = fallback(), v = fallback()] = [3];
console.log(u, v, calls);

function head([first = 'none', ...others]: string[]): string { return first + '+' + others.length; }
console.log(head([]), head(['a']), head(['a', 'b', 'c']));

const pairs: [string, number][] = [['k', 1], ['l', 2]];
for (const [name, n = 0] of pairs) console.log(name, n);

const grid = [[1, 2, 3], [4, 5]];
for (const [first, ...rest] of grid) console.log(first, rest.join('|'));

const [[n1, n2 = -1], ...tail] = [[1], [2, 3], [4, 5]];
console.log(n1, n2, tail.length);
