// Minimal WPT testharness.js for Zinc programs: test(), promise_test() and the common asserts, reporting one
// `ZC:SUB PASS|FAIL <name>` line per subtest and `ZC:DONE` at the end, like the real harness does for the reference
// engines (tests/compat/run.mjs). async_test() and EventWatcher are not provided: tests using them are "unsupported".
export class AssertionError extends Error {
  constructor(message: string) { super(message); this.name = 'AssertionError'; }
}

export class Test {
  name: string;
  cleanups: (() => void)[] = [];
  constructor(name: string) { this.name = name; }
  add_cleanup(f: () => void): void { this.cleanups.push(f); }
  cleanup(): void { for (const f of this.cleanups) f(); }
}

// ponytail: no +0 / -0 distinction; typeof on a type parameter is refused by the native backend (Z1013)
function same<T>(a: T, b: T): boolean { return a === b || (a !== a && b !== b); }
function fail(message: string, description: string): void { throw new AssertionError(description ? `${description}: ${message}` : message); }

let counter = 0;
function nameOf(name: string): string { counter++; return name ? name : `test ${counter}`; }

export function test(f: (t: Test) => void, name: string = ''): void {
  const t = new Test(nameOf(name));
  try { f(t); console.log(`ZC:SUB PASS ${t.name}`); } catch (e) { console.log(`ZC:SUB FAIL ${t.name}: ${e.message}`); }
  t.cleanup();
}

const queue: ((t: Test) => Promise<void>)[] = [];
const names: string[] = [];
export function promise_test(f: (t: Test) => Promise<void>, name: string = ''): void { queue.push(f); names.push(nameOf(name)); }

/** Appended at the end of every program: runs the promise tests one after the other, then reports the end. */
export async function __zc_done(): Promise<void> {
  for (let i = 0; i < queue.length; i++) {
    const t = new Test(names[i]);
    const f = queue[i];
    let error = '';
    try { await f(t); } catch (e) { error = e.message; }
    console.log(error ? `ZC:SUB FAIL ${t.name}: ${error}` : `ZC:SUB PASS ${t.name}`);
    t.cleanup();
  }
  console.log('ZC:DONE');
}

export function assert_equals<T>(actual: T, expected: T, description: string = ''): void {
  if (!same(actual, expected)) fail(`expected ${expected} but got ${actual}`, description);
}
export function assert_not_equals<T>(actual: T, expected: T, description: string = ''): void {
  if (same(actual, expected)) fail(`got disallowed value ${actual}`, description);
}
export function assert_true(actual: boolean, description: string = ''): void { if (actual !== true) fail(`expected true got ${actual}`, description); }
export function assert_false(actual: boolean, description: string = ''): void { if (actual !== false) fail(`expected false got ${actual}`, description); }
export function assert_array_equals<T>(actual: T[], expected: T[], description: string = ''): void {
  if (actual.length !== expected.length) fail(`lengths differ, expected ${expected.length} got ${actual.length}`, description);
  for (let i = 0; i < actual.length; i++) if (!same(actual[i], expected[i])) fail(`expected ${expected[i]} but got ${actual[i]} at index ${i}`, description);
}
export function assert_in_array<T>(actual: T, expected: T[], description: string = ''): void {
  if (!expected.some(e => same(e, actual))) fail(`value ${actual} not in array`, description);
}
export function assert_less_than(actual: number, expected: number, description: string = ''): void { if (!(actual < expected)) fail(`expected a number less than ${expected} but got ${actual}`, description); }
export function assert_greater_than(actual: number, expected: number, description: string = ''): void { if (!(actual > expected)) fail(`expected a number greater than ${expected} but got ${actual}`, description); }
export function assert_less_than_equal(actual: number, expected: number, description: string = ''): void { if (!(actual <= expected)) fail(`expected a number less than or equal to ${expected} but got ${actual}`, description); }
export function assert_greater_than_equal(actual: number, expected: number, description: string = ''): void { if (!(actual >= expected)) fail(`expected a number greater than or equal to ${expected} but got ${actual}`, description); }
export function assert_approx_equals(actual: number, expected: number, epsilon: number, description: string = ''): void {
  if (Math.abs(actual - expected) > epsilon) fail(`expected ${expected} +/- ${epsilon} but got ${actual}`, description);
}
export function assert_unreached(description: string = ''): void { fail('Reached unreachable code', description); }
/** `assert_throws_js(TypeError, f)` reaches Zinc as `assert_throws_js('TypeError', f)`: constructors are not values. */
export function assert_throws_js(expected: string, f: () => void, description: string = ''): void {
  try { f(); } catch (e) { if (e.name !== expected) fail(`expected ${expected} but got ${e.name}`, description); return; }
  fail('function did not throw', description);
}
export function assert_throws_dom(name: string, f: () => void, description: string = ''): void {
  try { f(); } catch (e) { if (e.name !== name) fail(`expected ${name} but got ${e.name}`, description); return; }
  fail('function did not throw', description);
}
