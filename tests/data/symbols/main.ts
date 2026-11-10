let checks = 0;
function assert(ok: boolean): void { checks++; if (!ok) throw new Error('symbol/iterator regression ' + checks); }
function typeError(run: () => void): void {
  let caught = false;
  try { run(); } catch (error) { caught = error.name === 'TypeError'; }
  assert(caught);
}
const first: symbol = Symbol('same');
const second = Symbol('same');
assert(first !== second && typeof first === 'symbol');
assert(first.description === 'same' && Symbol().description === undefined && Symbol('').description === '');
assert(String(first) === 'Symbol(same)');
assert(Symbol.for('shared') === Symbol.for('shared'));
assert(Symbol.keyFor(Symbol.for('shared')) === 'shared' && Symbol.keyFor(first) === undefined);
assert(Symbol.iterator === Symbol.iterator && Symbol.iterator !== Symbol.asyncIterator);
assert(Symbol.iterator !== Symbol.for('Symbol.iterator'));
const dynamic: any = first;
assert(typeof dynamic === 'symbol' && dynamic.description === 'same');
typeError(() => { Number(dynamic); });
typeError(() => { const text = '' + dynamic; });
typeError(() => { const text = `${dynamic}`; });
typeError(() => { Symbol.for(dynamic); });
typeError(() => { Symbol.keyFor(4 as any); });
const object: any = { [first]: 1, [second]: 2, plain: 3 };
assert(object[first] === 1 && object[second] === 2 && first in object);
assert(Object.keys(object).length === 1 && Object.getOwnPropertyNames(object).length === 1);
assert(Object.getOwnPropertySymbols(object).length === 2);
assert(JSON.stringify(object) === '{"plain":3}');
assert(JSON.stringify(first) === undefined);
const symbols: any[] = [first, undefined, 1];
assert(JSON.stringify(symbols) === '[null,null,1]');
Object.defineProperty(object, second, { enumerable: false });
const copy: any = Object.assign({}, object);
assert(copy[first] === 1 && copy[second] === undefined && copy.plain === 3);
assert(Object.getOwnPropertySymbols(copy).length === 1);
Object.defineProperty(object, first, { writable: false });
typeError(() => { object[first] = 9; });
let order = '';
function key(): symbol { order += 'k'; return first; }
function value(): number { order += 'v'; return 1; }
const ordered: any = { [key()]: value(), [key()]: value() };
assert(order === 'kvkv' && ordered[first] === 1);
console.log('symbols: pass');

class Step {
  constructor(public done: boolean, public value: number) {}
}
let closed = 0;
let acquired = 0;
class Counter {
  index: number = 0;
  constructor(public failNext: boolean = false, public failClose: boolean = false) {}
  next(): Step { if (this.failNext) throw new Error('next'); return new Step(this.index >= 3, this.index++); }
  return(): Step { closed++; if (this.failClose) throw new Error('close'); return new Step(true, 0); }
  [Symbol.iterator](): Counter { acquired++; return this; }
}
let total = 0;
for (const item of new Counter()) { total += item; if (item === 1) break; }
assert(total === 1 && closed === 1 && acquired === 1);
for (const item of new Counter()) { if (item === 1) continue; total += item; }
assert(total === 3 && closed === 1);
try { for (const item of new Counter(false, true)) { throw new Error('body'); } }
catch (error) { assert(error.message === 'body'); }
assert(closed === 2);
try { for (const item of new Counter(true)) { total += item; } }
catch (error) { assert(error.message === 'next'); }
assert(closed === 2);
function early(): number { for (const item of new Counter()) return item; return -1; }
assert(early() === 0 && closed === 3);
let iterations = 0;
outer: for (const item of new Counter()) { iterations++; if (item === 1) continue outer; if (item === 2) break outer; }
assert(iterations === 3 && closed === 4);
const spread = [...new Counter()];
assert(spread.length === 3 && spread[2] === 2 && closed === 4);
const made = new Set<number>(new Counter());
assert(made.size === 3);
console.log('custom iteration: pass');

