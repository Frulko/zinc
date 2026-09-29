function unused(first: i32, second: i32): i32 { return second; }
function fib(n: i32): i32 { return n < 2 ? n : fib(n - 1) + fib(n - 2); }
let total: i32 = 3;
console.log(total);
total = 9;
const after: i32 = total + 1;
console.log(after);
function loop(): i32 {
  let a: i32 = 1, b: i32 = 2;
  for (let i: i32 = 0; i < 5; i++) { const old: i32 = a; a = b; b = old; }
  return a * 10 + b;
}
console.log(unused(100, 7), loop(), fib(12));
function arithmetic(a: i32, b: i32): i32 { return a * b + 1; }
console.log(arithmetic(2147483647, 2));
function float(a: number): number { return Math.sqrt(a) + 0.5; }
console.log(float(4), true, 'scalar');

console.log(0.1, 1e-7, 1e20);
let sum: i32 = 0;
for (let row: i32 = 0; row < 4; row++) for (let col: i32 = 0; col < 5; col++) if (row < 3 && col > 1) sum += row + col;
console.log(sum);
function comparisons(n: number): void { console.log(n < 0, n <= 0, n > 0, n >= 0, n === n, n !== n); }
comparisons(0 / 0);
comparisons(-0.5);
comparisons(0.5);
function unsignedCompare(n: u32): void { console.log(n > 1, n < 1, n >>> 1); }
unsignedCompare(4294967295);
function fraction(n: f32): f32 { return n + 0.1; }
console.log(fraction(0.2));
