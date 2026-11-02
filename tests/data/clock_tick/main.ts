// ZINC_DETERMINISTIC clock (tests/t0/clock_tick.sh): frozen by default; ZINC_CLOCK_TICK=<ms> moves it at each performance.now() read,
// so a 3 ms time slice ends after a fixed number of reads.
const a = performance.now();
const b = performance.now();
console.log('equal ' + (a === b));
const t0 = performance.now();
let n = 0;
while (n < 100000 && performance.now() - t0 < 3) n++;
console.log('slice reads ' + (n === 100000 ? 'never' : '' + n));
