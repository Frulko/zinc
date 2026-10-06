class A { v: i32 = 1; }
function f(x: A | null): i32 { return x.v; }
