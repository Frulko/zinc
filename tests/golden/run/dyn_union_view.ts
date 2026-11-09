// ZN-1077: an object seen as unknown whose field or method result is a union of two classes. It prints, but it is not
// serialisable member by member: its view must not generate a JSON writer that takes the union for its last class.
class A { a: i32 = 1; }
class B { b: string = 'b'; }
class Box {
  v: A | B | null = new A();
  async later(): Promise<A | B | null> { return new B(); }
}
const u: unknown = new Box();
console.log(u);
console.log(typeof u);
