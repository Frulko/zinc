async function tick(): Promise<void> {
  for (let i = 0; i < 8; i++) { await Promise.resolve(); console.log('tick', i); }
}
async function adopted(): Promise<number> { return Promise.resolve(12); }
async function main(): Promise<void> {
  tick();
  Promise.resolve(1).then(value => { console.log('then', value); return Promise.resolve(value + 1); }).then(value => { console.log('adoption', value); });
  Promise.resolve(3).finally(() => { console.log('finally'); }).then(value => { console.log('finally result', value); });
  Promise.reject<number>(new Error('recover')).catch(error => { console.log('catch', error.message); return 4; }).then(value => { console.log('catch result', value); });
  adopted().then(value => { console.log('async adoption', value); });
  Promise.resolve().then(() => { console.log('void then'); }).finally(() => { console.log('void finally'); });
  try { await Promise.resolve(5).then(() => { throw new Error('then throws'); }); } catch (error) { console.log('then rejection', error.message); }
  try { await Promise.reject<number>(new Error('before')).catch(() => { throw new Error('catch throws'); }); } catch (error) { console.log('catch rejection', error.message); }
}
main();
