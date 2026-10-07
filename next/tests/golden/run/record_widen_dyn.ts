// a record with more fields where a record with fewer is expected (a copy), `instanceof` of a subclass seen through unknown, and a ternary mixing a class and unknown
interface A { x?: i32 }
interface B extends A { y?: string }
class P { v: i32; constructor(init: A = {}) { this.v = init.x ?? 7; } }
class Q extends P { constructor(init: B = {}) { super(init); } }
function take(a: A): i32 { return a.x ?? -1; }
const b: B = { x: 3, y: 'q' };
console.log(take(b), new Q(b).v, new Q().v);

class Blob { type: string = 'text'; }
class File extends Blob { name: string = 'f.txt'; }
function name(value: unknown): string {
  if (value instanceof Blob) { return value instanceof File ? value.name : 'blob:' + value.type; }
  return 'other';
}
console.log(name(new File()), name(new Blob()), name(5));

function pick(r: unknown): unknown { return r === undefined ? new File() : r; }
console.log(pick(undefined) instanceof File, pick(7) instanceof File);
