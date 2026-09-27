// LNG-16: async/await, Promise, timers, microtask order, generators
function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => { setTimeout(resolve, ms); });
}
async function double(x: i32): Promise<i32> {
  await sleep(5);
  return x * 2;
}
async function fail(): Promise<i32> {
  await sleep(1);
  throw new Error('boom');
}
async function main(): Promise<void> {
  console.log('main start');
  const a = await double(21);
  console.log('a', a);
  let total: i32 = 0;
  for (let i = 0; i < 3; i++) {
    const v = await double(i);
    total += v;
  }
  console.log('total', total);
  try {
    await fail();
  } catch (e) {
    console.log('caught', e.message);
  }
  const all = await Promise.all([double(1), double(2), double(3)]);
  console.log('all', all);
}
console.log('sync 1');
main().then(() => { console.log('main done'); });
Promise.resolve(7).then(v => { console.log('microtask', v); });
queueMicrotask(() => { console.log('queued'); });
console.log('sync 2');

function* range(n: i32): Generator<i32> {
  for (let i = 0; i < n; i++) yield i * i;
}
const squares: i32[] = [];
for (const s of range(5)) squares.push(s);
console.log('squares', squares);
