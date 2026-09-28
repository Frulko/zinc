// After node/test/parallel/test-whatwg-encoding-custom-textdecoder.js: TextEncoder / TextDecoder from util and globals.
const assert = require('assert');
const util = require('util');
assert.strictEqual(util.TextEncoder, globalThis.TextEncoder);
const enc = new util.TextEncoder();
assert.strictEqual(enc.encoding, 'utf-8');
assert.deepStrictEqual(Array.from(enc.encode('a€')), [0x61, 0xe2, 0x82, 0xac]);
const dec = new util.TextDecoder();
assert.strictEqual(dec.decode(new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0xff])), 'a�');
assert.throws(() => new util.TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array([0xff])), TypeError);
assert.strictEqual(util.format('%s=%d %j', 'a', 42, { b: 1 }), 'a=42 {"b":1}');
assert.strictEqual(util.inspect({ a: [1, 2] }), '{ a: [ 1, 2 ] }');
assert.ok(util.types.isPromise(Promise.resolve()));
console.log('ZC:PASS');
