abstract class Base {
  abstract area(): i32;
  double(): i32 {
    return this.area() * 2;
  }
}
class A extends Base {
  area(): i32 {
    return 5;
  }
}
class B extends Base {
  n: i32 = 3;
  area(): i32 {
    return this.n * 4;
  }
}
function run(x: Base): i32 {
  return x.double();
}
console.log(run(new A()), run(new B()));
