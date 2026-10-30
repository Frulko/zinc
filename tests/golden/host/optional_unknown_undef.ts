// undefined given to an optional unknown (a property of an object literal, an argument) is undefined (ZN-877)
interface I { b?: unknown }
const o: I = { b: undefined };
const ob = o.b;
console.log(ob === undefined, typeof ob);
function pick(flag: boolean): I { return { b: flag ? 'a' : undefined }; }
console.log(pick(false).b === undefined, typeof pick(false).b, typeof pick(true).b);
function none(): unknown { return undefined; }
const c: I = { b: none() };
console.log(c.b === undefined, typeof c.b);
function arg(x?: unknown): string { return typeof x; }
console.log(arg(undefined), arg(), arg(1));
const r = new Request('http://localhost/', { method: 'GET', body: undefined });
console.log(r.method);
