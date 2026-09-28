// After node/test/parallel/test-os.js.
const assert = require('assert');
const os = require('os');
assert.strictEqual(os.EOL, '\n');
assert.strictEqual(typeof os.hostname(), 'string');
assert.ok(os.hostname().length > 0);
assert.ok(os.tmpdir().startsWith('/'));
assert.ok(['darwin', 'linux', 'freebsd', 'openbsd', 'sunos', 'aix'].includes(os.platform()));
assert.ok(['Darwin', 'Linux'].includes(os.type()));
assert.ok(os.cpus().length > 0);
assert.ok(os.totalmem() > os.freemem() && os.freemem() > 0);
assert.ok(os.uptime() > 0);
assert.strictEqual(os.loadavg().length, 3);
assert.strictEqual(typeof os.arch(), 'string');
assert.strictEqual(typeof os.release(), 'string');
assert.strictEqual(typeof os.homedir(), 'string');
assert.ok(os.endianness() === 'LE' || os.endianness() === 'BE');
assert.strictEqual(typeof os.userInfo().username, 'string');
console.log('ZC:PASS');
