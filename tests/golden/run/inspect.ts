// console.log of arrays, objects, class instances, Map, Set, tuples and null, in Node's util.inspect format.
class Animal {
  constructor(public name: string, protected legs: i32) {}
}
class Dog extends Animal {
  tricks: string[] = [];
  constructor(name: string) {
    super(name, 4);
  }
}
class Empty {}
class Node2 {
  constructor(public v: i32, public next: Node2 | null) {}
}
interface Point { x: number; y: number; }

const none: i32[] = [];
console.log([1, 2, 3], none, ['a', 'b'], [true, false], [1.5, -0, 2e21]);
const deep: number[][][][] = [[[[1]]], [[[2, 3]], [[4]]]];
console.log([[1, 2], [3]], deep);
const nums: i32[] = [];
for (let i: i32 = 0; i < 30; i++) nums.push(i * i);
console.log(nums);
const many: i32[] = [];
for (let i: i32 = 0; i < 120; i++) many.push(i);
console.log(many);
const words: string[] = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa'];
console.log(words);
console.log(['it\'s', 'say "hi"', 'both \' and "', 'line\nbreak', 'tab\t', 'back\\slash']);
const d = new Dog('rex');
d.tricks.push('sit');
console.log(d, new Empty(), [new Empty()]);
const list = new Node2(1, new Node2(2, new Node2(3, new Node2(4, null))));
console.log(list);
console.log(null === list.next, list.next);
const p: Point = { x: 1, y: 2 };
console.log(p, { x: 1.5, y: -2 }, [p, p]);
console.log({ a: 1, b: { c: { d: { e: 1 } } } });
const m = new Map<string, i32>();
m.set('a', 1);
m.set('b', 2);
console.log(m, new Map<i32, i32>());
const s = new Set<number>();
for (const v of [3, 1, 3, 2]) s.add(v);
console.log(s, new Set<string>());
const big = new Map<string, Point>();
big.set('first', { x: 1, y: 2 });
big.set('second', { x: 3, y: 4 });
console.log(big);
const t: [i32, string] = [1, 'x'];
console.log(t, [t, t]);
const animals: Animal[] = [new Animal('cat', 4), d];
console.log(animals);
const wide = { alpha: 'aaaaaaaaaaaaaaaa', beta: 'bbbbbbbbbbbbbbbb', gamma: 'cccccccccccccccc', delta: 'dddddddddddddddd' };
console.log(wide);
console.log([wide, wide]);
console.log('mixed', [1, 2], { k: 'v' }, 5, 'str');
