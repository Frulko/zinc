import { equal, ok } from 'zinc:assert';

const minimal = new Set<string>(['key']).values();
equal(minimal.length, 1); equal(minimal[0], 'key');
const map = new Map<string, string>([['first', 'one'], ['second', 'two']]);
const keys = map.keys(), values = map.values(), entries = map.entries();
equal(keys.length, 2); equal(keys[1], 'second'); equal(keys.map(x => x.toUpperCase()).join(','), 'FIRST,SECOND');
equal(values.length, 2); equal(values[0], 'one'); equal(values.join(','), 'one,two');
equal(entries.length, 2); equal(entries[0][0], 'first'); equal(entries[1][1], 'two');
equal(entries.map(x => x[0] + ':' + x[1]).join(','), 'first:one,second:two');
map.set('first', 'changed'); map.delete('second'); map.set('third', 'three');
equal(keys.join(','), 'first,second'); equal(values.join(','), 'one,two'); equal(entries[0][1], 'one');
equal(map.keys().join(','), 'first,third');
let seen = '';
for (const value of map.values()) seen += value + ';';
equal(seen, 'changed;three;');
const set = new Set<string>(['alpha', 'beta']);
const sk = set.keys(), sv = set.values(), se = set.entries();
equal(sk.length, 2); equal(sv[1], 'beta'); equal(se[0][0], 'alpha'); equal(se[0][1], 'alpha');
equal(sv.map(x => x + '!').join(','), 'alpha!,beta!');
set.delete('alpha'); set.add('gamma');
equal(sk.join(','), 'alpha,beta'); equal(sv.join(','), 'alpha,beta'); equal(se[0][0], 'alpha');
equal(set.values().join(','), 'beta,gamma');
const emptyMap = new Map<string, string>(), emptySet = new Set<string>();
equal(emptyMap.keys().length + emptyMap.values().length + emptyMap.entries().length, 0);
equal(emptySet.keys().length + emptySet.values().length + emptySet.entries().length, 0);
const nullable = new Map<string | null, string | null>([[null, 'some'], ['nil', null]]);
equal(nullable.keys()[0], null); equal(nullable.values()[1], null); equal(nullable.entries()[0][0], null);
const nullableSet = new Set<string | null>([null, 'some']); equal(nullableSet.values()[0], null); equal(nullableSet.entries()[0][1], null);
const optionalSet = new Set<string | undefined>([undefined, 'some']); ok(optionalSet.values()[0] === undefined);
// Arrays already have the same documented snapshot contract; nested result methods retain it.
const array = ['a', 'b']; const av = array.values(), ak = array.keys(), ae = array.entries();
array.push('c'); equal(av.join(','), 'a,b'); equal(ak.length, 2); equal(ae[1][1], 'b');
equal(map.values().values().length, 2);
let calls: i32 = 0;
function receiver(): Map<string, string> { calls++; return map; }
equal(receiver().values().length, 2); equal(calls, 1);
class Custom {
  prefix: string = 'custom';
  values(): string[] { return [this.prefix]; }
  keys(): string { return this.prefix; }
  entries(n: i32): i32 { return n + 1; }
}
class BaseValues { values(): string[] { return ['base']; } }
class DerivedValues extends BaseValues { values(): string[] { return super.values().values(); } }
equal(new DerivedValues().values().join(','), 'base');
const custom = new Custom(); equal(custom.values()[0], 'custom'); equal(custom.keys(), 'custom'); equal(custom.entries(7), 8);
function maybe(m: Map<string, string> | null): i32 | undefined { return m?.values().length; }
ok(maybe(null) === undefined); equal(maybe(map), 2);
function maybeCustom(c: Custom | null): string | undefined { return c?.values().join(','); }
ok(maybeCustom(null) === undefined); equal(maybeCustom(custom), 'custom');
console.log('collection results: pass');
