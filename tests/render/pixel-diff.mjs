import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/pixel-diff.mjs', import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zinc-pixel-diff-'));
function bmp(name, red) {
  const data = Buffer.alloc(58);
  data.write('BM'); data.writeUInt32LE(58, 2); data.writeUInt32LE(54, 10);
  data.writeUInt32LE(40, 14); data.writeInt32LE(1, 18); data.writeInt32LE(1, 22);
  data.writeUInt16LE(1, 26); data.writeUInt16LE(24, 28); data[56] = red;
  const file = path.join(dir, name); fs.writeFileSync(file, data); return file;
}
const run = (...args) => {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  assert.ifError(result.error); return result;
};
try {
  const a = bmp('a.bmp', 0), b = bmp('b.bmp', 8), c = bmp('c.bmp', 9);
  assert.equal(run(a, a, '--max-share', '0').status, 0);
  assert.equal(run(a, b, '--threshold', '8', '--max-share', '0').status, 0);
  assert.equal(run(a, c, '--threshold', '8', '--max-share', '0').status, 1);
  const png = path.join(dir, 'diff.png');
  assert.equal(run(a, a, '--out', png).status, 0);
  assert.equal(run(a, png, '--max-share', '0').status, 0);
  assert.equal(run().status, 2);
  console.log('pixel-diff: equality, threshold boundary, changed pixels and PNG output passed');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
