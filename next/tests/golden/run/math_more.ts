const f = (x: number): string => x.toFixed(6)
console.log(f(Math.cbrt(27)), f(Math.log2(8)), f(Math.log10(1000)), f(Math.log1p(0)), f(Math.expm1(0)))
console.log(f(Math.asin(1)), f(Math.acos(1)), f(Math.sinh(0)), f(Math.cosh(0)), f(Math.tanh(0)))
console.log(f(Math.hypot(3, 4)))
