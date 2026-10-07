// generators: next() results, yield*, generator methods, spread, Array.from, iterators of Map/Set/Array, [Symbol.iterator]
function* nums(n: number): Generator<number> { for (let i = 0; i < n; i++) yield i }
const it = nums(3)
const r1 = it.next()
console.log(r1.value, r1.done)
it.next(); it.next()
console.log(it.next().done)

function* inner(): Generator<number> { yield 1; yield 2 }
function* outer(): Generator<number> { yield 0; yield* inner(); yield 3 }
for (const v of outer()) console.log('outer', v)

class Bag {
  items: number[] = [1, 2, 3];
  *each(): Generator<number> { for (const x of this.items) yield x * 2 }
}
for (const v of new Bag().each()) console.log('each', v)

class Range {
  lo: number; hi: number
  constructor(lo: number, hi: number) { this.lo = lo; this.hi = hi }
  [Symbol.iterator](): Generator<number> { return this.gen() }
  *gen(): Generator<number> { for (let i = this.lo; i < this.hi; i++) yield i }
}
for (const v of new Range(1, 4)) console.log('range', v)
console.log([...new Range(5, 7).gen()].length)

const xs = [...nums(3)]
console.log(xs.length, xs[2], Array.from(nums(4)).length)
console.log([...'ab'].length, Array.from([1, 2, 3], (x) => x * 2)[2], Array.from({ length: 3 }, (_, i) => i * 10)[2])

const m = new Map<string, number>()
m.set('a', 1); m.set('b', 2)
for (const [k, v] of m.entries()) console.log(k, v)
for (const k of m.keys()) console.log('key', k)
for (const v of m.values()) console.log('val', v)
const s = new Set<number>(); s.add(5); s.add(6)
for (const v of s.values()) console.log('set', v)
console.log([...s].length, Array.from(s).length, [...m].length)
const arr = [7, 8]
for (const [i, v] of arr.entries()) console.log(i, v)
for (const k of arr.keys()) console.log('k', k)
