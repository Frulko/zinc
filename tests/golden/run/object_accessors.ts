// Getters, setters and methods using `this` in object literals (ZN-160): reads call the getter, writes the setter, `this` is the object.
const temp = {
  celsius: 20,
  get fahrenheit(): number { return this.celsius * 9 / 5 + 32; },
  set fahrenheit(f: number) { this.celsius = (f - 32) * 5 / 9; },
};
console.log(temp.fahrenheit);
temp.fahrenheit = 212;
console.log(temp.celsius, temp.fahrenheit);

const counter = {
  count: 0,
  label: 'clicks',
  inc(by: number = 1): number { this.count += by; return this.count; },
  get text(): string { return this.count + ' ' + this.label; },
};
counter.inc();
counter.inc(5);
console.log(counter.text, counter.count);

function makeRange(lo: number, hi: number) {
  return {
    lo: lo,
    hi: hi,
    get size(): number { return this.hi - this.lo; },
    contains(x: number): boolean { return x >= this.lo && x < this.hi; },
  };
}
const r = makeRange(3, 10);
console.log(r.size, r.contains(5), r.contains(10));
r.hi = 4;
console.log(r.size);

const shape = { n: 3, f(): number { return this.n + 1; } };
console.log(shape.f());

const plain = { a: 1, double: (x: number): number => x * 2 };
console.log(plain.double(plain.a));
