class A { }
class D extends A { b(): i32 { return 1; } }
function f(a: A): i32 { if (a instanceof D) { return a.b(); } else { return a.b(); } }
