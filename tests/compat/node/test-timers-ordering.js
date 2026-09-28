// After node/test/parallel/test-timers-ordering.js and test-timers-clear-null-does-not-throw-error.js.
const assert = require('assert');
const order = [];
setTimeout(() => order.push(30), 30);
setTimeout(() => order.push(10), 10);
setTimeout(() => order.push('0a'), 0);
setTimeout(() => order.push('0b'), 0);
const cancelled = setTimeout(common.mustNotCall(), 5);
clearTimeout(cancelled);
clearTimeout(null);
clearTimeout(undefined);
setTimeout(common.mustCall((a, b) => {
  assert.strictEqual(a + b, 'xy');
  assert.deepStrictEqual(order, ['0a', '0b', 10, 30]);
  common.done();
}), 50, 'x', 'y');
