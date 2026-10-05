let a: i32 = 0;
let b: i32 = 1;
for (let i: i32 = 0; i < 30; i++) {
  const t: i32 = a + b;
  a = b;
  b = t;
}
console.log(a, b);
let x: f64 = 1;
let y: f64 = 2;
let z: f64 = 3;
for (let i: i32 = 0; i < 5; i++) {
  const t: f64 = x;
  x = y;
  y = z;
  z = t + i;
}
console.log(x, y, z);
let s: i32 = 0;
let k: i32 = 0;
while (k < 100) {
  k++;
  if (k % 3 === 0) continue;
  if (k > 50) break;
  s += k;
}
console.log(s, k);
let n: i32 = 27;
let steps: i32 = 0;
do {
  if (n % 2 === 0) n = (n / 2) | 0; else n = 3 * n + 1;
  steps++;
} while (n !== 1);
console.log(steps);
