// zinc test runs every *.test.ts file as a program that imports the plugin: a failing check exits with 1 and fails the file.
// The native part runs here ("deterministic": true in plugin.json); ZINC_NATIVE=sim zinc test runs native/{{id}}.sim.ts instead: both must pass.
import * as assert from 'zinc:assert';
import { greet, checksum } from 'zinc:{{id}}';

assert.equal(greet('Ada'), 'Hello, Ada!');
assert.equal(checksum(''), -2128831035);       // the FNV offset basis
assert.equal(checksum('hello'), 1335831723);
assert.equal(checksum('é'), 513665217);        // two UTF-8 bytes
assert.equal(checksum('😀'), 866293256);       // four, from a surrogate pair
console.log('{{id}}: ok');
