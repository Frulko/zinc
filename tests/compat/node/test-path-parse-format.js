// After node/test/parallel/test-path-parse-format.js (posix cases).
const assert = require('assert');
const path = require('path');
const cases = [
  ['/home/user/dir/file.txt', { root: '/', dir: '/home/user/dir', base: 'file.txt', ext: '.txt', name: 'file' }],
  ['/home/user/a dir/another File.zip', { root: '/', dir: '/home/user/a dir', base: 'another File.zip', ext: '.zip', name: 'another File' }],
  ['user/dir/another File.zip', { root: '', dir: 'user/dir', base: 'another File.zip', ext: '.zip', name: 'another File' }],
  ['file', { root: '', dir: '', base: 'file', ext: '', name: 'file' }],
  ['/.file', { root: '/', dir: '/', base: '.file', ext: '', name: '.file' }],
];
for (const [p, parsed] of cases) {
  assert.deepStrictEqual(path.parse(p), parsed);
  assert.strictEqual(path.format(parsed), p);
}
assert.strictEqual(path.format({ dir: 'some/dir', name: 'x', ext: 'png' }), 'some/dir/x.png');
console.log('ZC:PASS');
