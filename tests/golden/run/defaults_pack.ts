// defaults: inferred from a literal, reading earlier parameters, on lambdas, optional lambda parameters, type-parameter defaults, Arena.frame()
function f(a: number, b = 2) { return a + b }
function g(a: number, b: number = a * 2, c: number = a + b): number { return a + b + c }
console.log(f(1), f(1, 5), g(1), g(1, 5), g(1, 5, 9))

const h = (a: number, b: number = 3): number => a * b
const opt = (a: number, b?: number): number => b === undefined ? a : a + b
const typed: (a: number, b?: number) => number = opt
console.log(h(2), h(2, 4), opt(1), opt(1, 2), typed(5), typed(5, 6))

class Q { constructor(public name = 'q', public n: number = 1) {} }
const q = new Q()
console.log(q.name, q.n, new Q('z', 9).name)

class Box<T = number> { v: T; constructor(v: T) { this.v = v } }
function id<T = number>(x: T): T { return x }
const b = new Box<string>('x')
const d: Box = new Box<number>(4)
console.log(b.v, d.v, id(4), id('s'))
