function gcd(a: i32, b: i32): i32 {
  if (b === 0) return a;
  return gcd(b, a % b);
}
function fact(n: i32): f64 {
  return n <= 1 ? 1 : n * fact(n - 1);
}
console.log(gcd(48, 18), fact(10));
