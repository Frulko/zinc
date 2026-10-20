class A { v: i32 = 1; }
function f(x: A | null): i32 {
  if (x === null) { }
  return x.v;
}
