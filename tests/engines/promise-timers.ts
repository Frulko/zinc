function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => { setTimeout(resolve, ms); });
}
for (let i = 0; i < 1000; i++) {
  const cancelled = setTimeout(() => { console.log('unexpected'); }, 1000);
  clearTimeout(cancelled);
}
const ready = new Promise<number>(resolve => {
  let ticks = 0;
  let timer: i32 = 0;
  timer = setInterval(() => {
    ticks++;
    console.log('tick', ticks);
    queueMicrotask(() => { console.log('tick job', ticks); });
    if (ticks === 2) { clearInterval(timer); resolve(ticks); }
  }, 1);
});
async function main(): Promise<void> {
  console.log('start');
  const ticks = await ready;
  await sleep(1);
  console.log('done', ticks);
  const overlap = new Promise<number>(resolve => {
    let calls = 0, finished = 0, sum = 0;
    let timer: i32 = 0;
    timer = setInterval(async () => {
      const index = ++calls;
      if (calls === 3) clearInterval(timer);
      await sleep(2);
      sum += index;
      if (++finished === 3) resolve(sum);
    }, 1);
  });
  console.log('overlap', await overlap);
}
main().then(() => { console.log('then'); });
console.log('sync');
