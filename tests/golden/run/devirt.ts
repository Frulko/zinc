class Base {
  v: i32 = 1;
  get(): i32 {
    return this.v;
  }
}
class Unused extends Base {
  get(): i32 {
    return 99;
  }
}
const b = new Base();
console.log(b.get());
