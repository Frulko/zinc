class A { x: i32 = 0; constructor() { } }
class B extends A {
  constructor() {
    const y = this.x;
    super();
  }
}
