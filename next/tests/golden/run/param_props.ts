class P {
  constructor(public x: i32, private y: i32, readonly z: i32) {}
  sum(): i32 {
    return this.x + this.y + this.z;
  }
}
class Q extends P {
  w: i32 = 7;
  constructor(a: i32) {
    super(a, a + 1, a + 2);
  }
  total(): i32 {
    return this.sum() + this.w;
  }
}
const q = new Q(10);
console.log(q.sum(), q.total(), q.x, q.z);
