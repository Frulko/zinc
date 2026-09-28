// zinc-test: deterministic
// Deterministic mode (zinc test runs every program with it): Date.now, performance.now and timers read a virtual clock.
// Without a frame loop the clock jumps from timer to timer; timers fire in (due time, creation) order, each followed by
// its microtasks.
const t0 = Date.now();
function log(s: string): void { console.log(`${Date.now() - t0} ${s}`); }
setTimeout(() => { log('b (20)'); }, 20);
setTimeout(() => { log('a (10)'); }, 10);
setTimeout(() => { log('c (20, created after b)'); }, 20);
let n: i32 = 0;
let id: i32 = 0;
id = setInterval(() => {
  n++;
  log(`tick ${n}`);
  Promise.resolve(n).then((v: i32) => { log(`microtask after tick ${v}`); });
  if (n === 3) {
    clearInterval(id);
    setTimeout(() => { log('zero delay after tick 3'); }, 0);
  }
}, 7);
setTimeout(() => { log(`performance.now ${performance.now() - t0}`); }, 1000);
log('start');
