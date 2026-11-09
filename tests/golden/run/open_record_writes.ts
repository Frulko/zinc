// Interfaces of fields and open records (ZN-1030): class instances shared structurally, getters supplying fields, missing optional fields,
// writes through interfaces, setters and computed objects, an optional field a write adds, a literal that leaves an optional field out.
interface Labeled { label: string }
class Tag implements Labeled { label: string = 'tag'; }
const l: Labeled = new Tag();
console.log(l.label);

type Named = { name: string; note?: string; size: number };
interface HasName { name: string; size: number }
class Box implements HasName { name = 'box'; size = 3; }
const hn: HasName = new Box();
const r1: Named = hn;                      // an interface value
console.log(r1.name, r1.size);
class Getter { get name(): string { return 'got'; } size = 4; }
const r2: Named = new Getter();            // a getter supplies the field
console.log(r2.name, r2.size);
class Plain { name = 'plain'; size = 5; }
const r3: Named = new Plain();             // the optional field is missing
console.log(r3.name, r3.note === undefined);
class Narrow { name: 'n' = 'n'; size = 6; }
const r4: Named = new Narrow();            // a narrower field type
console.log(r4.name, r4.size);

interface Movable { x: number; move(): void }
class Pt implements Movable { x = 1; move(): void { this.x++; } }
const mv: Movable = new Pt();
mv.x = 10; mv.move();                      // a write through an interface property
console.log(mv.x);

console.log(new Plain(), JSON.stringify(new Plain()));
r3.note = 'added';                         // an optional field the class lacks: the write adds it
console.log(r3.note, r3, JSON.stringify(r3));
const plains: Named[] = [new Plain(), new Plain()];
plains[1].note = 'second';
console.log(plains[0].note === undefined, plains[1].note);

class Temp { private c = 0; get celsius(): number { return this.c; } set celsius(v: number) { this.c = v; } }
type HasC = { celsius: number };
const temps: HasC[] = [new Temp(), new Temp()];
temps[1].celsius = 30;                     // a computed object, a setter
console.log(temps[0].celsius, temps[1].celsius);
interface Sized { size: number }
class S implements Sized { size = 1; }
const ss: Sized[] = [new S()];
ss[0].size = 9;                            // a computed object, an interface property
console.log(ss[0].size);
type MaybeNum = { v: number | null };
class NV { v: number = 3; }
const hv: MaybeNum = new NV();             // a narrower field shared as a record that needs a box
console.log(hv.v);

const lit: Named = { name: 'lit', size: 1 };
const lit2: Named = { name: 'l2', note: 'n', size: 2 };
console.log(lit, lit2, JSON.stringify(lit));
class Sub extends Plain { extra = 1; }
const r5: Named = new Sub();
r5.note = 'sub';
console.log(r5, JSON.stringify(r5));

// methods seen through an any: a function bound to its object, called with the arguments boxed
class Greeter { name = 'g'; greet(): string { return 'hi ' + this.name; } add(a: number, b: number): number { return a + b; } reset(): void { this.name = 'r'; } }
class Loud extends Greeter { greet(): string { return 'HI ' + this.name; } }
const gr = new Greeter();
const dg: any = gr;
console.log(typeof dg.greet, typeof dg.name, 'greet' in dg, dg.greet, dg.greet === dg.greet);
console.log(dg.greet(), dg.add(2, 3));
dg.reset();
console.log(gr.name, dg.greet());
const dl: any = new Loud();
console.log(dl.greet());
try { dg.nope(); } catch (e) { console.log(e instanceof TypeError); }

// a record of an interface shared as a wider record: one object, writes and added fields seen through both
const hh: HasName = { name: 'h', size: 1 };
const rh: Named = hh;
rh.note = 'x';
rh.size = 7;
console.log(hh.size, rh.note, hh, JSON.stringify(hh));
const rb: Named = hn;                       // a class shared as the interface, then as the wider record
rb.size = 8;
rb.note = 'b';
console.log(hn.size, hn);
const hs: HasName[] = [{ name: 'a', size: 1 }];
function grow(x: Named): void { x.size++; }
grow(hs[0]);
console.log(hs[0].size);
type JustName = { name: string };
const jn: JustName = hh;                    // a record with fewer fields
jn.name = 'renamed';
console.log(hh.name, jn);
