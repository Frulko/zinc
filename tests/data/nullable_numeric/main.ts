import { equal } from 'zinc:assert';
function widen(v: i32 | undefined): number | undefined { return v; }
function local(v: i32 | undefined): number | undefined { const n: number | undefined = v; return n; }
function parameter(v: number | undefined): number | undefined { return v; }
function identity<T>(v: T): T { return v; }
function invoke(v: i32 | undefined, cb: (x: i32 | undefined) => number | undefined): number | undefined { return cb(v); }
class Stored { value: number | undefined; constructor(v: i32 | undefined) { this.value = v; } }
function maybeValue(v: i32, absent: boolean): i32 | undefined { return absent ? undefined : v; }
function test(v: i32 | undefined, expected: number | undefined): void {
  equal(widen(v), expected, 'return'); equal(local(v), expected, 'local'); equal(parameter(v), expected, 'parameter');
  equal(identity<number | undefined>(v), expected, 'generic argument');
  equal(invoke(v, (x: i32 | undefined): number | undefined => x), expected, 'callback return');
  equal(new Stored(v).value, expected, 'stored field');
}
for (const v of [0, -1, -123456789, 2147483647] as i32[]) { test(maybeValue(v, false), v); test(maybeValue(v, true), undefined); }
function unsigned(v: u32 | null): number | null { return v; }
function float(v: f32 | null): number | null { return v; }
equal(unsigned(4294967295 as u32), 4294967295); equal(unsigned(null), null);
equal(float(1.5 as f32), 1.5); equal(float(null), null);
function maybe(m: Map<string, string> | null): number | undefined { return m?.values().length; }
equal(maybe(null), undefined); equal(maybe(new Map<string, string>()), 0); equal(maybe(new Map<string, string>([['key', 'value']])), 1);
console.log('nullable numeric: pass');
