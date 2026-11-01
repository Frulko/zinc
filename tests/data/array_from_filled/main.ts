// Array.from({ length: n }, () => literal) fills with one block; a callback that counts, or reads the index, is still called once per element.
const a = Array.from({ length: 5 }, (): u32 => 7);
const b = Array.from({ length: 3 }, (): number => -1.5);
const c = Array.from({ length: 4 }, (): boolean => true);
const d = Array.from({ length: 0 }, (): number => 1);
let k = 0;
const e = Array.from({ length: 3 }, (): number => k++);
const f = Array.from({ length: 3 }, (_v, i): number => i * 2);
a[2] = 9;
console.log(a.join(','), b.join(','), c.join(','), d.length, e.join(','), f.join(','), a.length, k);
