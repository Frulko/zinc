// tests/t0/dyn_generic.sh: a generic class or function converts Dyn to its type parameter, a T to Dyn, and JSON.stringify of a T; each
// instance is checked with its own type (zinc:worker decodes its messages this way).
interface P { a: number; s: string; xs: number[] }
class MessageEvent<T> { constructor(public data: T) {} }
class Box<T> {
  conv(v: any): T { return v as T; }
  str(v: T): string { return JSON.stringify(v); }
  dyn(v: T): any { const d: any = v; return d; }
}
const b = new Box<P>();
const p = b.conv(JSON.parse('{"a":1,"s":"x","xs":[1,2]}'));
console.log(p.s, p.xs.length, b.str(p));
console.log(JSON.stringify(b.dyn(p)));
let handler: ((raw: any) => void) | null = null;
function onMsg<T>(f: (e: MessageEvent<T>) => void): void { handler = (raw: any): void => { f(new MessageEvent<T>(raw as T)); }; }
onMsg((e: MessageEvent<P>) => { console.log('got', e.data.s, e.data.xs[1]); });
const h = handler;
if (h !== null) h(JSON.parse('{"a":2,"s":"y","xs":[3,4]}'));
const n = new Box<number>();
console.log(n.conv(JSON.parse('7')) + 1, n.str(3));
