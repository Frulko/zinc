// After node/test/parallel/test-process-hrtime.js and test-process-uptime.js.
const assert = require('assert');
const t = process.hrtime();
assert.strictEqual(t.length, 2);
assert.ok(Number.isInteger(t[0]) && Number.isInteger(t[1]) && t[1] < 1e9);
const d = process.hrtime(t);
assert.ok(d[0] >= 0 && d[1] >= 0);
const b1 = process.hrtime.bigint();
const b2 = process.hrtime.bigint();
assert.strictEqual(typeof b1, 'bigint');
assert.ok(b2 >= b1);
assert.ok(process.uptime() > 0);
const m = process.memoryUsage();
assert.ok(m.rss > 0 && m.heapUsed > 0);
console.log('ZC:PASS');
