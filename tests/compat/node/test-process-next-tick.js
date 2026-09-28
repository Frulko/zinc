// After node/test/parallel/test-next-tick-ordering.js: nextTick runs before promise jobs and timers.
const assert = require('assert');
const order = [];
setTimeout(common.mustCall(() => {
  order.push('timeout');
  assert.deepStrictEqual(order, ['sync', 'tick1', 'tick2', 'nested', 'promise', 'timeout']);
  common.done();
}), 0);
Promise.resolve().then(() => order.push('promise'));
process.nextTick(() => { order.push('tick1'); process.nextTick(() => order.push('nested')); });
process.nextTick((a, b) => { assert.strictEqual(a + b, 3); order.push('tick2'); }, 1, 2);
order.push('sync');
