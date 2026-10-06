// async functions, await in loops and try/catch, break/continue, then/catch, microtask order, Promise.all
function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => { setTimeout(resolve, ms); });
}
async function delayed(x: i32, ms: number): Promise<i32> {
  await sleep(ms);
  return x;
}
async function fails(msg: string): Promise<i32> {
  await sleep(1);
  throw new Error(msg);
}
async function loops(): Promise<void> {
  let sum = 0;
  for (let i = 0; i < 6; i++) {
    if (i === 1) continue;
    if (i === 5) break;
    sum += await delayed(i, 1);
  }
  console.log('for', sum);
  let n = 0;
  while (n < 3) {
    n++;
    await sleep(1);
  }
  console.log('while', n);
  const names = ['a', 'b', 'c'];
  let joined = '';
  for (const s of names) {
    await sleep(1);
    joined += s;
  }
  console.log('for-of', joined);
}
async function errors(): Promise<void> {
  try {
    await fails('first');
    console.log('not reached');
  } catch (e) {
    console.log('caught', e.message);
  }
  try {
    const v = await delayed(1, 1);
    if (v === 1) throw new Error('after await');
  } catch (e) {
    console.log('caught', e.message);
  }
  let r = 0;
  for (let i = 0; i < 3; i++) {
    try {
      r += await delayed(i, 1);
      if (i === 1) throw new Error('loop ' + i);
    } catch (e) {
      console.log(e.message);
    }
  }
  console.log('r', r);
}
async function branches(flag: boolean): Promise<string> {
  if (flag) {
    await sleep(2);
    return 'yes';
  } else {
    const v = await delayed(7, 1);
    return 'no' + v;
  }
}
async function rejected(): Promise<void> {
  await fails('propagates');
}
console.log('start');
loops().then(() => { console.log('loops done'); });
errors().then(() => { console.log('errors done'); });
branches(true).then(s => { console.log(s); });
branches(false).then(s => { console.log(s); });
rejected().catch(e => { console.log('rejected', e.message); });
Promise.all([delayed(3, 4), delayed(1, 2), delayed(2, 3)]).then(v => { console.log('all', v); });
Promise.resolve(1).then(v => v + 1).then(v => { console.log('chain', v); });
queueMicrotask(() => { console.log('microtask'); });
setTimeout(() => { console.log('timeout 0'); }, 0);
console.log('end');
