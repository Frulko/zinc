// Math constants beyond PI and E, a three-argument hypot, String() of an any value.
const j: any = JSON.parse('{"a": "x", "n": 5}')
console.log(Math.SQRT2.toFixed(4), Math.SQRT1_2.toFixed(4), Math.LN2.toFixed(4), Math.LN10.toFixed(4), Math.LOG2E.toFixed(4), Math.LOG10E.toFixed(4))
console.log(Math.hypot(2, 3, 6), Math.hypot(3, 4))
console.log(String(j.a) + String(j.n))
