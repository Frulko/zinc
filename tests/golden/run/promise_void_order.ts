// ZN-855: Promise<void> is one class with Promise<T> (generic code with T = void, a spelled-out Promise<void>, async functions
// that return nothing), and then() takes a rejection handler; the settle order is Node's (the .out is Node's output).
function ok<T>(v: T): Promise<T> { return Promise.resolve<T>(v); }
function fail<T>(m: string): Promise<T> { return Promise.reject<T>(new Error(m)); }
function voidOf(): Promise<void> { return fail<void>('generic'); }
async function nothing(tag: string): Promise<void> { console.log('run', tag); }
function now(): Promise<void> { return new Promise(resolve => { const f: () => void = resolve; f(); }); }   // T from the wanted type; resolve as a () => void
class Box<T> {
  items: T[] = [];
  put(v: T): Promise<T> { this.items.push(v); return Promise.resolve<T>(v); }
}

const log: string[] = [];
async function a(): Promise<void> {
  log.push('a0');
  await nothing('a');
  log.push('a1');
  await fail<void>('a').catch((e: Error) => { log.push('a-catch ' + e.message); });
  log.push('a2');
}
async function b(): Promise<void> {
  log.push('b0');
  try { await voidOf(); } catch (e) { log.push('b-caught ' + e.message); }
  log.push('b1');
  await new Promise<void>(resolve => { resolve(); });
  log.push('b2');
}
function c(): void {
  ok<number>(1).then((x: number) => { log.push('c-then ' + x); }, (e: Error) => { log.push('c-never ' + e.message); });
  fail<number>('c').then((x: number) => { log.push('c-never ' + x); }, (e: Error) => { log.push('c-rej ' + e.message); });
  fail<void>('cv').then(() => { log.push('cv-never'); }, (e: Error) => { log.push('cv-rej ' + e.message); });
  nothing('c').then(() => { log.push('c-void-then'); }, (e: Error) => { log.push('c-void-never'); });
  const p: Promise<number> = fail<number>('d').then((x: number) => x + 1, (e: Error) => 42);
  p.then((x: number) => { log.push('d-value ' + x); });
  const q: Promise<number> = ok<number>(5).then((x: number): number => { throw new Error('e' + x); }, (e: Error) => 0);
  q.catch((e: Error) => { log.push('e-rej ' + e.message); return 0; });
  const r: Promise<void> = fail<void>('f').then(() => { }, (e: Error) => { throw new Error('rethrown ' + e.message); });
  r.catch((e: Error) => { log.push('f-rej ' + e.message); });
}
async function d(): Promise<void> {
  const box = new Box<void>();
  await box.put(undefined);
  log.push('box ' + box.items.length);
  const v: Promise<void> = Promise.resolve();
  await v;
  log.push('ok-void');
  await now();
  log.push('now');
  const w = Promise.withResolvers<void>();
  w.promise.then(() => { log.push('resolvers'); });
  w.resolve();
  await w.promise;
  log.push('d-end');
}
a();
b();
c();
d();
Promise.resolve(0).then((x: number) => { log.push('tick1'); }).then(() => { log.push('tick2'); }).then(() => { log.push('tick3'); }).then(() => { log.push('tick4'); });
setTimeout(() => { for (const s of log) console.log(s); }, 0);
