// After node/test/parallel/test-process-env.js and test-process-argv-0.js.
const assert = require('assert');
assert.ok(Array.isArray(process.argv));
assert.ok(process.argv.length >= 1);
assert.strictEqual(typeof process.env.PATH, 'string');
process.env.ZC_COMPAT_VAR = 'x';
assert.strictEqual(process.env.ZC_COMPAT_VAR, 'x');
process.env.ZC_COMPAT_NUM = 42;
assert.strictEqual(process.env.ZC_COMPAT_NUM, '42');
delete process.env.ZC_COMPAT_VAR;
assert.strictEqual(process.env.ZC_COMPAT_VAR, undefined);
assert.strictEqual('ZC_COMPAT_VAR' in process.env, false);
assert.strictEqual(typeof process.cwd(), 'string');
assert.strictEqual(typeof process.pid, 'number');
assert.ok(['darwin', 'linux'].includes(process.platform));
assert.strictEqual(typeof process.version, 'string');
assert.strictEqual(typeof process.versions, 'object');
console.log('ZC:PASS');
