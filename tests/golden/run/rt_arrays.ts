// Arrays: push, pop, indexing, length, slice, reverse, indexOf, includes, join and sort with a comparator.
const xs: i32[] = [];
for (let i: i32 = 0; i < 10; i++) xs.push(i * i);
console.log(xs.length, xs[3], xs.pop(), xs.length);
xs[xs.length] = 99;
xs[0] = -5;
console.log(xs.length, xs[0], xs[xs.length - 1]);
console.log(xs.slice(2).length, xs.slice(2, 4)[0], xs.slice(-2)[0], xs.slice(5, 2).length, xs.slice(0).length);
const rev: i32[] = xs.slice(0).reverse();
console.log(rev[0], rev[rev.length - 1], xs[0]);
console.log(xs.indexOf(16), xs.indexOf(1000), xs.includes(49), xs.includes(50));

const empty: i32[] = [];
console.log(empty.length, empty.indexOf(1));

const names: string[] = ['pear', 'apple', 'fig', 'banana'];
console.log(names.join(', '), names.join(''), names.indexOf('fig'), names.includes('kiwi'));
names.sort((p: string, q: string) => (p < q ? -1 : p > q ? 1 : 0));
console.log(names.join(' '));
names.sort((p: string, q: string) => p.length - q.length);
console.log(names.join(' '));

const nums: f64[] = [3.5, -1, 2.25, 10, 0];
nums.sort((p: number, q: number) => p - q);
console.log(nums[0], nums[1], nums[2], nums[3], nums[4]);
nums.sort((p: number, q: number) => q - p);
console.log(nums.slice(0, 2)[0], nums[4]);

class Job {
  constructor(public prio: i32, public tag: string) {}
}
const jobs: Job[] = [new Job(2, 'a'), new Job(1, 'b'), new Job(2, 'c'), new Job(1, 'd'), new Job(0, 'e')];
jobs.sort((p: Job, q: Job) => p.prio - q.prio);
let order: string = '';
for (const j of jobs) order += j.tag + j.prio + ' ';
console.log(order);
console.log(jobs.indexOf(jobs[3]), jobs.includes(new Job(0, 'e')));

const grid: i32[][] = [[1, 2, 3], [4, 5, 6]];
grid.push([7, 8, 9]);
grid[1][1] = 50;
let total: i32 = 0;
for (const row of grid) for (const v of row) total += v;
console.log(grid.length, grid[2][0], grid[1][1], total);

const words: string[][] = [];
words.push('a b c'.split(' '));
words.push(['d']);
console.log(words[0].length, words[0].join('+'), words[1][0]);

const big: i32[] = [];
for (let i: i32 = 0; i < 1000; i++) big.push((i * 7919) % 1009);
big.sort((p: i32, q: i32) => p - q);
let ok: boolean = true;
for (let i: i32 = 1; i < big.length; i++) if (big[i - 1] > big[i]) ok = false;
console.log(ok, big[0], big[999], big.length);
