const existing = Promise.resolve(3);
console.log('identity', Promise.resolve(existing) === existing);
async function adopted(): Promise<number> { return existing; }
async function rejected(): Promise<number> { return Promise.reject<number>(new Error('adopted error')); }
async function check(): Promise<void> {
  console.log('map', await existing.then(value => value + 2));
  console.log('map async', await existing.then(async value => { await Promise.resolve(); return value + 4; }));
  console.log('adopt', await adopted());
  console.log('catch', await rejected().catch(error => { console.log('reason', error.message); return 9; }));
  console.log('catch async', await Promise.reject<number>(new Error('x')).catch(async () => { await Promise.resolve(); return 11; }));
  console.log('finally value', await existing.finally(() => { console.log('cleanup'); }));
  console.log('finally async', await existing.finally(async () => { await Promise.resolve(); console.log('async cleanup'); }));
  try { await rejected().finally(() => { console.log('rejected cleanup'); }); } catch (error) { console.log('retained', error.message); }
  try { await existing.finally(() => { throw new Error('cleanup failed'); }); } catch (error) { console.log('overridden', error.message); }
  try { await existing.finally(async () => { throw new Error('async cleanup failed'); }); } catch (error) { console.log('overridden async', error.message); }
  let cycle = Promise.resolve(0);
  cycle = existing.then(() => cycle);
  try { await cycle; } catch (error) { console.log('cycle', error.name); }
  let total = 0;
  for (let i = 0; i < 300; i++) total += await Promise.reject<number>(new Error('recover')).catch(() => i).finally(() => {});
  console.log('collected', total);
}
check();
