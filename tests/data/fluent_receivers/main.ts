class Chain { count: number = 0; next(): Chain { this.count++; return this; } }
const value = new Chain().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next().next();
if (value.count !== 64) throw new Error("chain count");
class Fallback { count: number = 0; map(): Fallback { this.count++; return this; } sort(): Fallback { this.count++; return this; } replace(s: string): Fallback { this.count += s.length; return this; } postMessage(n: number): Fallback { this.count += n; return this; } }
const fallback = new Fallback().map().sort().replace("x").postMessage(1).map().sort().replace("x").postMessage(1).map().sort().replace("x").postMessage(1).map().sort().replace("x").postMessage(1).map().sort().replace("x").postMessage(1).map().sort().replace("x").postMessage(1).map().sort().replace("x").postMessage(1).map().sort().replace("x").postMessage(1).map().sort().replace("x").postMessage(1).map().sort().replace("x").postMessage(1).map().sort().replace("x").postMessage(1).map().sort().replace("x").postMessage(1);
if (fallback.count !== 48) throw new Error("fallback count");
let trace = '';
class Receiver {
  next(n: number): Receiver { trace += 'm'; return this; }
  get child(): Receiver { trace += 'g'; return this; }
  apply(f: (n: number) => number): number { return f(4); }
}
function make(): Receiver { trace += 'r'; return new Receiver(); }
function arg(): number { trace += 'a'; return 1; }
make().child.next(arg()).next(arg());
if (trace !== 'rgamam') throw new Error('receiver order: ' + trace);
trace = '';
function key(): string { trace += 'k'; return 'next'; }
const dynamic: any = make();
dynamic[key()](arg());
if (trace !== 'rkam') throw new Error('dynamic key order: ' + trace);
trace = '';
function callbacks(): ((n: number) => number)[] { trace += 'r'; return [(n: number): number => { trace += 'm'; return n; }]; }
function index(): number { trace += 'k'; return 0; }
callbacks()[index()](arg());
if (trace !== 'rkam') throw new Error('index order: ' + trace);
const optional: Receiver | null = null;
trace = '';
optional?.next(arg());
if (trace !== '') throw new Error('optional argument');
function optionalReceiver(present: boolean): Receiver | null { return present ? new Receiver() : null; }
optionalReceiver(true)?.next(1);
const numbers = [3, 1, 2].map(n => n + 1).sort((a, b) => a - b);
if (numbers.join(',') !== '2,3,4') throw new Error('collection');
const dynamicArray: any = [2, 3];
const mapped: any = dynamicArray.map((n: number): number => n + 1);
if ((mapped.join(',') as string) !== '3,4') throw new Error('dynamic collection');
const dynamicString: any = ' abc ';
if ((dynamicString.trim().replace('a', 'z') as string) !== 'zbc') throw new Error('dynamic string');
function identity<T>(value: T): T { return value; }
if (identity(new Receiver()).apply(n => n + 2) !== 6) throw new Error('contextual generic');
console.log('fluent receivers: pass');
