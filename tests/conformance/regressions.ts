// Compiler regressions reported while building the plugins: literal default parameters, comparing with this,
// common base class of ?? / ?:, functions as values, spreads of calls, ordered side effects, caught error messages.
// 1. object-literal default parameter
interface Opts { name?: string; n?: i32 }
function greet(o: Opts = {}): string { return (o.name ?? 'anon') + (o.n ?? 1); }
class Box { opts: Opts; constructor(o: Opts = {}) { this.opts = o; } }
console.log(greet(), greet({ name: 'z' }), new Box().opts.n ?? 7);
// 2. comparing an object with `this`
class Node2 { next: Node2 | null = null; isSelf(o: Node2): boolean { return o === this; } }
const a = new Node2(); console.log(a.isSelf(a), a.isSelf(new Node2()));
// 3. ?? / ?: with different subclasses
class Shape { area(): number { return 0; } }
class Sq extends Shape { area(): number { return 4; } }
class Ci extends Shape { area(): number { return 3; } }
const pick = (b: boolean): Shape => b ? new Sq() : new Ci();
const m: Sq | null = null;
const s: Shape = m ?? new Ci();
console.log(pick(true).area(), pick(false).area(), s.area());
// 5. module function as a value
function double(x: number): number { return x * 2; }
const f: (x: number) => number = double;
console.log([1, 2].map(double).join(','), f(4));
// 6. spread of a call result in an array literal
function nums(): number[] { return [1, 2]; }
console.log([...nums(), 3].join(','));
// 7. side effects evaluated in order in an array literal
let nextId = 0;
const ids = [nextId++, nextId++, nextId++];
console.log(ids.join(','));
// 8. catch (e) with e.message passed to a function
function show(s: string): void { console.log('caught', s); }
try { throw new Error('boom'); } catch (e) { show(e.message); }
