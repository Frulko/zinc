import Callbacks from './callbacks/callbacks.spec';
const values: i32[] = [1, 2, 3, 4];
console.log('predicates', values.every(v => v > 0), values.some(v => v > 3), values.some(v => v > 9));
const empty: i32[] = [];
console.log('empty', empty.every(() => false), empty.some(() => true), empty.filter(() => true).length);
console.log('indices', values.findIndex((v, i) => v + i > 5), values.findLastIndex(v => v % 2 === 0), values.findIndex(v => v > 9));
const growing: i32[] = [1, 2];
let visited: i32 = 0;
console.log('growth', growing.every(v => { visited++; if (v === 1) growing.push(3); return true; }), visited, growing.length);
const shrinking: i32[] = [1, 2, 3];
visited = 0;
console.log('shrink', shrinking.some(v => { visited++; shrinking.splice(1); return false; }), visited, shrinking.length);
const changing: i32[] = [1, 2, 3];
const selected = changing.filter((v, i) => { changing[i] = 99; if (i === 0) changing.push(4); return v % 2 !== 0; });
console.log('filter mutation', selected, changing);
let sum: i32 = 0;
values.forEach((v, i) => { sum += v + i; });
console.log('each', sum);
try { values.every(v => { if (v === 3) throw new Error('predicate failed'); return true; }); }
catch (e) { console.log('caught', e.message); }
interface Item { label: string; value: i32; }
const retained: Item[] = [{ label: 'first', value: 1 }, { label: 'second', value: 2 }, { label: 'third', value: 3 }];
const kept = retained.filter(v => v.value > 1);
const mappedKeep: Item[] = retained.map((v): Item => ({ label: v.label + " mapped", value: v.value + 10 }));
let visits: i32 = 0;
for (let n: i32 = 0; n < 1500; n++) {
  const row: Item[] = [{ label: `first-${n}`, value: n }, { label: `second-${n}`, value: n + 1 }];
  if (row.every(v => { const nested: string[] = [v.label, `new-${n}`]; return nested.some(s => s.length > 0); })) visits++;
}
console.log('collected', visits, kept[0].label, kept[1].label, retained[0].label, mappedKeep[1].label);

const mappedInput: i32[] = [2, 4];
const mapped = mappedInput.map((v, i) => { mappedInput.push(9); return `${i}:${v}`; });
console.log('map', mapped, mappedInput.length);
const chosen = retained.find(v => v.value === 2);
const last = retained.findLast(v => v.value < 3);
const missing = retained.find(v => v.value > 9);
console.log('find', chosen === undefined ? 'missing' : chosen.label, last === undefined ? 'missing' : last.label, missing == null);
const search: number[] = [1, Math.sqrt(-1), 3, 1];
console.log('search', search.indexOf(1), search.indexOf(1, 1), search.indexOf(1, -1), search.indexOf(1, -99), search.indexOf(1, 99));
console.log('nan', search.indexOf(Math.sqrt(-1)), search.includes(Math.sqrt(-1)), search.includes(3, -2), search.includes(1, undefined));
console.log('reference search', retained.indexOf(kept[0]), retained.includes(kept[1]), retained.indexOf({ label: 'second', value: 2 }));

const swapped: Item[] = [{ label: 'before', value: 1 }];
const old = swapped.find(v => { swapped[0] = { label: 'after', value: 2 }; return true; });
console.log('find mutation', old === undefined ? 'missing' : old.label, swapped[0].label);

const bridged: i32[] = [1, 2];
console.log('native reentry', bridged.every(v => Callbacks.apply(v, (n: i32): i32 => {
  let hits: i32 = 0;
  for (let i: i32 = 0; i < 80; i++) { const temporary: string[] = [`held-${n}-${i}`]; if (temporary.some(s => s.length > 0)) hits++; }
  return hits;
}) === 80));
