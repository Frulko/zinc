interface I<T> { f(): T; }
class A implements I<string> { f(): i32 { return 1; } }
