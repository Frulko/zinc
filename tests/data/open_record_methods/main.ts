class G {
  name = 'g';
  greet(suffix: string = '!'): string { return this.name + suffix; }
  add(a: number = 2, b: number = 3): number { return a + b; }
  reset(): void { this.name = 'reset'; }
  named(prefix: string = this.name): string { return prefix; }
}
class H extends G {}
class L extends G { greet(suffix: string = '?'): string { return 'loud' + suffix; } }
const g = new G(); const d: any = g; const other: any = new G(); const inherited: any = new H(); const loud: any = new L();
console.log(typeof d.greet, d.greet === d.greet, d.greet === other.greet, d.greet === inherited.greet, d.greet === loud.greet);
console.log(d.greet(), d.greet('.'), d.add(), d.add(4), d.add(4, 5));
const f: any = d.greet; try { console.log(f()); } catch(e) { console.log('unbound', e instanceof TypeError); }
const add: any = d.add; console.log(add(), add(8));
let calls = 0; function receiver(): any { calls++; return d; }
console.log(receiver().greet(), calls);
const key = 'greet'; console.log(d[key]('*'), d['greet']('#'));
d.reset(); console.log(g.name, d.greet());
console.log(inherited.greet(), loud.greet());
try { d.nope(); } catch(e) { console.log('missing', e instanceof TypeError); }
console.log(JSON.stringify({ method: d.greet, name: d.name }));
const dynamic: any = { method: d.greet, absent: undefined, name: d.name };
console.log(JSON.stringify(dynamic));

// Structural views keep one object, including a nested narrower record field.
type Detail = { name: string; extra: number };
type Name = { name: string };
class Holder { detail: Detail = { name: 'before', extra: 7 }; }
type View = { detail: Name; note?: string };
const holder = new Holder();
const view: View = holder;
view.detail.name = 'after';
view.note = 'shared';
console.log(holder.detail.name, holder.detail.extra, view.note);
console.log((holder as any) === (view as any), (holder.detail as any) === (view.detail as any));
interface Label { name: string }
type LabelNote = { name: string; note?: string };
const label: Label = { name: 'label' };
const noted: LabelNote = label;
noted.name = 'renamed'; noted.note = 'added';
console.log(label.name, JSON.stringify(label), (label as any) === (noted as any));

// Temporary receivers survive arguments and invocation; extracted functions survive their source binding.
function fresh(): any { return new G(); }
console.log(fresh().greet('temporary'));
let source: G | null = new G();
const standalone: any = (source as any).add;
const unbound: any = (source as any).greet;
source = null;
console.log(standalone());
try { unbound(); } catch(e) { console.log('released', e instanceof TypeError); }

let current: any = new G();
function swap(): string { current = new L(); return '*'; }
console.log(current.greet(swap()), current.greet());
console.log(d.named(), inherited.named());

console.log(JSON.stringify({ 'method-key': d.greet, 'n"ame': d.name, plain: 0, active: false }));
class Empty {}
type OptionalMethod = { method?: any };
const optional: OptionalMethod = new Empty();
console.log(JSON.stringify(optional));
optional.method = d.greet;
console.log(JSON.stringify(optional));
optional.method = undefined;
console.log(JSON.stringify(optional), optional.method === undefined);
type RequiredDynamic = { value: unknown | null };
const required: RequiredDynamic = { value: null };
console.log(JSON.stringify(required));
