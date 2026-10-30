// Class instances and interface values shared as records (open records, D192), writes through an interface's properties, and how a shared
// instance prints, serialises and views as `any`: what JavaScript does.
import { Head, Shown } from './open_records_lib';
interface Label { name: string; note?: string; }
interface Named { name: string; greet(): string; }
class G { get name(): string { return 'g'; } }
class S implements Named { private n = 's'; get name(): string { return this.n; } set name(v: string) { this.n = v; } greet(): string { return 'S ' + this.n; } }
class P implements Named { name = 'p'; greet(): string { return 'P ' + this.name; } }
class R implements Named { get name(): string { return 'r'; } greet(): string { return 'R'; } }
// a getter, an interface value, a missing optional field, narrower fields
const g: Label = new G();
try { g.name = 'x'; } catch (e) { console.log((e as Error).name, g.name); }
const nv: Named = new S();
const s: Label = nv;
s.name = 'set';
s.name += '!';
console.log(s.name, s.note, nv.greet());
class Animal { kind = 'animal'; }
class Dog extends Animal { bark = 'woof'; }
interface Rec { tag: string; n: number; v: string | null; pet: Animal; }
class K { tag: 'k' = 'k'; n = 2; v = 'v'; pet = new Dog(); }
const k = new K();
const r: Rec = k;
r.v = null;
r.pet = new Dog();
r.n += 1;
console.log(r.tag, r.n, r.v, r.pet.kind, k.pet.bark);
// writes through an interface's properties: a field, a setter, a getter alone
const ns: Named[] = [new P(), new S(), new R()];
for (const x of ns) {
  try { x.name += '+'; } catch (e) { console.log((e as Error).name); }
  console.log(x.greet(), x.name);
}
// a record literal as an interface of properties; a record extending a record of another module
interface Card extends Shown { title: string; }
interface Titled { title: string; }
class Page { title = 'p'; }
const t: Titled = new Page();
const lit: Titled = { title: 'lit' };
function show(c: Card): string { return c.title; }
const c: Card = lit;
c.title = 'w';
interface Sub extends Head { sub: string; }
const sub: Sub = { title: 'h', sub: 's' };
const head: Head = sub;
console.log(show(t), show(lit), lit.title, head.title);
// printed, serialised and viewed as `any` as the instance's own class
interface Labeled { label: string; }
class Tag { label = 'x'; n = 2; }
class Tag2 extends Tag { more = true; }
const l: Labeled = new Tag();
const all: Labeled[] = [{ label: 'lit' }, l, new Tag2()];
console.log(l, all[0], all[2]);
console.log(JSON.stringify(all));
const a: any = l;
a.n = 3;
const back: Labeled = a;
console.log(a.n, back === l, (all[2] as any).more);
// a record that holds itself: its serialisers call each other, and are not inlined into each other without end
interface Link { id: number; next: Link | null; }
class Node implements Link { id = 1; next: Node | null = null; }
const chain: Link = { id: 0, next: new Node() };
console.log(JSON.stringify(chain), chain);
