// CLI integration: one real graphics core, two script builds, and watch/restart without CMake.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zinc-core-cli-'));
const cli = path.join(root, 'compiler/bin/zinc.mjs'), entry = path.join(dir, 'main.ts');
fs.writeFileSync(path.join(dir, 'zinc.json'), JSON.stringify({ name: 'core-cli', entry: 'main.ts', targets: { macos: { typing: 'strict' }, linux: { typing: 'strict' } } }));
const source = color => `import {onFrame, clear} from 'zinc:gfx'; let frame:i32=0; onFrame((dt:number):void=>{frame++; clear(${color}); console.log('color',frame+${color}-1);});`;
fs.writeFileSync(entry, source(17));
const invoke = (cmd, extra = [], env = {}) => spawnSync(process.execPath, [cli, cmd, entry, '--engine', 'zinc-vm', '--headless', ...extra], { encoding: 'utf8', env: { ...process.env, ZINC_FRAMES: '1', ZINC_LOG_FORMAT: '', ...env }, timeout: 120000 });
const checked = run => { assert.equal(run.status, 0, run.stdout + run.stderr); return run; };
const built = checked(invoke('build', ['--print-exe', '--json']));
const [runner] = JSON.parse(built.stdout), core = path.resolve(path.dirname(runner), '..');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = ['cmake/app', 'CMakeLists.txt', 'zinc_abi_generated.h', 'zinc_resources.cpp', 'engine.json'];
const snapshot = () => files.map(file => [file, hash(path.join(core, file)), fs.statSync(path.join(core, file)).mtimeMs]);
const before = snapshot();
const bin = path.join(dir, 'bin');fs.mkdirSync(bin);
fs.writeFileSync(path.join(bin, 'cmake'), '#!/bin/sh\necho unexpected-CMake >&2\nexit 99\n', { mode: 0o755 });
const env = { PATH: bin + path.delimiter + process.env.PATH };
const flags = ['--core', core];
assert.match(checked(invoke('run', flags, env)).stdout, /color 17/);
fs.writeFileSync(entry, source(34));
assert.match(checked(invoke('run', [...flags, '--jit'], env)).stdout, /color 34/);
const reject = (extra, expected) => { const result = invoke('build', [...flags, ...extra], env);assert.notEqual(result.status, 0);assert.match(result.stdout + result.stderr, expected); };
reject(['--debug'], /incompatible target, profile, graphics configuration or baked assets/);
fs.writeFileSync(entry, source(34) + "\nimport {exists} from 'zinc:fs'; console.log(exists('.'));\n");
reject([], /missing compatible export zinc:fs\/exists/);
fs.writeFileSync(entry, source(34) + "\nimport {font,drawText} from 'zinc:gfx';drawText(font('sans',20),0,0,'New font',0,255,0);\n");
reject([], /incompatible target, profile, graphics configuration or baked assets/);
fs.writeFileSync(entry, source(34));
// Existing dev watcher recreates the subprocess. No state/window preservation is promised.
const child = spawn(process.execPath, [cli, 'dev', entry, '--engine', 'zinc-vm', '--headless', ...flags], { env: { ...process.env, ...env, ZINC_FRAMES: '1', ZINC_LOG_FORMAT: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = ''; child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
async function until(text) { const start = Date.now();while (!output.includes(text)) { assert(Date.now() - start < 30000, output);await new Promise(resolve => setTimeout(resolve, 50)); } }
try { await until('color 34'); fs.writeFileSync(entry, source(51)); await until('color 51'); }
finally { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); }
assert(!output.includes('unexpected-CMake'), output);
assert.deepEqual(snapshot(), before, 'script compilation must leave the core unchanged');
console.log(JSON.stringify({ dir, coreUnchanged: true, restartedOnSave: true, noCmakeAfterCoreBuild: true }));
