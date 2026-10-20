// allocations() and liveObjects() (ZN-192): the counters move with arrays and strings, and a loop that creates nothing leaves them alone.
import { allocations, liveObjects } from 'zinc:sys';
const a0 = allocations();
const xs: number[] = [];
for (let i = 0; i < 100; i++) xs.push(i);
console.log('grew', allocations() - a0 > 0);
let sum = 0;
const a1 = allocations();
for (let i = 0; i < 1000; i++) sum += xs[i % 100];
console.log('no allocation in a numeric loop', allocations() === a1, sum);
const l0 = liveObjects();
{ const t: number[] = [1, 2, 3]; sum += t[0]; }
console.log('freed again', liveObjects() <= l0 + 1);
