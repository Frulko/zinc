interface I { f(): i32; }
class A { f(): string { return "x"; } }
const i: I = new A();
