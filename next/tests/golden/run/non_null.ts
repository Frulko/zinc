class A { n: number = 4 }
function f(a: A | null): number { return a!.n }
const s: string | null = 'hi'
const k: number = 3
console.log(f(new A()), s!.length, k!)
