function makeCounter(): () => i32 {
  let calls: i32 = 0;
  return () => {
    calls++;
    return calls;
  };
}
function apply(f: (x: i32) => i32, v: i32): i32 {
  return f(v);
}
function compose(f: (x: i32) => i32, g: (x: i32) => i32): (x: i32) => i32 {
  return (x: i32): i32 => g(f(x));
}
function double(x: i32): i32 {
  return x * 2;
}
function makeAdder(k: i32): (x: i32) => i32 {
  return x => x + k;
}
class Button {
  n: i32 = 0;
  on: () => i32;
  constructor() {
    this.on = () => {
      this.n++;
      return this.n;
    };
  }
}
const next = makeCounter();
next();
next();
const other = makeCounter();
const add5 = (x: i32): i32 => x + 5;
const k: i32 = 10;
console.log(next(), other(), apply(add5, 1), apply(x => x * k, 3), compose(add5, x => x * 2)(1), compose(double, makeAdder(3))(4));
const b = new Button();
b.on();
console.log(b.on(), b.n);
let total: i32 = 0;
const addTo = (v: i32): void => {
  total += v;
};
addTo(3);
addTo(4);
console.log(total);
