// typeof in a type position and readonly array types (ZN-155).
const p = { x: 1, name: 'a' };
const q: typeof p = { x: 2, name: 'b' };
const a: readonly number[] = [1, 2];
function sum(xs: readonly number[]): number { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[i]; return s; }
console.log(q.x, q.name, a[0], sum(a));
