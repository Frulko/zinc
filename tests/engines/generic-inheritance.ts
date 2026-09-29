class Base<T> {
  constructor(public value: T) {}
  get(): T { return this.value; }
}
class Derived<T> extends Base<T> {
  constructor(value: T, public count: i32) { super(value); }
}
class Mid<U> extends Base<U[]> {
  constructor(values: U[]) { super(values); }
  first(): U { return this.value[0]; }
}
class Numbers extends Mid<i32> {
  constructor() { super([7, 8]); }
}
class Text extends Base<string> {}
const a = new Derived<i32>(12, 3);
const b = new Derived<string>('hello', 4);
const c = new Numbers();
const d = new Text('world');
console.log(a.get(), a.count, b.get(), b.count, c.first(), c.get().join(), d.get());
const base: Base<i32> = a; base.value = 31; console.log(a.get());
