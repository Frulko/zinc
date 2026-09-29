class Counter {
  label: string = 'counter';
  constructor(public value: i32) {}
  add(n: i32): i32 { this.value += n; return this.value; }
  read(): i32 { return this.value; }
  static twice(n: i32): i32 { return n * 2; }
}
class DoubleCounter extends Counter {
  factor: i32 = 2;
  constructor(n: i32) { super(n); }
  add(n: i32): i32 { this.value += n * this.factor; return this.value; }
}
class InheritedCounter extends DoubleCounter {}
class DefaultCounter { value: i32 = 42; read(): i32 { return this.value; } }
function work(c: Counter): i32 { return c.add(3); }
const c = new Counter(10);
const d = new DoubleCounter(20);
const inherited = new InheritedCounter(30);
console.log(c.label, work(c), work(d), work(inherited), d.read(), Counter.twice(6));
console.log(new DefaultCounter().read());
function churn(): i32 {
  let n: i32 = 0;
  for (let i: i32 = 0; i < 10000; i++) { const c = new DoubleCounter(i); n = work(c); }
  return n;
}
console.log(churn(), d.read());
