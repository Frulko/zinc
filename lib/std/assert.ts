// zinc:assert — checks for `zinc test <dir>` (docs/guide/06-testing.md), like txiki's tjs:assert / node:assert. A
// failed check throws an AssertionError; uncaught, it ends the program with exit code 1, which fails the test file.

export class AssertionError extends Error {
  constructor(message: string) { super(message); this.name = 'AssertionError'; }
}
export function fail(message: string = 'Failed'): void { throw new AssertionError(message); }
export function ok(value: boolean, message: string = 'expected a true value'): void { if (!value) throw new AssertionError(message); }
/** Strict equality (===). */
export function equal(actual: unknown, expected: unknown, message: string = ''): void {
  if (actual !== expected) throw new AssertionError(message.length > 0 ? message : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
export function notEqual(actual: unknown, expected: unknown, message: string = ''): void {
  if (actual === expected) throw new AssertionError(message.length > 0 ? message : `expected a value other than ${JSON.stringify(expected)}`);
}
/** Structural equality through JSON (fields of objects, elements of arrays, in order). */
export function deepEqual(actual: unknown, expected: unknown, message: string = ''): void {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new AssertionError(message.length > 0 ? message : `expected ${e}, got ${a}`);
}
/** Calls fn, which must throw; returns the error. `messageIncludes`: a substring its message must contain. */
export function throws(fn: () => void, messageIncludes: string = ''): Error {
  try { fn(); } catch (e) {
    if (messageIncludes.length > 0 && !e.message.includes(messageIncludes)) throw new AssertionError(`expected an error with "${messageIncludes}", got "${e.message}"`);
    return e;
  }
  throw new AssertionError('expected the function to throw');
}
/** Awaits fn(), which must reject. */
export async function rejects(fn: () => Promise<void>, messageIncludes: string = ''): Promise<Error> {
  try { await fn(); } catch (e) {
    if (messageIncludes.length > 0 && !e.message.includes(messageIncludes)) throw new AssertionError(`expected a rejection with "${messageIncludes}", got "${e.message}"`);
    return e;
  }
  throw new AssertionError('expected the promise to reject');
}
