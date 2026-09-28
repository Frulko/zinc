// After node/test/parallel/test-path-join.js and test-path-normalize.js (posix cases).
const assert = require('assert');
const path = require('path');
const joins = [
  [['.', 'x/b', '..', '/b/c.js'], 'x/b/c.js'], [[], '.'], [['/.', 'x/b', '..', '/b/c.js'], '/x/b/c.js'],
  [['/foo', '../../../bar'], '/bar'], [['foo', '../../../bar'], '../../bar'], [['foo/', '../../../bar'], '../../bar'],
  [['foo/x', '../../../bar'], '../bar'], [['foo/x', './bar'], 'foo/x/bar'], [['./'], './'], [['.', './'], './'],
  [['', ''], '.'], [['', 'foo'], 'foo'], [['/', '/foo'], '/foo'], [['/', '//foo'], '/foo'], [['/', '', '/foo'], '/foo'],
];
for (const [args, expected] of joins) assert.strictEqual(path.join(...args), expected);
assert.strictEqual(path.normalize('./fixtures///b/../b/c.js'), 'fixtures/b/c.js');
assert.strictEqual(path.normalize('/foo/../../../bar'), '/bar');
assert.strictEqual(path.normalize('a//b//../b'), 'a/b');
assert.strictEqual(path.normalize('a//b//./c'), 'a/b/c');
assert.strictEqual(path.normalize(''), '.');
assert.strictEqual(path.sep, '/');
assert.strictEqual(path.delimiter, ':');
console.log('ZC:PASS');
