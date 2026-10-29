// An async function that returns a promise without awaiting it settles as that promise does (TypeScript accepts `return p` there)
function later(s: string): Promise<string> { return new Promise<string>((r) => { setTimeout(() => { r(s) }, 1) }) }
async function inner(s: string): Promise<string> { return 'inner ' + (await later(s)) }
async function failing(): Promise<string> { throw new Error('boom') }
async function pass(s: string): Promise<string> {
  if (s === 'x') return inner(s)
  return later(s)
}
async function passFailure(): Promise<string> { return failing() }
async function withFinally(): Promise<string> {
  try { return inner('f') } finally { console.log('finally') }
}
async function main(): Promise<void> {
  console.log(await pass('x'), await pass('y'))
  try { await passFailure(); console.log('not reached') } catch (e) { console.log('caught', (e as Error).message) }
  console.log(await withFinally())
}
main()
