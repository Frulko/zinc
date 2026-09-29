// Native Zinc currently rejects finally in async functions and await on scalars.
async function fail(): Promise<number> {
  try { await Promise.reject(new Error('rejected')); }
  finally { console.log('inner finally'); }
  return 0;
}
async function main(): Promise<void> {
  try { await fail(); }
  catch (error) { console.log('caught', error.message); }
  finally { console.log('outer finally', await 7); }
  let total = 0;
  for (let i = 0; i < 1000; i++) {
    try { await Promise.reject(new Error('x' + i)); }
    catch (error) { total += error.message === 'x' + i ? 1 : 0; }
  }
  console.log('rejections', total);
}
main();
console.log('sync');
