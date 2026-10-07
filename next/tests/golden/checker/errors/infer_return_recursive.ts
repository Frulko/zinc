function rec(n: number) { return n <= 0 ? 0 : 1 + rec(n - 1) }
console.log(rec(2))
