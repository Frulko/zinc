// After node/test/parallel/test-timers-interval-throw.js / test-timers-immediate.js.
const assert = require('assert');
let n = 0;
const iv = setInterval(common.mustCall(() => {
  if (++n === 3) {
    clearInterval(iv);
    setImmediate(common.mustCall((x) => {
      assert.strictEqual(x, 'arg');
      const im = setImmediate(common.mustNotCall());
      clearImmediate(im);
      setTimeout(() => common.done(), 1);
    }), 'arg');
  }
}, 3), 3);
