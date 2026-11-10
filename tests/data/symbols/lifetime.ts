import { liveObjects } from 'zinc:sys';
function assert(ok: boolean): void { if (!ok) throw new Error('iterator ownership regression'); }
function arrayCursor() {
  const values: number[] = [];
  for (let i = 0; i < 128; i++) values.push(i);
  return values[Symbol.iterator]();
}
const array = arrayCursor();
array.next();
const arrayBefore = liveObjects();
while (!array.next().done) {}
const arrayAfter = liveObjects();
assert(arrayBefore - arrayAfter >= 2);
assert(array.next().done);
function mapCursor() {
  const values = new Map<number, string>();
  for (let i = 0; i < 128; i++) values.set(i, 'value' + i);
  return values[Symbol.iterator]();
}
const map = mapCursor();
map.next();
const mapBefore = liveObjects();
while (!map.next().done) {}
const mapAfter = liveObjects();
assert(mapBefore - mapAfter >= 128);
assert(map.next().done);
function cleared(): void {
  const values = new Map<number, number>();
  for (let i = 0; i < 128; i++) values.set(i, i);
  const iterator = values[Symbol.iterator]();
  iterator.next();
  const before = liveObjects();
  values.clear();
  const after = liveObjects();
  assert(before - after >= 5); // keys, values, tombstones, hash index and insertion ids
  values.set(200, 2);
  assert(iterator.next().value![0] === 200 && iterator.next().done);
}
cleared();
console.log('iterator ownership: pass');
