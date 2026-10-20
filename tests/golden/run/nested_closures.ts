// nested function declarations that use the variables around them are closures (cells for the shared ones)
function outer(n: i32): i32 {
  let total = 0;
  function add(k: i32): void { total += k; helper(k); }
  function helper(k: i32): void { if (k > 0) total += 1; }
  for (let i = 0; i < n; i++) add(i);
  const f = add;
  f(10);
  return total;
}
console.log(outer(4));
function fact(n: i32): i32 {
  function go(k: i32): i32 { return k <= 1 ? 1 : k * go(k - 1) * (n - n + 1); }
  return go(n);
}
console.log(fact(5));
