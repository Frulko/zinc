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
