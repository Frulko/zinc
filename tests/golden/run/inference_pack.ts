// explicit type arguments type the literal, callbacks may take other machine number kinds, a field takes the type of a module const
function id<T>(x: T): T { return x }
class Sig<T> { constructor(public v: T) {} }
function createSignal<T>(v: T): Sig<T> { return new Sig<T>(v) }
const a = id<i32[]>([1, 2])
const s = createSignal<i32[]>([3, 4])
console.log(a[0] + a[1], s.v[0] + s.v[1], new Sig<i32[]>([5, 6]).v.length)

function run(f: (n: number, s: string) => void): void { f(3, 'x') }
run((n: i32, s: string) => { console.log(n, s) })
function apply(f: (n: number) => number, x: number): number { return f(x) }
const dbl = (n: i32): i32 => n * 2
console.log(apply(dbl, 21), apply((n: u8): u8 => n + 1, 41))

const BLACK = 0
const NAME = 'ink'
class Canvas { private fillVal = BLACK; label = NAME; get(): number { return this.fillVal } }
const c = new Canvas()
console.log(c.get(), c.label)
