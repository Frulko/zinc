// After node/test/parallel/test-fs-promises-writefile.js and test-fs-promises-readfile.js.
const assert = require('assert');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
(async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'zc-compat-'));
  const f = path.join(dir, 'p.txt');
  await fsp.writeFile(f, 'async data');
  assert.strictEqual(await fsp.readFile(f, 'utf8'), 'async data');
  await fsp.appendFile(f, '!');
  assert.strictEqual((await fsp.stat(f)).size, 11);
  assert.deepStrictEqual(await fsp.readdir(dir), ['p.txt']);
  await assert.rejects(fsp.readFile(path.join(dir, 'missing')), { code: 'ENOENT' });
  await fsp.rm(dir, { recursive: true });
  console.log('ZC:PASS');
})();
