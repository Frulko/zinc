class A { v: i32 = 1; }
function f(x: A | null): i32 {
  if (x !== null) { x = null; return x.v; }
  return 0;
}
