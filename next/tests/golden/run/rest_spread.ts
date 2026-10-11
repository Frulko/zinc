// Rest parameters and spread arguments (ZN-160): functions, methods, constructors, arrows and generic functions with `...rest`;
// spread of arrays into a rest parameter, of tuples into fixed parameters, into Math.max / Math.min and Array.push.
function sum(...xs: number[]): number {
  let t = 0;
  for (const x of xs) t += x;
  return t;
}
console.log(sum(), sum(1), sum(1, 2, 3));

function label(prefix: string, ...parts: string[]): string {
  return prefix + ':' + parts.join('/') + ':' + parts.length;
}
console.log(label('a'), label('b', 'x'), label('c', 'x', 'y', 'z'));

const nums = [4, 5, 6];
console.log(sum(...nums), sum(1, ...nums, 10), sum(...nums, ...nums));

function add3(a: number, b: number, c: number): number { return a * 100 + b * 10 + c; }
const triple: [number, number, number] = [1, 2, 3];
console.log(add3(...triple));
const pair: [number, number] = [7, 8];
console.log(add3(9, ...pair));

class Bag {
  items: string[];
  constructor(...items: string[]) { this.items = items; }
  add(...more: string[]): number { for (const m of more) this.items.push(m); return this.items.length; }
}
const bag = new Bag('a', 'b');
console.log(bag.add('c', 'd'), bag.items.join(','));

const mul = (factor: number, ...xs: number[]): number[] => xs.map((x) => x * factor);
console.log(mul(2, 1, 2, 3).join(','), mul(3).length);

function firstOf<T>(fallback: T, ...xs: T[]): T { return xs.length > 0 ? xs[0] : fallback; }
console.log(firstOf('none'), firstOf('none', 'p', 'q'), firstOf(0, 5, 6));

console.log(Math.max(...nums), Math.min(...nums), Math.max(1, ...nums, 2), Math.min(0, ...[3, -2]));
const empty: number[] = [];
console.log(Math.max(...empty), Math.min(...empty));

const acc: number[] = [1];
console.log(acc.push(...nums), acc.join(','));
acc.push(...acc);
console.log(acc.join(','));
