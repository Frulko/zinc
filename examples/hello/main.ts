import { greet, Counter } from './greet';

console.log(greet('Zinc'));
const c = new Counter();
for (let i = 0; i < 5; i++) c.inc();
console.log('count', c.value, 1 / 3, 0.1 + 0.2, 1e21, -0, [1, 2.5, 3]);
const words: string[] = 'a,b,c'.split(',');
for (const w of words) console.log(w.toUpperCase());
const m = new Map<string, i32>();
m.set('x', 1);
for (const [k, v] of m) console.log(k, v);
const total = [1, 2, 3].map(x => x * 2).reduce((a, b) => a + b, 0);
console.log(`total=${total}`);
