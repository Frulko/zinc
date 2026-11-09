// An optional chain short-circuits as a whole, as in TypeScript: `a.b?.m.get('x')`, `a.b?.list[1]`, `a.b?.name().length` are undefined when
// a.b is null, and what follows the `?.` reads the member's own type. Also `a.m?.get(k) ?? d` on a Map that is not there (ZN-1040).
class B { m = new Map<string, number>(); list: number[] = [4, 5]; name(): string { return 'b'; } }
class A { b: B | null = null; m: Map<string, number> | null = null; }
function show(a: A): void {
  console.log(`${a.b?.m.get('x') ?? -1} ${a.b?.m.size ?? -2} ${a.b?.list[1] ?? -3} ${a.b?.name().length ?? -4} ${a.b?.name().toUpperCase() ?? 'none'}`);
  console.log(`${a.m?.get('x') ?? -5} ${a.m?.has('x') ?? false}`);
}
const a = new A();
show(a);
const b = new B(); b.m.set('x', 3); a.b = b;
const m = new Map<string, number>(); m.set('x', 7); a.m = m;
show(a);
