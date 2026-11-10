// Raw optional slots mean undefined; an explicit null remains a dynamic value.
class Empty {}
class Parent { name = 'parent'; greet(): string { return this.name; } }
class Child extends Parent {}
type Optional = { value?: any };
const view: Optional = new Empty();
function observe(label: string, v: Optional): void {
  console.log(label, v.value === null, v.value === undefined, v.value == null);
  console.log(null === v.value, undefined === v.value, null == v.value, undefined == v.value);
  console.log(v.value !== null, v.value !== undefined, v.value != null, typeof v.value, !v.value, Boolean(v.value));
  console.log(JSON.stringify(v), JSON.stringify({ value: v.value }));
  const boxed: any = v.value;
  console.log(boxed === null, boxed === undefined, typeof boxed, JSON.stringify({ value: boxed }));
  if (v.value !== undefined) console.log('defined', v.value === null, typeof v.value);
  if (v.value === undefined) console.log('undefined', v.value === null, typeof v.value);
  if (v.value === null) console.log('null', v.value === undefined, typeof v.value);
  if (v.value !== null) console.log('not-null', v.value === undefined, typeof v.value);
  if (v.value == null) console.log('nullish', v.value === null, v.value === undefined);
  if (v.value != null) console.log('present', typeof v.value);
  if (v.value) console.log('truthy'); else console.log('falsy');
}
observe('absent', view);
view.value = null; observe('null', view);
view.value = undefined; observe('undefined', view);
view.value = false; observe('false', view);
view.value = 0; observe('zero', view);
view.value = ''; observe('empty', view);
view.value = 'yes'; observe('text', view);
const child = new Child();
view.value = child; observe('object', view);
function hasName(v: Optional): boolean { return 'name' in v.value; }
console.log(view.value instanceof Parent, view.value instanceof Child, hasName(view));
const method: any = (child as any).greet;
view.value = method; observe('method', view);
const roundtrip: any = view.value;
console.log(roundtrip === method);
function put(v: Optional, input: any): void { v.value = input; }
put(view, null); observe('boxed-null', view);
put(view, undefined); observe('reset', view);
const literal: Optional = { value: null };
observe('literal', literal);

let falls = 0;
function fallback(): string { falls++; return 'fallback'; }
function coalesce(v: Optional): void { console.log(v.value ?? fallback(), falls); }
coalesce(view);
view.value = null; coalesce(view);
view.value = 0; coalesce(view);
view.value = false; coalesce(view);
view.value = ''; coalesce(view);
console.log(String(view.value), Number(view.value));

function narrow(value?: unknown): void {
  if (typeof value === 'number') console.log(value + 1);
  if (typeof value === 'string') console.log(value.length);
  if (typeof value === 'boolean') console.log(!value);
  if (value instanceof Parent) console.log(value.name);
  if (value !== undefined) console.log('narrow-chain', value?.toString()?.length);
  if (value !== undefined) console.log('arg', value === null, typeof value);
}
narrow(); narrow(null); narrow(2); narrow('abc'); narrow(false); narrow(child);

// Optional unknown already supports Dyn's toString; null still stops the chain.
type Unknown = { value?: unknown };
const unknownView: Unknown = new Empty();
let reads = 0;
function receiver(): Unknown { reads++; return unknownView; }
function chain(): void { console.log(receiver().value?.toString().length, reads); }
chain(); unknownView.value = null; chain(); unknownView.value = false; chain();
unknownView.value = 0; chain(); unknownView.value = ''; chain(); unknownView.value = undefined; chain();
const dynamic: any = null;
unknownView.value = dynamic; chain();

// Ordinary typed optionals keep their existing storage and branch behaviour.
function typed(value?: string): void { console.log(typeof value, value === undefined, value ?? 'typed'); }
typed(); typed('x');

function overwrite(value?: unknown): void {
  if (value !== undefined) {
    value = null; console.log('overwrite', value === null, value === undefined, typeof value);
    value = undefined; console.log('reset-arg', value === null, value === undefined, typeof value);
  }
}
overwrite(1);
const parsed: any = JSON.parse('{"value":null}');
const decoded: Unknown = parsed;
console.log('decoded', decoded.value === null, decoded.value === undefined, JSON.stringify(decoded));

function nullable(value: unknown | null): void {
  console.log('nullable', value === null, value === undefined, typeof value);
  if (value !== undefined) console.log('nullable-defined', value === null, typeof value);
  if (value !== null) console.log('nullable-not-null', value === undefined, typeof value);
  const optional: Unknown = { value };
  console.log('nullable-optional', optional.value === null, optional.value === undefined, JSON.stringify(optional));
}
nullable(null); nullable(undefined); nullable(0);
function reverse(value?: unknown): void {
  if (typeof value === 'string') console.log('string', value.length);
  if (typeof value === 'number') console.log('number', value + 1);
  console.log('joined', value === null, value === undefined, typeof value);
}
reverse(null); reverse(undefined); reverse('a'); reverse(2);
function typedNumber(value?: number): void { console.log(typeof value, value === undefined, value ?? 5); }
typedNumber(); typedNumber(0);

function nested(): void {
 function read(value?: unknown): void { console.log(value === null, value === undefined, typeof value); }
 read(); read(null); read(undefined);
 const read2 = (value?: unknown): void => { console.log(value === null, value === undefined, typeof value); };
 read2(); read2(null); read2(undefined);
}
nested();
