// The Map and Set rows of ZN-602 (inline probe for integer keys, insertion without a second search, direct calls in compiled code):
// erased keys looked up and added again, float keys (NaN, -0), string keys, missing keys, chained set().
const m = new Map<i32, i32>();
for (let i: i32 = 0; i < 1000; i++) m.set(i * 7 % 1013, i);
for (let i: i32 = 0; i < 1000; i += 3) m.delete(i * 7 % 1013);
let found: i32 = 0, sum: i32 = 0;
for (let i: i32 = 0; i < 1013; i++) { if (m.has(i)) { found++; sum += m.get(i) ?? 0; } }
for (let i: i32 = 0; i < 30; i += 2) m.set(i * 7 % 1013, -i);
console.log(m.size, found, sum, m.get(0) ?? 99, m.get(14) ?? 99, m.get(1012) ?? 99);
const f = new Map<number, string>();
f.set(NaN, 'nan').set(-0, 'zero').set(1.5, 'x');
console.log(f.get(NaN) ?? '-', f.get(0) ?? '-', f.has(1.5), f.has(2.5), f.size);
const s = new Set<string>();
for (const w of ['a', 'b', 'a', 'c', 'b']) s.add(w);
s.delete('b');
let order = '';
for (const w of s.values()) order += w;
console.log(s.has('a'), s.has('b'), s.size, order);
const big = new Set<i32>();
for (let i: i32 = 0; i < 5000; i++) big.add(i * 31 % 4999);
let hits: i32 = 0;
for (let i: i32 = 0; i < 6000; i++) if (big.has(i)) hits++;
console.log(big.size, hits);
