// Contextual typing of generic arguments (ZN-383): object and array literals passed to a generic function are typed against the instantiated parameter,
// so optional members may be left out, and the lambdas inside them are checked once with the inferred type.
interface Section<T> { title?: string; data: T[]; }
function count<T>(p: { sections: Section<T>[] }): number { let n = 0; for (const s of p.sections) n += s.data.length; return n; }
function titles<T>(p: { sections: Section<T>[] }): string { return p.sections.map((s: Section<T>): string => s.title ?? '-').join(','); }
const data = [1, 2, 3];
console.log(count({ sections: [{ title: 'A', data }, { data }] }));
console.log(titles({ sections: [{ title: 'A', data: ['x'] }, { data: ['y', 'z'] }] }));
function first<T>(x: T): T { return x; }
const o = first({ a: 1, f: (k: number): number => k * 2 });
console.log(o.a, o.f(3));
interface Opts<T> { items: T[]; key: (item: T) => string; title?: string; }
function keys<T>(o: Opts<T>): string { return o.items.map((x: T): string => o.key(x)).join(','); }
let calls = 0;
console.log(keys({ items: [4, 5], key: (n) => { calls++; return 'k' + n; } }), calls);
console.log(keys({ title: 'x', items: ['a'], key: (s) => s.toUpperCase() }));
