class Counter {
  count: i32 = 0;
  step: i32;
  constructor(step: i32) {
    this.step = step;
  }
  tick(): void {
    this.count += this.step;
  }
  value(): i32 {
    return this.count;
  }
}
const c = new Counter(2);
c.tick();
c.tick();
console.log(c.value(), c.count);
