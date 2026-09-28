// test262 harness for Zinc programs (assert.js, sta.js, compareArray.js, doneprintHandle.js, asyncHelpers.js).
// The originals rely on function properties and `arguments`; this keeps their API, typed with generics so a test
// compiles in the strict profile too. Reference engines run the real harness files.
export class Test262Error extends Error {
  constructor(message: string = '') { super(message); this.name = 'Test262Error'; }
}

export function $DONOTEVALUATE(): void { throw new Test262Error('Test262: This statement should not be evaluated.'); }

// ponytail: no +0 / -0 distinction; typeof on a type parameter is refused by the native backend (Z1013)
function same<T>(a: T, b: T): boolean { return a === b || (a !== a && b !== b); }

export class assert {
  static ok(value: boolean, message: string = ''): void {
    if (!value) throw new Test262Error(`Expected true but got false. ${message}`);
  }
  static sameValue<T>(actual: T, expected: T, message: string = ''): void {
    if (!same(actual, expected)) throw new Test262Error(`${message} Expected SameValue(«${actual}», «${expected}») to be true`);
  }
  static notSameValue<T>(actual: T, unexpected: T, message: string = ''): void {
    if (same(actual, unexpected)) throw new Test262Error(`${message} Expected SameValue(«${actual}», «${unexpected}») to be false`);
  }
  /** `assert.throws(TypeError, f)` reaches Zinc as `assert.throws('TypeError', f)`: constructors are not values. */
  static throws(expected: string, f: () => void, message: string = ''): void {
    try { f(); } catch (e) {
      if (e.name !== expected) throw new Test262Error(`${message} Expected a ${expected} but got a ${e.name}`);
      return;
    }
    throw new Test262Error(`${message} Expected a ${expected} to be thrown but no exception was thrown at all`);
  }
  static compareArray<T>(actual: T[], expected: T[], message: string = ''): void {
    if (!compareArray(actual, expected)) throw new Test262Error(`${message} Actual [${actual.join(', ')}] and expected [${expected.join(', ')}] should have the same contents.`);
  }
}

export function compareArray<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
  return true;
}

export function $DONE(error: Error | undefined = undefined): void {
  if (error) console.log(`Test262:AsyncTestFailure:${error.name}: ${error.message}`);
  else console.log('Test262:AsyncTestComplete');
}

export async function asyncTest(f: () => Promise<void>): Promise<void> {
  try { await f(); } catch (e) { $DONE(e); return; }
  $DONE();
}
