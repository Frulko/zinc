function identity<T>(value: T): T { return value; }
function first<T>(values: T[]): T { return values[0]; }
function forward<T>(value: T): T { return identity(value); }
function recursive<T>(value: T, depth: i32): T { return depth > 0 ? recursive(value, depth - 1) : value; }
function unused<T>(value: T): T { return value; }
class Box<T> {
  value: T;
  constructor(value: T) { this.value = value; }
  get(): T { return this.value; }
  set(value: T): void { this.value = value; }
}
const numberBox = new Box<i32>(42);
const textBox = new Box<string>('text');
console.log('identity', identity<i32>(7), identity('hello'), identity(true));
console.log('arrays', first<i32>([4, 5]), first<string>(['a', 'b']));
console.log('nested', forward<i32>(9), recursive<string>('kept', 5));
console.log('boxes', numberBox.get(), textBox.get());
numberBox.set(84); textBox.set('changed');
console.log('updated', numberBox.get(), textBox.get());
function makeGetter<T>(value: T): () => T { return () => value; }
console.log('closures', makeGetter<i32>(11)(), makeGetter<string>('capture')());
console.log('module', forwarded<i32>(23), forwarded<string>('module'));
class Payload { constructor(public text: string) {} }
const referenceBox = new Box<Payload>(new Payload('rooted'));
for (let i: i32 = 0; i < 2000; i++) { const temporary = new Box<Payload>(new Payload('temporary')); }
console.log('references', referenceBox.get().text, identity(referenceBox) === referenceBox);
import { forwarded } from './generics/helper';
