const a: i32 = 12345;
const b: i32 = -678;
const big: i32 = 2000000000;
console.log(a & b, a | b, a ^ b, a << 3, a >> 2, b >> 1, ~a, (big + big) | 0, b % 7, a % -50);
console.log(a >>> 1, b >>> 1, b >>> 28);
