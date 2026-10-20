class A { protected x: i32 = 1; }
class B extends A { get1(): i32 { return this.x; } }
const b = new B();
console.log(b.get1(), b.x);
