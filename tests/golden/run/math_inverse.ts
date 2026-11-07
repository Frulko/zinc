// Math.atan and the inverse hyperbolic functions (ZN-699); the expected output comes from Node
const f = (x: number): string => x.toFixed(9)
console.log(f(Math.atan(1)), f(Math.atan(-0.5)), f(Math.atan(1e9)), Math.atan(0))
console.log(f(Math.asinh(1)), f(Math.asinh(-2.5)), Math.asinh(0))
console.log(f(Math.acosh(2)), Math.acosh(1), Math.acosh(0.5))
console.log(f(Math.atanh(0.5)), Math.atanh(1), Math.atanh(-1), Math.atanh(2))
