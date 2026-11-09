// A caught error keeps its class once it goes through a value typed any or unknown (ZN-693, found by the pinball editor): instanceof is true on the catch variable,
// on a parameter typed any, in an arrow, in an array, an object field, a rejected promise, and for Error itself.
class TableError extends Error {
  errors: string[];
  constructor(origin: string, errors: string[]) {
    super(`${origin}: ${errors.join(', ')}`);
    this.name = 'TableError';
    this.errors = errors;
  }
}
class OtherError extends Error {}

function check(t: any): any { if (t.bad) throw new TableError('table', ['bad wall']); return t; }
function viaAny(e: any): boolean { return e instanceof TableError; }
function viaUnknown(e: unknown): boolean { return e instanceof TableError; }
function isError(e: any): boolean { return e instanceof Error; }
const arrow = (e: any): boolean => e instanceof TableError;
function faults(e: any): string[] { return e instanceof TableError ? (e as TableError).errors : ['not a table error']; }

try {
  check({ bad: true });
} catch (e) {
  console.log(e instanceof TableError, viaAny(e), viaUnknown(e), isError(e), arrow(e), faults(e)[0]);
  const list: any[] = [e];
  const box: { err: any } = { err: e };
  console.log(list[0] instanceof TableError, box.err instanceof TableError, viaAny(box.err), box.err instanceof OtherError);
}
try { throw new OtherError('other'); } catch (e) { console.log(viaAny(e), isError(e), faults(e)[0]); }
const made: any = new TableError('made', ['x']);
console.log(made instanceof TableError, viaAny(new TableError('arg', ['y'])), viaAny('text'), viaAny(null));
Promise.reject(new TableError('promise', ['z'])).catch((e: any) => console.log('rejected', viaAny(e), faults(e)[0]));
