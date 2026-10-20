// optional interface members, default parameters, array spread, ?? joining two classes
interface Opts { name?: string; n?: i32 }
function greet(o: Opts = {}): string { return (o.name ?? 'anon') + (o.n ?? 1); }
class Box { opts: Opts; constructor(o: Opts = {}) { this.opts = o; } }
console.log(greet(), greet({ name: 'z' }), greet({ n: 5 }), new Box().opts.n ?? 7);
function scale(v: f64, k: f64 = 2): f64 { return v * k; }
console.log(scale(3), scale(3, 4));
function nums(): number[] { return [1, 2]; }
const base = [1, 2];
console.log([...nums(), 3].join(','), [...base].length, [0, ...base, ...[9]].join(','));
class Shape { area(): number { return 0; } }
class Sq extends Shape { area(): number { return 4; } }
class Ci extends Shape { area(): number { return 3; } }
const m: Sq | null = null;
const s: Shape = m ?? new Ci();
console.log(s.area());
