const pending = new Promise<number>((resolve, reject) => {
  console.log('executor');
  queueMicrotask(() => { resolve(21); resolve(99); reject(new Error('ignored')); });
});
pending.then(value => { console.log('first', value); });
pending.then(value => { console.log('second', value); });
Promise.resolve(7).then(value => { console.log('resolved', value); });
queueMicrotask(() => { console.log('queued'); });
async function check(): Promise<void> {
  console.log('awaited', await pending);
  const thrown = new Promise<void>(() => { throw new Error('executor failure'); });
  try { await thrown; } catch (error) { console.log('caught', error.message); }
  const chained = pending.then(() => { throw new Error('handler failure'); });
  try { await chained; } catch (error) { console.log('chain', error.message); }
  let total = 0;
  for (let i = 0; i < 1000; i++) {
    const value = await new Promise<number>(resolve => { queueMicrotask(() => { resolve(i); }); });
    total += value;
  }
  console.log('collected', total);
}
check();
console.log('sync');
