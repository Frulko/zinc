class Many {
  constructor(public a: i32, public b: i32, public c: i32, public d: i32, public e: i32, public f: i32, public g: i32, public h: i32, private i: i32, protected j: i32, readonly k: i32, public l: i32) {}
  sum(): i32 {
    return this.a + this.b + this.c + this.d + this.e + this.f + this.g + this.h + this.i + this.j + this.k + this.l;
  }
}
class Sub extends Many {
  constructor() {
    super(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);
  }
  twice(): i32 {
    return this.sum() * 2 + this.j;
  }
}
const m = new Many(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
const s = new Sub();
console.log(m.sum(), s.sum(), s.twice(), s.l);
