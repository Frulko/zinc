// A program that sleeps 10 s three times (ZN-293): under a virtual clock it prints the same lines at once.
let n = 0;
const t0 = Date.now();
function step(): void {
  n++;
  console.log('tick', n, Math.round((Date.now() - t0) / 1000));
  if (n < 3) setTimeout(step, 10000);
}
setTimeout(step, 10000);
