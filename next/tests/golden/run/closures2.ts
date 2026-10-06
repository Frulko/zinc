function adder(a: i32): (b: i32) => (c: i32) => i32 {
  return b => c => a + b + c;
}
function counterPair(): [() => i32, () => void] {
  let n: i32 = 0;
  return [() => n, () => { n += 1; }];
}
function twice(f: (x: i32) => i32): (x: i32) => i32 {
  return x => f(f(x));
}
function sq(x: i32): i32 {
  return x * x;
}
let acc: i32 = 0;
const bump = (d: i32): void => {
  acc += d;
};
function accumulate(n: i32): i32 {
  const add = (d: i32): void => {
    n += d;
  };
  add(1);
  add(2);
  return n;
}
function loopy(): i32 {
  let sum: i32 = 0;
  let i: i32 = 0;
  while (i < 3) {
    const k: i32 = i * 10;
    const f = (): i32 => k + 1;
    sum += f();
    i++;
  }
  return sum;
}
class Counter {
  step: i32 = 2;
  total: i32 = 0;
  make(): () => i32 {
    return () => {
      this.total += this.step;
      return this.total;
    };
  }
}
const [get, inc] = counterPair();
inc();
inc();
bump(5);
const c = new Counter();
const tick = c.make();
tick();
console.log(adder(1)(2)(3), get(), twice(sq)(3), twice(x => x + 1)(0), accumulate(10), loopy(), acc, tick(), c.total);
const fn2: (a: i32, b: i32) => i32 = (a, b) => a * b;
console.log(fn2(6, 7), (function (z: i32): i32 { return z + 1; })(41), ((q: i32) => q * 2)(8));
