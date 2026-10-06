class A { v: i32 = 1; }
function f(): i32 {
  let x: A | null = new A();
  for (let i: i32 = 0; i < 3; i++) { const v = x.v; x = null; }
  return 0;
}
