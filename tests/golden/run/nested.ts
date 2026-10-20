function isPrime(n: i32): boolean {
  if (n < 2) return false;
  for (let d: i32 = 2; d * d <= n; d++) {
    if (n % d === 0) return false;
  }
  return true;
}
let count: i32 = 0;
let last: i32 = 0;
for (let n: i32 = 0; n < 2000; n++) {
  if (isPrime(n)) {
    count++;
    last = n;
  }
}
console.log(count, last);
let tri: i32 = 0;
for (let i: i32 = 0; i < 50; i++) {
  for (let j: i32 = 0; j <= i; j++) {
    if ((i + j) % 7 === 0) continue;
    tri += j;
  }
}
console.log(tri);
