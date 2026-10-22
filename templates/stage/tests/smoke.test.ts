// zinc test runs every *.test.ts file of the project: a failing check exits with 1 and fails the file.
import * as assert from 'zinc:assert';

assert.equal(1 + 1, 2);
console.log('{{name}}: ok');
