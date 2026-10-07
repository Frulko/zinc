// try/finally across await and yield: finally after await, return in try and catch, throw in finally, nested try, break/continue through finally; the output is Node's
function wait(n: number): Promise<number> { return new Promise<number>((r) => { setTimeout(() => { r(n) }, 1) }) }
async function a(): Promise<void> {
  try { console.log('try'); await wait(1); console.log('after') } finally { console.log('fin1'); await wait(1); console.log('fin1b') }
  console.log('next')
}
async function b(): Promise<number> {
  try { await wait(1); return 5 } finally { console.log('fin2'); await wait(1) }
}
async function c(): Promise<void> {
  try { try { await wait(1); throw new Error('boom') } finally { console.log('inner fin') } } catch (e) { console.log('caught', e.message) } finally { console.log('outer fin') }
}
async function d(): Promise<number> {
  try { await wait(1); throw new Error('x') } catch (e) { console.log('catch d'); return 7 } finally { console.log('fin d') }
}
async function e(): Promise<void> {
  try { await wait(1) } finally { throw new Error('from finally') }
}
async function f(): Promise<void> {
  try { await e() } catch (err) { console.log('f got', err.message) }
}
async function g(): Promise<number> {
  let t = 0
  for (let i = 0; i < 4; i++) {
    try {
      await wait(1)
      if (i === 1) continue
      if (i === 3) break
      t += i
    } finally { console.log('loop fin', i) }
  }
  return t
}
async function h(): Promise<number> {
  try { try { await wait(1); return 1 } finally { console.log('h inner') } } finally { console.log('h outer') }
}
async function main(): Promise<void> {
  await a()
  console.log('b', await b())
  await c()
  console.log('d', await d())
  await f()
  console.log('g', await g())
  console.log('h', await h())
}
main()
function* gen(): Generator<number> {
  try { yield 1; yield 2 } finally { console.log('gen cleanup') }
  yield 3
}
for (const v of gen()) console.log('gen', v)
