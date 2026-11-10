function assert(ok: boolean): void { if (!ok) throw new Error('clone boundary regression'); }
function refused(value: unknown): void {
  let rejected = false;
  try { structuredClone(value); } catch (error) { rejected = error.name === 'DataCloneError'; }
  assert(rejected);
}
refused(Symbol('root'));
refused({ nested: [Symbol('nested')] });
refused({ nested: [[1, 2][Symbol.iterator]()] });
refused(new Map<number, number>()[Symbol.iterator]());
refused(new Set<number>()[Symbol.iterator]());
refused('text'[Symbol.iterator]());
class Holder { constructor(public nested: symbol) {} }
refused(new Holder(Symbol('field')));
const allowed: any = structuredClone({ number: 1, text: 'ok', list: [2, 3] });
assert(allowed.number === 1 && allowed.text === 'ok' && allowed.list[1] === 3);
const ignored: any = { [Symbol('ignored')]: Symbol('also ignored'), normal: 4 };
const copied: any = structuredClone(ignored);
assert(copied.normal === 4 && Object.getOwnPropertySymbols(copied).length === 0);
console.log('clone boundaries: pass');
