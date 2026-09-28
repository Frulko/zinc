// spectral-norm: Benchmarks Game kernel, n=1000, power iteration on
// A^T*A where A(i,j) = 1 / ((i+j)(i+j+1)/2 + i+1).
const N: i32 = 1000;

function A(i: i32, j: i32): number {
  const ij: i32 = i + j;
  return 1.0 / (ij * (ij + 1) / 2 + i + 1);
}

function timesA(x: number[], out: number[]): void {
  for (let i: i32 = 0; i < N; i++) {
    let sum: number = 0;
    for (let j: i32 = 0; j < N; j++) sum += A(i, j) * x[j];
    out[i] = sum;
  }
}

function timesAt(x: number[], out: number[]): void {
  for (let i: i32 = 0; i < N; i++) {
    let sum: number = 0;
    for (let j: i32 = 0; j < N; j++) sum += A(j, i) * x[j];
    out[i] = sum;
  }
}

function timesAtA(x: number[], out: number[]): void {
  const tmp: number[] = [];
  for (let i: i32 = 0; i < N; i++) tmp.push(0);
  timesA(x, tmp);
  timesAt(tmp, out);
}

let u: number[] = [];
let v: number[] = [];
for (let i: i32 = 0; i < N; i++) { u.push(1); v.push(0); }

for (let iter: i32 = 0; iter < 10; iter++) {
  timesAtA(u, v);
  timesAtA(v, u);
}

let vBv: number = 0;
let vv: number = 0;
for (let i: i32 = 0; i < N; i++) { vBv += u[i] * v[i]; vv += v[i] * v[i]; }

console.log(Math.sqrt(vBv / vv).toFixed(9));
