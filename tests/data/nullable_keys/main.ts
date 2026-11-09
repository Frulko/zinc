import { equal, ok } from 'zinc:assert';

// Small linear tables and large hashed tables have the same nullable-key contract.
const initial: (string | null)[] = ['one', null];
const inferred = new Set(initial), explicit = new Set<string | null>(initial);
equal(inferred.size, 2); equal(explicit.size, 2); ok(inferred.has(null));
explicit.add(null); explicit.add(''); equal(explicit.size, 3);
ok(explicit.has('')); ok(explicit.delete(null)); ok(!explicit.has(null)); ok(!explicit.delete(null));
explicit.add(null); equal(explicit.size, 3);
let seenNull = 0, seenEmpty = 0;
for (const value of explicit.values()) { if (value === null) seenNull++; else if (value === '') seenEmpty++; }
equal(seenNull, 1); equal(seenEmpty, 1);
const membership: (string | null)[] = ['one', '', null];
ok(membership.includes(null)); equal(membership.indexOf(null), 2);

const map = new Map<string | null, string>([[null, 'first'], ['', 'empty']]);
equal(map.get(null), 'first'); ok(map.has(null)); equal(map.get(''), 'empty');
map.set(null, 'replacement'); equal(map.size, 2); equal(map.get(null), 'replacement');
for (let i = 0; i < 80; i++) { const key = 'key-' + i; map.set(key, 'value-' + i); explicit.add(key); }
equal(map.size, 82); equal(explicit.size, 83);
ok(map.has(null)); equal(map.get(null), 'replacement'); ok(explicit.has(null));
// Equal separately allocated strings still compare by value, not object identity.
const duplicate = ['key', '27'].join('-'); equal(map.get(duplicate), 'value-27');
explicit.add(duplicate); equal(explicit.size, 83);
ok(map.delete(null)); ok(!map.has(null)); ok(map.get(null) === undefined); ok(!map.delete(null));
map.set(null, 'restored'); equal(map.get(null), 'restored');
ok(explicit.delete(null)); ok(!explicit.has(null)); explicit.add(null); ok(explicit.has(null));
for (let i = 0; i < 65; i++) { ok(map.delete('key-' + i)); ok(explicit.delete('key-' + i)); }
for (let i = 80; i < 160; i++) { map.set('key-' + i, 'value-' + i); explicit.add('key-' + i); }
equal(map.get(null), 'restored'); ok(explicit.has(null)); equal(map.get(''), 'empty');
let nullKeys = 0, valueCount = 0;
for (const key of map.keys()) if (key === null) nullKeys++;
for (const value of map.values()) valueCount++;
equal(nullKeys, 1); equal(valueCount, map.size);
map.clear(); explicit.clear(); equal(map.size + explicit.size, 0);
ok(!map.has(null)); ok(!explicit.has(null)); map.set(null, 'after clear'); explicit.add(null);
equal(map.get(null), 'after clear'); ok(explicit.has(null));

// D18: test optional undefined slots separately; their nullish representation is shared in typed code.
const optional = new Set<string | undefined>(['present', undefined]);
ok(optional.has(undefined)); optional.add(undefined); equal(optional.size, 2);
for (let i = 0; i < 24; i++) optional.add('optional-' + i);
ok(optional.delete(undefined)); ok(!optional.has(undefined)); optional.add(undefined); ok(optional.has(undefined));
const optionalMap = new Map<string | undefined, string>([[undefined, 'missing']]);
for (let i = 0; i < 24; i++) optionalMap.set('optional-' + i, 'present');
equal(optionalMap.get(undefined), 'missing'); optionalMap.set(undefined, 'updated');
equal(optionalMap.get(undefined), 'updated'); ok(optionalMap.delete(undefined)); ok(!optionalMap.has(undefined));

class Payload { value: string; constructor(value: string) { this.value = value; } }
function ownReferences(): void {
  const values = new Map<string | null, Payload>();
  values.set(null, new Payload('old')); values.set(null, new Payload('replacement'));
  for (let i = 0; i < 20; i++) values.set('payload-' + i, new Payload('body-' + i));
  equal(values.get(null)?.value, 'replacement'); ok(values.delete(null));
  try { values.set(null, new Payload('unwind')); throw new Error('expected'); }
  finally { values.clear(); }
}
try { ownReferences(); } catch (error) { ok(error instanceof Error); }
console.log('nullable keys: pass');
