// await in expression positions: arguments, templates, operands, conditions, for-of heads, short-circuit, literals; the order of effects is Node's
let log = ''
function note(s: string): string { log += s + ' '; return s }
function wait(n: number): Promise<number> { return new Promise<number>((r) => { setTimeout(() => { r(n) }, 1) }) }
function waitS(s: string): Promise<string> { return new Promise<string>((r) => { setTimeout(() => { r(s) }, 1) }) }
function add(a: number, b: number): number { return a + b }
async function count(n: i32): Promise<i32> { return n }
function three(a: string, b: string, c: string): string { return a + b + c }
class Acc { total: number = 0; push(v: number): number { this.total += v; return this.total } }

async function main(): Promise<void> {
  console.log(add(await wait(1), await wait(2)))
  console.log(three(note('a'), await waitS('b'), note('c')), log)
  console.log(`t=${await wait(3)} u=${await waitS('x')}`)
  if ((await wait(4)) > 3) console.log('big')
  let i = 0
  while ((await wait(i)) < 3) i++
  console.log('i', i)
  for (let k = 0; (await wait(k)) < 2; k++) console.log('k', k)
  const o = { a: await wait(5), b: 6, c: [await wait(7), 8] }
  console.log(o.a + o.b + o.c[0] + o.c[1])
  const x = (await wait(1)) + (await wait(2)) * 2
  console.log(x)
  log = ''
  const t = note('L') === 'L' && (await waitS('R')) === 'R'
  const f = note('F') === 'X' && (await waitS('never')) === 'never'
  const g = note('G') === 'G' || (await waitS('never2')) === 'never2'
  console.log(t, f, g, log)
  for (const v of [await wait(8), await wait(9)]) console.log('v', v)
  for (const w of await Promise.resolve([1, 2])) console.log('w', w)
  const acc = new Acc()
  console.log(acc.push(await wait(10)), acc.push(await wait(5)), acc.total)
  const nested = add(await wait(1), add(await wait(2), await wait(3)))
  console.log(nested)
  let m = 0
  m = add(m, await wait(4))
  console.log(m)
  if (add(1, await wait(1)) === 2) console.log('two'); else console.log('not two')
  console.log(await wait(1) + 1, -(await wait(2)), (await waitS('q')).length)
  log = ''
  const yes = note('C') === 'C' ? await waitS('A') : note('B')
  const no = note('D') === 'X' ? await waitS('never3') : note('E')
  const both = (await wait(1)) > 0 ? await waitS('first') : await waitS('second')
  const same = no === 'E' ? acc : await Promise.resolve(new Acc())
  const n1: i32 = (await wait(1)) > 0 ? await count(2) : 0
  const n2 = no === 'X' ? 5 : await count(3)
  console.log(n1, n2, yes, no, both, same === acc, log, `${no === 'E' ? await waitS('in a template') : ''}`)
}
main()
