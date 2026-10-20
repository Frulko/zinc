const m: Map<string, i32> = new Map<string, i32>();
m.set('a', (m.get('a') ?? 0) + 1);
const s: Set<i32> = new Set<i32>();
s.add(1);
let joined: string = '';
for (const k of m.keys()) joined += k + ',';
let total: i32 = 0;
for (const v of s.values()) total += v;
const nums: i32[] = [3, 1, 2];
const sorted: i32[] = nums.sort((a: i32, b: i32) => b - a);
const words: string[] = ['x', 'y'];
console.log(m.size, s.size, joined, total, sorted[0], words.join(' '));
class Item { constructor(public n: i32) {} }
const items: Map<i32, Item> = new Map<i32, Item>();
console.log((items.get(1) ?? new Item(0)).n);
