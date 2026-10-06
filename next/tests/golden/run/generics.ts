function identity<T>(x: T): T {
  return x;
}
function pick<T>(c: boolean, a: T, b: T): T {
  return c ? a : b;
}
class Box<T> {
  v: T;
  constructor(v: T) {
    this.v = v;
  }
  get(): T {
    return this.v;
  }
  set(v: T): void {
    this.v = v;
  }
}
class Pair<A, B> {
  constructor(public first: A, public second: B) {}
  swap(): Pair<B, A> {
    return new Pair<B, A>(this.second, this.first);
  }
}
interface Getter<T> {
  get(): T;
}
class IntBox extends Box<i32> {
  twice(): i32 {
    return this.get() * 2;
  }
}
const b = new Box<i32>(7);
b.set(b.get() + 1);
const p = new Pair<i32, f64>(1, 2.5);
const q = p.swap();
console.log(identity(5), pick(true, 1, 2), b.get(), p.first, q.first, q.second);
const ib = new IntBox(21);
console.log(ib.twice());
const g: Getter<i32> = ib;
console.log(g.get());
const b2 = new Box(3.5);
console.log(b2.get());
