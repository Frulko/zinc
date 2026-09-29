const map = new Map<string, i32>();
map.set('a', 1).set('b', 2).set('a', 3);
console.log('map', map.size, map.has('a'), map.has('missing'), map.get('a'));
console.log('delete', map.delete('b'), map.delete('b'), map.size);
map.set('b', 4);
for (const [key, value] of map) console.log('entry', key, value);
console.log('snapshots', map.keys().join(','), map.values().join(','));
const set = new Set<i32>();
set.add(5).add(2).add(5);
console.log('set', set.size, set.has(5), set.delete(8));
for (const value of set) console.log('value', value);
console.log('set values', set.values().join(','));
let total: i32 = 0;
map.forEach((value: i32, key: string): void => { total += value + key.length; });
set.forEach((value: i32): void => { total += value; });
console.log('callbacks', total);
map.clear();set.clear();console.log('clear', map.size, set.size);
let fallbackCalls: i32 = 0;
function fallback(): i32 { fallbackCalls++; return 99; }
map.set('a', 0);
console.log('missing', map.get('a') ?? fallback(), map.get('missing') ?? fallback(), map.get('a') === undefined, map.get('missing') === undefined, fallbackCalls);
const numeric = new Map<number, i32>();
let shiftKey: u32 = 88172645;
shiftKey ^= shiftKey << 13; shiftKey ^= shiftKey >>> 17; shiftKey ^= shiftKey << 5;
const unsigned = new Map<u32, i32>(); unsigned.set(shiftKey, 8);
console.log('unsigned', shiftKey, unsigned.get(shiftKey));
numeric.set(0 / 0, 1).set(Math.sqrt(-1), 2).set(-0, 3).set(0, 4);
console.log('samevaluezero', numeric.size, numeric.get(0 / 0), numeric.get(0), numeric.has(-0), 1 / numeric.keys()[1] > 0);
const moving = new Map<i32, i32>();
for (let i: i32 = 0; i < 6; i++) moving.set(i, i);
let visits = '';
for (const [key, value] of moving) {
  visits = visits + key + ',';
  if (key === 0) { moving.delete(0); moving.delete(1); for (let j: i32 = 6; j < 15; j++) moving.set(j, j); }
}
console.log('growing', visits, moving.size);
visits = '';
moving.forEach((value: i32, key: i32): void => {
  visits = visits + key + ',';
  if (key === 2) { moving.clear(); moving.set(20, 20).set(21, 21); }
});
console.log('clear iteration', visits, moving.keys().join(','));
function stop(mode: i32): void {
  for (const [key, value] of moving) {
    if (mode === 0) break;
    if (mode === 1) return;
    throw new Error('stop');
  }
}
stop(0);stop(1);
try { stop(2); } catch (e) { console.log('caught', e.message); }
try { moving.forEach((value: i32, key: i32): void => { throw new Error('callback'); }); }
catch (e) { console.log('caught', e.message); }
moving.clear();
for (let i: i32 = 0; i < 3000; i++) { moving.set(i, i); moving.delete(i); }
console.log('released iterations', moving.size);
interface Node { label: string; owner: Map<Node, Node> | null }
function cyclic(label: string): Map<Node, Node> {
  const result = new Map<Node, Node>();
  const node: Node = { label, owner: result };
  result.set(node, node);return result;
}
const kept = cyclic('kept');
const keptKey = kept.keys()[0];
for (let i: i32 = 0; i < 2000; i++) { const discarded = cyclic('cycle' + i); if (discarded.size !== 1) console.log('bad cycle'); }
console.log('references', kept.get(keptKey) === keptKey, kept.get(keptKey)!.label, kept.has({ label: 'kept', owner: kept }));
const changing = new Set<i32>();changing.add(1).add(2);
visits = '';
for (const value of changing) { visits = visits + value + ','; if (value === 1) { changing.clear(); changing.add(3); } }
console.log('set iteration', visits);
