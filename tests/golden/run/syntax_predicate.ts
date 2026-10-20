class A { n: number = 1 }
function isA(x: A | null): x is A { return x !== null }
const v: A | null = new A()
if (isA(v)) console.log(v.n)
