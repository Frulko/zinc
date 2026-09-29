import Callbacks from './callbacks/callbacks.spec';
const values: i32[] = [1, 2, 3];
console.log('sum', values.reduce((a, v) => a + v, 10));
console.log('right', values.reduceRight((a: string, v, i) => a + v + ':' + i + ';', ''));
const empty: i32[] = [];
console.log('empty', empty.reduce((a, v) => a + v, 9), empty.reduceRight((a, v) => a + v, 8));
console.log('arity', values.reduce(() => 7, 0), values.reduce((a: i32) => a + 1, 0));
const growing: i32[] = [1, 2];
console.log('growth', growing.reduce((a, v) => { growing.push(8); return a + v; }, 0), growing.length);
const shrinking: i32[] = [1, 2, 3];
console.log('shrink', shrinking.reduce((a, v, i) => { if (i === 0) shrinking.splice(1); return a + v; }, 0));
const backwards: i32[] = [1, 2, 3];
console.log('reverse shrink', backwards.reduceRight((a, v, i) => { if (i === 2) backwards.splice(1); return a + v; }, 0));
try { values.reduce((a, v) => { if (v === 2) throw new Error('reduce failed'); return a + v; }, 0); }
catch (e) { console.log('caught', e.message); }
interface Item { label: string; value: i32; }
let saved: Item = { label: '', value: 0 };
let count: i32 = 0;
for (let n: i32 = 0; n < 500; n++) {
  const row: Item[] = [{ label: `first-${n}`, value: 1 }, { label: `last-${n}`, value: 2 }];
  const initial: Item = { label: 'start', value: 0 };
  const combined = row.reduce((a: Item, v, i): Item => {
    const extra: string[] = [a.label, v.label];
    return { label: extra.join('|'), value: a.value + Callbacks.apply(v.value, (x: i32): i32 => x + i) };
  }, initial);
  if (n === 0) saved = combined;
  count += combined.value;
}
console.log('gc', count, saved.label, saved.value);
