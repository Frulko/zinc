import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zinc-generics-'));
try {
  const file = path.join(dir, 'case.ts');
  fs.writeFileSync(file, 'export {}; class Growing<T> { next(): Growing<T[]> { return new Growing<T[]>(); } } const root = new Growing<i32>(); console.log(root === root);');
  const run = spawnSync(process.execPath, ['compiler/bin/zinc.mjs', 'build', file, '--engine', 'zinc-vm'], { encoding: 'utf8', timeout: 15000 });
  assert.notEqual(run.status, 0);
  assert.match(run.stdout + run.stderr, /generic specialization depth limit exceeded/);
  fs.writeFileSync(file, 'export {}; class Link<T> { next: Link<T> | null = null; constructor(public value: T) {} } const root = new Link<i32>(7); root.next = root; console.log(root.next.value);');
  const valid = spawnSync(process.execPath, ['compiler/bin/zinc.mjs', 'run', file, '--engine', 'zinc-vm'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  assert.equal(valid.stdout.trim(), '7');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log('ok generic expansion is bounded and recursive types share an instance');
