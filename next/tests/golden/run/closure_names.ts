// a closure that names its own binding, a named function expression, and a function that uses a const declared below it
const countdown = (n: number): void => { if (n > 0) { console.log('down', n); countdown(n - 1) } }
countdown(2)

const fact = function f(n: number): number { return n <= 1 ? 1 : n * f(n - 1) }
console.log(fact(5))

function local(): number {
  const sum: (n: number) => number = (n) => n <= 0 ? 0 : n + sum(n - 1)
  const fib = function inner(n: number): number { return n < 2 ? n : inner(n - 1) + inner(n - 2) }
  return sum(4) + fib(10)
}
console.log(local())

function useLater(): number { return later * 2 }
const later: number = 21
console.log(useLater())

let ticks = 0
const timer = setInterval(() => { ticks++; if (ticks === 3) { clearInterval(timer); console.log('stopped after', ticks) } }, 1)
