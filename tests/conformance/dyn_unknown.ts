// Dyn in every profile: an `unknown` value is only compared, passed on, or narrowed before use
// (DYN-01 in the strict profile, DYN-08: after typeof/instanceof the value is static).
class Box {
  constructor(public w: number) {}
}
function kind(u: unknown): string {
  if (typeof u === 'number') return `number ${u * 2}`;
  if (typeof u === 'string') return `string ${u.length}`;
  if (typeof u === 'boolean') return u ? 'yes' : 'no';
  if (u instanceof Box) return `box ${u.w}`;
  if (u === null) return 'null';
  if (u === undefined) return 'undefined';
  return typeof u;
}
function asNum(u: unknown): number {
  return u as number;  // checked conversion (DYN-07)
}

const values: unknown[] = [1.5, 'hello', true, new Box(3), null, undefined];
for (const v of values) console.log(kind(v));
console.log(values.length, values.indexOf('hello'), values[0] === 1.5, values[4] === null, values[5] === null);

let slot: unknown = 7;
slot = 'now a string';
if (typeof slot === 'string') console.log(slot.toUpperCase());
console.log(asNum(2.5) * 2, typeof 1, typeof 'a', typeof values, typeof kind);
console.log(asNum('text') + 1);
