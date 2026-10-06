interface Shape {
  area(): f64;
  scale(k: f64): f64;
}
class Sq implements Shape {
  s: f64;
  constructor(s: f64) {
    this.s = s;
  }
  area(): f64 {
    return this.s * this.s;
  }
  scale(k: f64): f64 {
    return this.area() * k;
  }
}
class Circ implements Shape {
  r: f64;
  constructor(r: f64) {
    this.r = r;
  }
  area(): f64 {
    return 3 * this.r * this.r;
  }
  scale(k: f64): f64 {
    return this.area() + k;
  }
}
function total(a: Shape, b: Shape): f64 {
  return a.area() + b.scale(2);
}
console.log(total(new Sq(2), new Circ(1)), total(new Circ(2), new Sq(3)));
