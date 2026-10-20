class P {
  constructor(public x: i32, public y: i32) {}
}
function minmax(a: i32, b: i32): [i32, i32] {
  return a < b ? [a, b] : [b, a];
}
function dist([ax, ay]: [i32, i32], { x, y }: P): i32 {
  return ax + ay + x + y;
}
const t: [i32, f64] = [1, 2.5];
const [a, b] = t;
const [lo, hi] = minmax(5, 3);
let x: i32 = 1;
let y: i32 = 2;
[x, y] = [y, x];
const { x: px, y: py } = new P(7, 8);
const [[n1, n2], n3] = [[1, 2], 3];
t[0] = 9;
console.log(a, b, lo, hi, x, y, px, py, dist([1, 2], new P(3, 4)), t[0], t[1], n1, n2, n3);
let i: i32 = 0;
let j: i32 = 10;
for (let k: i32 = 0; k < 4; k++) {
  [i, j] = [j - k, i + k];
}
console.log(i, j);
