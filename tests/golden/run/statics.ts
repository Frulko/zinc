class Counter {
  static created: i32 = 0;
  static step: i32 = 5;
  id: i32;
  constructor() {
    Counter.created++;
    this.id = Counter.created * Counter.step;
  }
  static make(): Counter {
    return new Counter();
  }
}
const a = new Counter();
const b = Counter.make();
console.log(a.id, b.id, Counter.created);
