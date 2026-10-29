// TypeScript that libraries write (trieur): `export { a, type B }`, async, generator and generic methods of an object literal, `x!++`
export { make, type Options } from './ts_more_lib.ts';
import { make, type Options } from './ts_more_lib.ts';
const store = {
  async load<T>(key: string): Promise<T | null> { return (key === 'k' ? 1 : null) as T | null; },
  *ids() { yield 1; yield 2; },
  async *later() { yield 'x'; },
  'quoted'(): string { return 'q'; },
  async: 5,
};
const counts: number[] = [0, 0];
counts[1]!++;
counts[0]! += 4;
const o: Options = { n: 3 };
const later: string[] = [];
const it = store.later();
for (let r = await it.next(); !r.done; r = await it.next()) later.push(r.value);
console.log(await store.load<number>('k'), [...store.ids()].join(','), later.join(','), store.quoted(), store.async, counts.join(','), make(o));
