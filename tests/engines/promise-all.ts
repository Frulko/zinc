function delayed(value: number, ms: number): Promise<number> {
  return new Promise<number>(resolve => { setTimeout(() => { resolve(value); }, ms); });
}
async function main(): Promise<void> {
  const empty: Promise<number>[] = [];
  console.log('empty', (await Promise.all(empty)).length);
  const all = await Promise.all([delayed(10, 5), delayed(20, 1), Promise.resolve(30)]);
  console.log('all', all[0], all[1], all[2]);
  try { await Promise.all([Promise.resolve(1), Promise.reject<number>(new Error('all failed'))]); }
  catch (error) { console.log('caught', error.message); }
  let sum = 0;
  for (let i = 0; i < 500; i++) {
    const pair = await Promise.all([Promise.resolve(i), Promise.resolve(i + 1)]);
    sum += pair[0] + pair[1];
  }
  console.log('collected', sum);
}
main();
console.log('sync');
