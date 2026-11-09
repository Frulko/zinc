class A {
  x: i32;
}
class B {
  readonly y: i32;
  constructor(c: boolean) {
    if (c) { this.y = 1; }
  }
}
