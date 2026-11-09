// Nested declarations with the names of top-level ones (ZN-667, the fuzzer's check-dup-names-invalid-ir): the nested function
// is hoisted, and the variables it captures that are declared below it are read when it runs, as in JavaScript.
function early(n: number): number {
  function early(n: number): number {
    return later(n) + LIMIT + name.length;
  }
  function later(n: number): number {
    return n * 3;
  }
  const LIMIT: number = 100;
  let name = 'ab';
  const first = early(n);
  name = 'abcd';
  class Late {
    v: number = 2;
  }
  function make(): Late {
    return new Late();
  }
  console.log(first, early(n), make().v);
  return first + LIMIT;
}
function later(n: number): number {
  return n * 2;
}
const LIMIT: number = 7;
console.log(early(2), later(2), LIMIT);
class Late {
  v: number = 1;
}
function make(): Late {
  return new Late();
}
console.log(make().v);
for (let i = 0; i < 2; i++) {
  function get(): number { return v * 10; }
  const v = i + 1;
  console.log(get());
}
