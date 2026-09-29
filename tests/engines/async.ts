async function twice(value: number): Promise<number> {
  console.log('start', value);
  const a = await Promise.resolve(value);
  const b = await Promise.resolve(a);
  return b * 2;
}
async function fail(): Promise<number> {
  await Promise.resolve();
  throw new Error('async failure');
}
async function main(): Promise<void> {
  const first = twice(3);
  const second = twice(4);
  console.log('results', await first, await second);
  try { await fail(); } catch (error) { console.log('caught', error.message); }
  let sum = 0;
  const retained = { text: 'alive', amount: 5 };
  const add = async (n: number): Promise<number> => {
    const text = await Promise.resolve('step:' + n);
    return n + retained.amount + (text === 'step:' + n ? 1 : 0);
  };
  for (let i = 0; i < 3000; i++) sum += await add(i);
  console.log('collected', retained.text, sum);
}
async function observe(promise: Promise<number>, label: string): Promise<void> {
  console.log(label, await promise);
}
main();
const shared = twice(5);
observe(shared, 'first observer');
observe(shared, 'second observer');
console.log('sync');
