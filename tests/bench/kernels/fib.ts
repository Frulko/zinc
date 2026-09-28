// fib: naive recursive Fibonacci, n=32. Pure integer recursion, no allocation.
function fib(n: i32): i32 {
  if (n < 2) return n;
  return fib(n - 1) + fib(n - 2);
}

const result: i32 = fib(32);
console.log(result);
