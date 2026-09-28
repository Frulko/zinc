// After node/test/parallel/test-events-once.js: events.once() resolves with the emitted arguments.
const assert = require('assert');
const { once, EventEmitter } = require('events');
const e = new EventEmitter();
once(e, 'ready').then(common.mustCall((args) => {
  assert.deepStrictEqual(args, [42, 'x']);
  assert.strictEqual(e.listenerCount('ready'), 0);
  common.done();
}));
setTimeout(() => e.emit('ready', 42, 'x'), 1);
