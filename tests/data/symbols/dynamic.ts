function assert(ok: boolean): void { if (!ok) throw new Error('dynamic iterator regression'); }
let step = 0;
let closed = 0;
const source: any = {
  [Symbol.iterator]: (): any => ({
    next: (): any => { const current = step++; return { done: current >= 3, value: current }; },
    return: (): any => { closed++; return { done: true }; }
  })
};
let total = 0;
for (const item of source) { total += item; if(item === 1) break; }
assert(total === 1 && step === 2 && closed === 1);
let failed = false;
const bad: any = { [Symbol.iterator]: (): any => ({next: (): any => 4, return: (): any => {closed++;return {};}}) };
try { for(const item of bad) { total += item; } } catch(error) { failed = error.name === 'TypeError'; }
assert(failed && closed === 1);
class Result { constructor(public done: boolean, public value: number) {} }
class Typed {
  value: number = 0;
  next(): Result { return new Result(this.value >= 2, this.value++); }
  [Symbol.iterator](): Typed { return this; }
}
const typed: any = new Typed();
let items = 0;
for (const value of typed) items += value;
assert(items === 1);
step = 0;
const values: any[] = Array.from(source);
assert(values.length === 3 && closed === 1);
console.log('dynamic iteration: pass');
const entryList: any = [[Symbol.for('entry'), 9]];
const built: any = Object.fromEntries(entryList);
assert(built[Symbol.for('entry')] === 9 && Object.getOwnPropertySymbols(built).length === 1);
console.log('symbol entries: pass');