const array = [1, 2];
const arrayIterator = array[Symbol.iterator]();
assert(arrayIterator.next().value === 1);
array.push(3);
assert(arrayIterator.next().value === 2 && arrayIterator.next().value === 3 && arrayIterator.next().done);
array.push(4); assert(arrayIterator.next().done);
let codepoints = '';
for (const char of 'A😀B') codepoints += '[' + char + ']';
assert(codepoints === '[A][😀][B]');
const stringIterator = '😀B'[Symbol.iterator]();
assert(stringIterator.next().value === '😀' && stringIterator.next().value === 'B' && stringIterator.next().done);
const map = new Map<number, string>();
for (let index = 0; index < 12; index++) map.set(index, 'v' + index);
const mapIterator = map[Symbol.iterator]();
assert(mapIterator.next().value![0] === 0);
map.delete(1); map.delete(2); map.set(1, 'again');
for (let index = 3; index < 25; index++) map.set(index, 'v' + index);
assert(mapIterator.next().value![0] === 3);
map.clear(); map.set(50, 'new');
assert(mapIterator.next().value![0] === 50 && mapIterator.next().done);
map.set(51, 'late'); assert(mapIterator.next().done);
const set = new Set<number>(); set.add(1); set.add(2);
const setIterator = set[Symbol.iterator]();
assert(setIterator.next().value === 1);
set.delete(1); set.add(1);
assert(setIterator.next().value === 2 && setIterator.next().value === 1 && setIterator.next().done);
const live = new Map<number, number>(); live.set(1, 10); live.set(2, 20);
let seen = '';
for (const [key, item] of live) { seen += key + ':' + item + ';'; if (key === 1) { live.delete(1); live.set(3, 30); } }
assert(seen === '1:10;2:20;3:30;');
console.log('builtin iteration: pass');
let mapperCalls = 0;
const mapped = Array.from(new Counter(), (item: number): number => { mapperCalls++; return item * 2; });
assert(mapped.length === 3 && mapped[2] === 4 && mapperCalls === 3);
const beforeMapperThrow = closed;
try { Array.from(new Counter(), (item: number): number => { if(item === 1) throw new Error('mapper'); return item; }); }
catch(error) { assert(error.message === 'mapper'); }
assert(closed === beforeMapperThrow + 1);
console.log('iterator consumers: pass');
assert(arrayIterator[Symbol.iterator]() === arrayIterator);
let reads = '';
let nextReads = 0;
class GetterResult {
  get done(): boolean { reads += 'd'; return false; }
  get value(): number { reads += 'v'; return 7; }
}
class GetterIterator {
  get next(): () => GetterResult { nextReads++; return (): GetterResult => new GetterResult(); }
  return(): Step { closed++; return new Step(true, 0); }
  [Symbol.iterator](): GetterIterator { return this; }
}
for (const item of new GetterIterator()) { assert(item === 7); break; }
assert(reads === 'dv' && nextReads === 1);
const checkedSymbol: any = first;
const recovered: symbol = checkedSymbol;
assert(recovered === first);
console.log('protocol ordering: pass');
const spreadCopy: any = { ...object, extra: 4 };
assert(spreadCopy[first] === 1 && spreadCopy[second] === undefined && spreadCopy.extra === 4);
assert(Object.getOwnPropertySymbols(spreadCopy).length === 1);
console.log({ [Symbol('visible')]: 1 });
console.log('symbol spread: pass');
typeError(() => { const values: any = [first]; String(values); });
typeError(() => { const text: any = 'text'; text.includes(first); });
typeError(() => { const values: any = [first, second]; values.sort(); });
const frozen: any = { [first]: 1 };
Object.freeze(frozen);
typeError(() => { Object.defineProperty(frozen, first, { writable: true }); });
const alias: symbol = Symbol.iterator;
const aliasSource = new Counter();
assert(aliasSource[alias]() === aliasSource);
console.log('symbol boundaries: pass');
const beforeEmpty = closed;
const [] = new Counter();
assert(closed === beforeEmpty + 1);
const [one, two] = new Counter();
assert(one === 0 && two === 1 && closed === beforeEmpty + 2);
const [head, ...tail] = new Counter();
assert(head === 0 && tail.length === 2 && tail[1] === 2);
let skippedReads = 0;
class SkipResult {
  get done(): boolean { return false; }
  get value(): number { skippedReads++; return 8; }
}
class SkipIterator {
  next(): SkipResult { return new SkipResult(); }
  return(): Step { closed++; return new Step(true, 0); }
  [Symbol.iterator](): SkipIterator { return this; }
}
const [, afterSkip] = new SkipIterator();
assert(afterSkip === 8 && skippedReads === 1);
function badDefault(): number { throw new Error('default'); }
class EmptyValue {
  next(): {done: boolean, value: number | undefined} { return {done:false, value:undefined}; }
  return(): Step { closed++; return new Step(true,0); }
  [Symbol.iterator](): EmptyValue { return this; }
}
const beforeDefault = closed;
try { const [value = badDefault()] = new EmptyValue(); } catch(error) { assert(error.message === 'default'); }
assert(closed === beforeDefault + 1);
let assigned: number | undefined;
function badTarget(): (number | undefined)[] { throw new Error('target'); }
const assignmentSource = new Counter();
const beforeTarget = closed;
try { [assigned, badTarget()[0]] = assignmentSource; } catch(error) { assert(error.message === 'target'); }
assert(assigned === 0 && assignmentSource.index === 1 && closed === beforeTarget + 1);
const resumed = [1,2,3][Symbol.iterator]();
for (const item of resumed) { assert(item === 1); break; }
assert(resumed.next().value === 2);
while (!resumed.next().done) {}
assert(resumed.next().done);
let dynamicRest: any[] = [];
[...dynamicRest] = new Set<number>([1, 2]);
assert(dynamicRest[0] === 1 && dynamicRest[1] === 2);
console.log('destructuring and lifetime: pass');
