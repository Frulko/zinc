// Generic static methods infer their type arguments like generic functions (C++ cannot deduce T from an i32 and a
// double), and a type parameter bound to two number kinds is `number`, as tsc infers (found by zinc compat, test262).
class Check {
  static same<T>(a: T, b: T): boolean { return a === b; }
  static pick<T>(xs: T[], i: i32): T { return xs[i]; }
}
function eq<T>(a: T, b: T): boolean { return a === b; }
const xs = [1, 2, 3];
console.log(Check.same(xs.length, 3), Check.same(xs.length, 2.5), Check.same('a', 'a'), Check.pick(['x', 'y'], 1));
console.log(eq(xs.length, 3), eq(xs.length, 3.5), eq(2.5, xs.length), eq(xs.length, xs.length));
