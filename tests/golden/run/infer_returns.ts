function add(a: number, b: number) { return a + b }
function mk(n: number) { return { n, label: 'x' } }
function adder(k: number) { return (x: number) => x + k }
class P { v: number = 1 }
function maybe(f: boolean) { if (f) return new P(); return null }
function nothing(a: number) { console.log(a) }
function fact(n: number): number { return n <= 1 ? 1 : n * fact(n - 1) }
console.log(add(1, 2), mk(3).n, adder(2)(5), maybe(true)?.v, maybe(false), fact(4))
nothing(1)
