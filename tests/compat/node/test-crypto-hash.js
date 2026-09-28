// After node/test/parallel/test-crypto-hash.js and test-crypto-randomuuid.js.
const assert = require('assert');
const crypto = require('crypto');
assert.strictEqual(crypto.createHash('sha256').update('abc').digest('hex'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
assert.strictEqual(crypto.createHash('sha1').update('abc').digest('hex'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
assert.strictEqual(crypto.createHash('md5').update('a').update('bc').digest('base64'), 'kAFQmDzST7DWlj99KOF/cg==');
assert.strictEqual(crypto.createHmac('sha256', 'key').update('msg').digest('hex'), '2d93cbc1be167bcb1637a4a23cbff01a7878f0c50ee833954ea5221bb1b8c628');
assert.match(crypto.randomUUID(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.strictEqual(crypto.randomBytes(16).length, 16);
console.log('ZC:PASS');
