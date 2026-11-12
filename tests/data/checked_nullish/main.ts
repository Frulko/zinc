function check(ok: boolean, why: string): void { if (!ok) throw new Error(why); }
let refused = 0;
function reject(run: () => void): void {
  try { run(); } catch (error) { check(error instanceof TypeError, 'checked conversion error'); refused++; return; }
  throw new Error('bad nullish kind accepted');
}
interface Item { name: string; }
interface Optional { n?: number; b?: boolean; s?: string; list?: number[]; item?: Item; }
interface Nullable { n: number | null; b: boolean | null; s: string | null; list: number[] | null; item: Item | null; }
type Maybe = number | null;
interface Both { direct?: number | null; alias?: Maybe; }
interface Nested { rows: Optional[]; }
interface Dynamic { value?: unknown; }
const absent: Optional = JSON.parse('{}');
check(absent.n === undefined && absent.b === undefined && absent.s === undefined && absent.list === undefined && absent.item === undefined, 'optional absence');
const values: Optional = JSON.parse('{"n":0,"b":false,"s":"","list":[],"item":{"name":"","extra":1},"extra":1}');
check(values.n === 0 && values.b === false && values.s === '' && values.list !== undefined && values.list.length === 0 && values.item !== undefined && values.item.name === '', 'explicit defaults');
const nulls: Nullable = JSON.parse('{"n":null,"b":null,"s":null,"list":null,"item":null}');
check(nulls.n === null && nulls.b === null && nulls.s === null && nulls.list === null && nulls.item === null, 'nullable null');
const bothAbsent: Both = JSON.parse('{}');
const bothNull: Both = JSON.parse('{"direct":null,"alias":null}');
const partialAbsent: Partial<Nullable> = JSON.parse('{}');
const partialNull: Partial<Nullable> = JSON.parse('{"n":null,"b":null,"s":null,"list":null,"item":null}');
const bothValues: Both = JSON.parse('{"direct":2,"alias":3}');
check(bothValues.direct === 2 && bothValues.alias === 3, 'nullable optional values');
const dynamicNull: Dynamic = JSON.parse('{"value":null}');
const dynamicAbsent: Dynamic = JSON.parse('{}');
check(dynamicNull.value === null && dynamicAbsent.value === undefined, 'optional unknown preserves kind');
reject(() => { const v: Optional = JSON.parse('{"n":null}'); });
reject(() => { const v: Optional = JSON.parse('{"b":null}'); });
reject(() => { const v: Optional = JSON.parse('{"s":null}'); });
reject(() => { const v: Optional = JSON.parse('{"list":null}'); });
reject(() => { const v: Optional = JSON.parse('{"item":null}'); });
reject(() => { const v: Nullable = JSON.parse('{"b":null,"s":null,"list":null,"item":null}'); });
reject(() => { const v: Nested = JSON.parse('{"rows":[{"n":1},{"n":null}]}'); });
reject(() => { const v: Optional = JSON.parse('{"n":"0"}'); });
reject(() => { const v: number | undefined = JSON.parse('null'); });
reject(() => { const v: Item | undefined = JSON.parse('null'); });
const missing: number | undefined = JSON.parse('0');
check(missing === 0, 'optional value zero');
function decoded(): Optional { const result: Optional = JSON.parse('{"n":4}'); return result; }
function callback(value: Optional): number { return value.n ?? -1; }
check(callback(decoded()) === 4, 'typed result and parameter');
check(refused === 10, 'all malformed cases rejected');
console.log('checked nullish: pass');
