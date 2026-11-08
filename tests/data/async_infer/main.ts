// ZN-1010: async and generic inference gaps; every engine prints what Node prints (expected.out).
const one = async () => 1;
const add = async (x: i32) => { const y = await one(); return x + y; };
const store = { async load(n: i32) { return 'n' + n; } };
const quiet = async () => { console.log('quiet ran'); };

async function list(): Promise<i32[]> { return [1, 2]; }
async function pick(c: boolean, d: boolean): Promise<i32> {
  const r = c ? await list() : d ? await list() : [];
  return r.length;
}
async function pairs(): Promise<void> {
  const xs: [string, i32][] = [['a', 1], ['b', 2]];
  for (const [k, v] of xs) { await one(); console.log(k, v); }
}

function untrack<T>(fn: () => T): T { return fn(); }
function id<T>(x: T) { return x; }

async function tick(): Promise<void> { console.log('tick'); }
async function cleanup(): Promise<i32> {
  try { return await Promise.resolve(7); }
  finally { console.log('finally ran'); }
}
async function twoTicks(): Promise<void> { await tick(); await tick(); console.log('two ticks done'); }
async function forward(): Promise<void> { return twoTicks(); }

console.log(await one());
console.log(await add(41));
console.log(await store.load(3));
await quiet();
const parts: Promise<string>[] = [1, 2].map(async (k) => 'k' + k);
console.log((await Promise.all(parts)).join(','));
console.log(await pick(false, false), await pick(false, true));
await pairs();
const nothing = untrack(() => { console.log('untracked'); });
const five = untrack(() => 5);
console.log(id([1, 2, 3]).length, id('abc').length, five);
console.log('cleanup', await cleanup());
await forward();
console.log('after forward');
const thrown = new Promise<i32>((resolve, reject) => { throw new Error('boom'); });
await thrown.then((v) => console.log('ok', v)).catch((e: Error) => console.log('rejected', e.message));
const settled = new Promise<i32>((resolve, reject) => { resolve(3); throw new Error('ignored'); });
console.log('settled', await settled);
export {};   // a module: top-level await is allowed
