// A class without a constructor inherits the base one, and an omitted argument takes the base parameter default (ZN-107: three.js Float32BufferAttribute).
class A { v: number; w: boolean; constructor(v: number, n: number, w: boolean = false) { this.v = v + n; this.w = w; } }
class B extends A {}
const b = new B(1, 2);
console.log(b.v, b.w);
