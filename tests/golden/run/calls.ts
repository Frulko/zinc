function add3(a: i32, b: i32, c: i32): i32 { return a + b * 10 + c * 100; }
function rot(a: i32, b: i32, c: i32): i32 { return add3(b, c, a); }
function swapcall(a: i32, b: i32): i32 { return add3(b, a, 0); }
function even(n: i32): boolean { if (n === 0) return true; return odd(n - 1); }
function odd(n: i32): boolean { if (n === 0) return false; return even(n - 1); }
function keep(a: i32, b: i32): i32 {
  const x: i32 = add3(a, b, 1);
  const y: i32 = add3(x, a, b);
  return x * 1000 + y + a + b;
}
function chain(n: i32): i32 {
  if (n <= 0) return 0;
  return n + chain(n - 1) + chain(n - 2) % 3;
}
console.log(rot(1, 2, 3), swapcall(4, 5), even(10), odd(7), keep(2, 3), chain(12));
