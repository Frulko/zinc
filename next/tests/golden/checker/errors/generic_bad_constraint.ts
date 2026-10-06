interface Foo { f(): i32; }
class A<T extends Foo> { x: i32 = 1; }
const a = new A<i32>();
