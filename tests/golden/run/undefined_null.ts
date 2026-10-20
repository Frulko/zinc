// undefined and null print as JavaScript prints them: optional fields and parameters, Map.get, find, optional chaining, templates, typeof, JSON
interface O { a?: number; b: number | null; c?: string }
function f(x?: number): number | undefined { return x }
function g(s: string | null): string | null { return s }
const m = new Map<string, number>()
m.set('k', 1)
const ms = new Map<string, string>()
const o: O = { b: null }
const arr = [1, 2, 3]
class P { next: P | null = null; name: string = 'p' }

console.log(f(), f(2), typeof f(), typeof f(3))
console.log(g(null), typeof g(null), typeof g('x'))
console.log(m.get('zz'), m.get('k'), ms.get('zz'), typeof m.get('zz'), typeof m.get('k'))
console.log(`${m.get('zz')}|${m.get('k')}|${o.a}|${o.b}|${f()}|${g(null)}`)
console.log(o.a, o.b, o.c, JSON.stringify(o), JSON.stringify({ a: o.a, b: o.b }))
console.log(arr.find((x) => x > 5), arr.find((x) => x > 1), arr.at(9))
const p = new P()
console.log(p.next?.name, p.next, typeof p.next?.name)
let v: string | undefined
let w: number | null = null
console.log(v, w, undefined, null)
console.log(String(null), String(undefined), `${undefined} ${null}`)
console.log(m.get('zz') === undefined, o.a === undefined, o.b === null, o.a == null)
