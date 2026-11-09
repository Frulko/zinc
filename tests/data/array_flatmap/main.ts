import { equal } from 'zinc:assert';
const rows: string[][] = [['a'], ['b', 'c']];
equal(rows.flatMap((row: string[]): string[] => row).join(','), 'a,b,c', 'original nested string array');
equal([1, 2].flatMap(n => [n, n * 2]).join(','), '1,2,2,4', 'numeric inference');
equal([1, 2].flatMap(n => n + 3).join(','), '4,5', 'scalar mapper');
equal([1, 2].flatMap(n => 'a' + n).join(','), 'a1,a2', 'strings are scalar, not iterables');
equal([1, 2].flatMap(() => [9]).join(','), '9,9', 'zero-argument mapper');
const tuple = [1].flatMap((n: number): [number, number] => [n, n]);
equal(tuple.length, 2, 'tuple mapper flattens once');
equal(tuple.join(','), '1,1', 'tuple mapper values');
equal([1, 2].flatMap((n: number): number[] => []).length, 0, 'empty result');
const source = [1, 2, 3], trace: string[] = [];
const mapped = source.flatMap((value: number, index: i32, array: number[]): number[] => {
  trace.push(value + ':' + index + ':' + (array === source));
  if (index === 0) { array.push(99); array[1] = 20; }
  return index === 1 ? [] : [value, value + 10];
});
equal(trace.join(','), '1:0:true,20:1:true,3:2:true', 'callback order, value, index, source, captured length');
equal(mapped.join(','), '1,11,3,13', 'empty result and one-level flatten');
equal(source.join(','), '1,20,3,99', 'only callback mutates input');
const shrinking = [4, 5, 6]; let calls: i32 = 0;
const shrunk = shrinking.flatMap((value: number): number[] => { calls++; if (calls === 1) { shrinking.pop(); shrinking.pop(); } return [value]; });
equal(calls, 1, 'removed elements skipped'); equal(shrunk.join(','), '4', 'shrink without bounds trap');
const nested: number[][] = [[1, 2], [3]];
const same = nested.flatMap((row: number[]): number[][] => [row]);
equal(same.length, 2, 'one level only'); equal(same[0] === nested[0], true, 'inner array identity');
class Item { n: number; constructor(n: number) { this.n = n; } }
const item = new Item(7), items = [item];
const doubled = items.flatMap(value => [value, value]);
equal(doubled[0] === item && doubled[1] === item, true, 'record identity and inference');
const records = [{ n: 1 }, { n: 2 }];
const lifted = records.flatMap(record => [record]);
equal(lifted.map(record => record.n).join(','), '1,2', 'structural record inference');
equal(lifted[0] === records[0], true, 'structural record identity');
const tupleRecords = [item].flatMap((value: Item): [Item, Item] => [value, value]);
equal(tupleRecords[0] === item && tupleRecords[1] === item, true, 'tuple record identity');
let caught = false;
try { [item, item].flatMap((value: Item, index: i32): Item[] => { if (index === 1) throw new Error('stop'); return [new Item(value.n)]; }); } catch (e) { equal(e.message, 'stop', 'callback error'); caught = true; }
equal(caught, true, 'error propagated'); equal(item.n, 7, 'source remains owned after throw');
equal([1, 2].flatMap(n => n === 1 ? n : [n, n]).join(','), '1,2,2', 'mixed scalar/array union');
equal([1, 2].flatMap(n => n === 1 ? 'a' : [n]).join(','), 'a,2', 'heterogeneous scalar and array results');
equal([1, 2].flatMap(n => n === 1 ? ['a'] : [n]).join(','), 'a,2', 'heterogeneous array results');
const heterogeneousTuple = [1].flatMap((n: number): [number, string] => [n, 'ok']);
equal(heterogeneousTuple.join(','), '1,ok', 'heterogeneous tuple results');
const dynamic: any = [[1], [2, 3]];
equal(dynamic.flatMap((row: any): any => row).join(','), '1,2,3', 'Dyn-backed callback result');
console.log('array flatMap: pass');
