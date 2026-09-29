import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cli = path.join(root, 'compiler/bin/zinc.mjs');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zinc-tooling-'));
const external = work + '-external.ts';
const host = process.platform === 'darwin' ? 'macos' : 'linux';
fs.writeFileSync(path.join(work, 'zinc.json'), JSON.stringify({ name: 'portable', entry: 'main.ts' }));
fs.writeFileSync(path.join(work, 'main.ts'), "import { value } from './value'; console.log(value);\n");
fs.writeFileSync(path.join(work, 'value.ts'), 'export const value: i32 = 41;\n');
function run(args) {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: root, timeout: 120000 });
  assert.equal(r.status, 0, `${args.join(' ')}\n${r.error ?? ''}${r.stdout}${r.stderr}`);
  return r;
}
try {
  for (const engine of ['zinc-vm', 'quickjs']) {
    const options = ['--engine', engine, ...(engine === 'zinc-vm' && process.arch === 'arm64' ? ['--jit'] : [])];
    run(['test', path.join(work, 'main.ts'), ...options]);
    const manifest = JSON.parse(fs.readFileSync(path.join(work, 'build', `${engine}-${host}`, 'engine.json')));
    assert.equal(manifest.engine, engine, 'zinc test must forward engine selection');
    assert.equal(manifest.tier, engine === 'zinc-vm' ? process.arch === 'arm64' ? 1 : 0 : null);
    run(['export', work, ...options]);
    const original = path.join(work, 'dist', `portable-${host}-${engine}`);
    const moved = path.join(work, `relocated ${engine}`);
    fs.renameSync(original, moved);
    const exported = JSON.parse(fs.readFileSync(path.join(moved, 'engine.json')));
    for (const file of exported.files) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(moved, file.path))).digest('hex'), file.sha256);
    const r = spawnSync('sh', [path.join(moved, 'run.sh')], { encoding: 'utf8', cwd: os.tmpdir(), timeout: 30000 });
    assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, '41\n');
    console.log(`ok ${engine} test options, export relocation and artifact hashes`);
  }
  // One watcher, two engines: editing an imported module must start a fresh runtime and refresh the bundle.
  for (const engine of ['zinc-vm', 'quickjs']) {
    fs.writeFileSync(path.join(work, 'value.ts'), 'export const value: i32 = 41;\n');
    const keepAlive = "import * as sys from 'zinc:sys'; sys.onSignal('SIGTERM', () => { console.log('held SIGTERM'); }); setInterval(() => {}, 100); ";
    fs.writeFileSync(path.join(work, 'main.ts'), keepAlive + "import { value } from './value'; console.log(value);\n");
    const child = spawn(process.execPath, [cli, 'dev', work, '--engine', engine], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errors = '';
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { errors += data; });
    const wait = async text => {
      const deadline = Date.now() + 120000;
      while (!output.includes(text)) {
        assert.equal(child.exitCode, null, errors);
        assert.ok(Date.now() < deadline, `dev timeout: ${output}\n${errors}`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };
    try {
      await wait('41\n');
      fs.writeFileSync(path.join(work, 'value.ts'), 'export const value: i32 = 42;\n');
      await wait('42\n');
      assert.ok(output.includes('held SIGTERM'), 'reload must handle a guest that intercepts SIGTERM');
      fs.writeFileSync(external, 'export const value: i32 = 43;\n');
      fs.writeFileSync(path.join(work, 'main.ts'), keepAlive + `import { value } from '../${path.basename(external, '.ts')}'; console.log(value);\n`);
      await wait('43\n');
      fs.writeFileSync(external, 'export const value: i32 = 44;\n');
      await wait('44\n');
      if (engine === 'quickjs') assert.ok(!fs.readdirSync(path.join(work, 'build', `${engine}-${host}-dev`, 'bundle')).some(file => file.endsWith('-value.mjs')), 'removed imports must not remain in bundle');
      console.log(`ok ${engine} dev restarts after local and external module edits`);
    } finally {
      child.kill('SIGINT');
      if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    }
  }
} finally { fs.rmSync(work, { recursive: true, force: true }); fs.rmSync(external, { force: true }); }
