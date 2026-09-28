// Adapted from Node's test/common (MIT): only mustCall / mustNotCall, checked when the test calls common.done().
// Prepended to every tests/compat/node/test-*.js program; each test prints ZC:PASS at its logical end.
const common = {
  calls: [],
  mustCall(fn, expected) {
    const c = { name: fn ? fn.name || '<anonymous>' : 'noop', expected: expected === undefined ? 1 : expected, actual: 0 };
    common.calls.push(c);
    return function (...args) { c.actual++; return fn ? fn.apply(this, args) : undefined; };
  },
  mustNotCall(msg) {
    return function () { throw new Error(msg || 'function should not have been called'); };
  },
  done() {
    for (const c of common.calls) if (c.actual !== c.expected) throw new Error(`mustCall ${c.name}: expected ${c.expected} call(s), got ${c.actual}`);
    console.log('ZC:PASS');
  },
};
