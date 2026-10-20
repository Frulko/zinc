class A { }
class B extends A { x: i32 = 1; }
const a: A = new B();
const b: B = a;
