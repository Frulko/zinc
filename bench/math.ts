// The cost of Math.sin, cos, tan, exp, log, pow and atan2 (ZN-703: V8's fdlibm and CORE-MATH's pow instead of the platform libm).
// 2,000,000 calls of each on varied arguments; prints ns per call and a checksum (the same on every engine and CPU).
// zinc run bench/math.ts --native | --interp | --engine quickjs, on a quiet machine.
const N = 2000000;
const xs: number[] = [];
for (let i = 0; i < 1024; i++) xs.push((i - 512) * 0.0371 + 0.001);
function report(name: string, t0: number, sum: number): void {
  console.log(name + ' ' + Math.round((Date.now() - t0) * 1e6 / N) + ' ns/call, sum ' + sum);
}
let t = Date.now();
let s = 0;
for (let i = 0; i < N; i++) s += Math.sin(xs[i & 1023] * 3);
report('sin', t, s);
t = Date.now(); s = 0;
for (let i = 0; i < N; i++) s += Math.cos(xs[i & 1023] * 3);
report('cos', t, s);
t = Date.now(); s = 0;
for (let i = 0; i < N; i++) s += Math.tan(xs[i & 1023]);
report('tan', t, s);
t = Date.now(); s = 0;
for (let i = 0; i < N; i++) s += Math.exp(xs[i & 1023]);
report('exp', t, s);
t = Date.now(); s = 0;
for (let i = 0; i < N; i++) s += Math.log(Math.abs(xs[i & 1023]) + 0.5);
report('log', t, s);
t = Date.now(); s = 0;
for (let i = 0; i < N; i++) s += Math.pow(Math.abs(xs[i & 1023]) + 0.5, xs[(i + 7) & 1023]);
report('pow', t, s);
t = Date.now(); s = 0;
for (let i = 0; i < N; i++) s += Math.atan2(xs[i & 1023], xs[(i + 7) & 1023]);
report('atan2', t, s);
