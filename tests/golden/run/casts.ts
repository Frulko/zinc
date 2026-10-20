// Type assertions: numeric conversions, downcasts, object literals as a record.
class Animal { constructor(public name: string) {} }
class Dog extends Animal { bark(): string { return this.name + '!'; } }
interface Point { x: number; y: number; }
const a: Animal = new Dog('rex');
console.log((a as Dog).bark());
const n: number = 8;
console.log((n as i32) + 1, ({ x: 1, y: 2 } as Point).y);
const xs = [1, 2, 3] as i32[];
console.log(xs.length, 'abc' as string);
