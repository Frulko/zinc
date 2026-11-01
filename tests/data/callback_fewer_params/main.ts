type Maker = (i: number, j: number) => number;
interface H1 { cb: (x: number, y: number) => number }
class K { v = 7; get(): number { return this.v; } }
function use(f: Maker): number { return f(1, 2); }
function two(f: (a: number, b: number) => number): number { return f(1, 2); }
const a: number[] = [3, 1, 2];
console.log(a.map(() => 0).join(","));
console.log(a.map((): number => 5).join(","));
console.log(a.map(function (): number { return 6; }).join(","));
console.log(a.filter(() => true).length);
let n = 0;
a.forEach(() => { n++; });
console.log(n);
console.log(a.sort(() => 0).join(","));
console.log(a.reduce(() => 4, 0));
console.log(a.some(() => false), a.every(() => true), a.findIndex(() => false));
console.log(Array.from(a, () => 9).join(","));
console.log(use(() => 3), use((x) => x + 10), two(function () { return 8; }));
const h1: H1 = { cb: () => 11 };
console.log(h1.cb(1, 2));
const k = new K();
const g: Maker = () => k.get();
console.log(g(5, 6));
const m = new Map<string, number>(); m.set("a", 1);
m.forEach(() => { n += 10; });
console.log(n);
