import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zinc-destructure-'));
try {
  for (const source of [
    'const [value = 7]: i32[] = [3]; console.log(value);',
    'const [first, ...rest]: i32[] = [1, 2]; console.log(first);',
    'interface Value { value: i32 } const { value = 7 }: Value = { value: 3 }; console.log(value);',
  ]) {
    const file = path.join(dir, 'case.ts'); fs.writeFileSync(file, 'export {};\n' + source);
    const run = spawnSync(process.execPath, ['compiler/bin/zinc.mjs', 'build', file, '--engine', 'zinc-vm'], { encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.match(run.stdout + run.stderr, /rest and defaults in destructuring are not implemented/);
  }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log('ok destructuring unsupported defaults and rest are rejected');
