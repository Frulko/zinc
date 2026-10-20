class Box {
  private v: i32 = 0;
  get value(): i32 { return this.v; }
  set value(x: i32) { this.v = x * 2; }
  set order(o: i32) { this.v = o; }
}
const b = new Box();
b.value = 21;
console.log(b.value);
b.order = 5;
console.log(b.value);
