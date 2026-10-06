const a: number[] = [10, 20, 30]
console.log(a.at(0), a.at(-1), a.at(5), a.at(-4))
const w: string[] = ['x', 'y']
console.log(w.at(-1), w.at(2))
class P { n: number; constructor(n: number) { this.n = n } }
const ps: P[] = [new P(1), new P(2)]
const q = ps.at(-1) ?? new P(0)
const r = ps.at(9) ?? new P(0)
console.log(q.n, r.n)
