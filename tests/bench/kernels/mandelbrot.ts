// mandelbrot: 400x400 grid over [-2,1] x [-1.5,1.5], checksum = sum of
// per-pixel escape iteration counts (maxIter capped at 200, tuned down
// from the canonical 1e6-per-pixel budget so interpreted engines finish
// quickly; see docs/reports/PERF.md).
const W: i32 = 400;
const H: i32 = 400;
const MAX_ITER: i32 = 200;

let checksum: number = 0;
for (let py: i32 = 0; py < H; py++) {
  const y0: number = (py / H) * 3.0 - 1.5;
  for (let px: i32 = 0; px < W; px++) {
    const x0: number = (px / W) * 3.0 - 2.0;
    let x: number = 0;
    let y: number = 0;
    let iter: i32 = 0;
    while (x * x + y * y <= 4 && iter < MAX_ITER) {
      const xt: number = x * x - y * y + x0;
      y = 2 * x * y + y0;
      x = xt;
      iter++;
    }
    checksum += iter;
  }
}
console.log(checksum);
