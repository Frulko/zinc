function factory(seed: i32): (value: i32) => string {
  let calls: i32 = 0;
  function first(value: i32): i32 { calls++; return seed + value; }
  function second(value: i32): string { return `${first(value)}:${calls}`; }
  return second;
}
const a = factory(10);
const b = factory(20);
console.log('closures', a(1), a(2), b(1), a(3));
function pair(seed: i32): [() => i32, () => i32] {
  let current: i32 = seed;
  return [() => current, (): i32 => { current++; return current; }];
}
function destructured(): () => i32 {
  const [read, advance] = pair(5);
  function total(): i32 { return read() + advance(); }
  return total;
}
const retained = destructured();
for (let i: i32 = 0; i < 1000; i++) { const temporary = factory(i); temporary(1); }
console.log('bindings', retained(), retained());
