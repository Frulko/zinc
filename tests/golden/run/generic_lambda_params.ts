function each<T>(list: () => T[], f: (t: T, i: i32) => i32): i32 { const a = list(); let s = 0; for (let k: i32 = 0; k < a.length; k++) s += f(a[k], k); return s; }
console.log(each(() => [0, 1, 2, 3, 4], (i: i32) => i * 2));
const r = [0, 1, 2].map((i: i32) => i + 1);
console.log(r.length);
