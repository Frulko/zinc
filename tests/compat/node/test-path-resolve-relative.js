// After node/test/parallel/test-path-resolve.js and test-path-relative.js (posix cases).
const assert = require('assert');
const path = require('path');
assert.strictEqual(path.resolve('/var/lib', '../', 'file/'), '/var/file');
assert.strictEqual(path.resolve('/var/lib', '/../', 'file/'), '/file');
assert.strictEqual(path.resolve('/some/dir', '.', '/absolute/'), '/absolute');
assert.strictEqual(path.resolve('/foo/tmp.3/', '../tmp.3/cycles/root.js'), '/foo/tmp.3/cycles/root.js');
assert.strictEqual(path.resolve('a'), path.join(process.cwd(), 'a'));
assert.strictEqual(path.isAbsolute('/home/foo'), true);
assert.strictEqual(path.isAbsolute('bar/'), false);
const rels = [['/var/lib', '/var', '..'], ['/var/lib', '/bin', '../../bin'], ['/var/lib', '/var/lib', ''],
  ['/var/lib', '/var/apache', '../apache'], ['/var/', '/var/lib', 'lib'], ['/', '/var/lib', 'var/lib'],
  ['/foo/test', '/foo/test/bar/package.json', 'bar/package.json'], ['/foo/bar/baz-quux', '/foo/bar/baz', '../baz'], ['/baz', '/baz-quux', '../baz-quux']];
for (const [from, to, rel] of rels) assert.strictEqual(path.relative(from, to), rel, `${from} -> ${to}`);
console.log('ZC:PASS');
