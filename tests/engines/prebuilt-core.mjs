// Prototype: compile two forms scripts against one already built UI core.
// No CLI source modifications. Changing core exports or baked assets requires rebuilding the core.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadProgram } from '../../compiler/src/frontend.ts';
import { Sema } from '../../compiler/src/sema.ts';
import { emitAbi } from '../../compiler/src/abi.ts';
import { emitBytecode } from '../../compiler/src/emit-bc.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entry = path.join(root, 'examples/ui/forms/main.tsx');
const target = process.platform === 'darwin' ? 'macos' : 'linux';
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const core = path.resolve(option('--core') ?? path.join(root, 'examples/ui/forms/build', `zinc-vm-${target}-headless`));
const output = path.resolve(option('--out') ?? fs.mkdtempSync(path.join(os.tmpdir(), 'zinc-prebuilt-ui-')));
fs.mkdirSync(output, { recursive: true });
function command(argv, env = {}) {
  const run = spawnSync(argv[0], argv.slice(1), { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 120000, maxBuffer: 8 << 20 });
  if (run.error || run.status !== 0) throw new Error(`${argv.join(' ')}\n${run.error?.message ?? ''}\n${run.stdout ?? ''}${run.stderr ?? ''}`);
  return run.stdout;
}
if (!option('--core')) command([process.execPath, 'compiler/bin/zinc.mjs', 'build', entry, '--engine', 'zinc-vm', '--headless']);
const runner = path.join(core, 'cmake/app');
const manifest = JSON.parse(fs.readFileSync(path.join(core, 'core.abi.json'), 'utf8'));
const coreFiles = ['cmake/app', 'zinc_abi_generated.h', 'zinc_engine_config.h', 'zinc_resources.cpp', 'CMakeLists.txt'];
const hash = data => createHash('sha256').update(data).digest('hex');
const snapshot = () => Object.fromEntries(coreFiles.map(name => [name, { sha256: hash(fs.readFileSync(path.join(core, name))), mtimeMs: fs.statSync(path.join(core, name)).mtimeMs }]));
const before = snapshot();
const key = item => `${item.module}/${item.name}`;
const signatures = new Map(manifest.exports.map(item => [key(item), item]));
function compile(source, name) {
  const start = performance.now(), dir = path.join(output, name);fs.mkdirSync(dir, { recursive: true });
  const fe = loadProgram(entry, [], new Map([[entry, source]]));
  if (fe.tsDiagnostics.length) throw new Error(JSON.stringify(fe.tsDiagnostics));
  const sema = new Sema(fe, path.dirname(entry), { numberKind: 'f64', typing: 'strict', warnFloat: false, noFloat: false, heap0: false });
  const abi = emitAbi(sema, dir, target);
  const required = JSON.parse(fs.readFileSync(path.join(dir, 'core.abi.json'), 'utf8'));
  assert.equal(required.version, manifest.version, 'core ABI version differs');
  for (const item of required.exports) {
    const provided = signatures.get(key(item));
    if (!provided || JSON.stringify(provided) !== JSON.stringify(item)) throw new Error(`prebuilt core is missing a compatible export: ${key(item)}`);
  }
  const bundle = path.join(dir, 'app.zbc');fs.writeFileSync(bundle, emitBytecode(sema, abi));
  return { name, bundle, compileMs: performance.now() - start, bytecodeBytes: fs.statSync(bundle).size };
}
const smoke = args.includes('--smoke');
const source = smoke ? `import { onFrame, clear, rrect, drawText, font } from 'zinc:gfx';
let frame: i32 = 0;
onFrame((dt: number): void => { frame++; clear(0x020617); rrect(24,24,240,80,8,0x334155,255); drawText(font('sans',16),40,48,'Ready',0xffffff,255,0); if(frame===2)console.log('rendered',frame); });`
  : fs.readFileSync(entry, 'utf8');
const original = smoke ? '0x334155' : 'bg-slate-950', replacement = smoke ? '0x7f1d1d' : 'bg-red-950';
assert(source.includes(original), 'forms fixture changed; select another resource-neutral color edit');
const programs = [compile(source, smoke ? 'smoke' : 'forms'), compile(source.replaceAll(original, replacement), smoke ? 'smoke-red' : 'forms-red')];
let missingRejected = false;
try { compile(source + "\nimport { exists as coreMissingExists } from 'zinc:fs'; console.log(coreMissingExists('.'));\n", 'missing-export'); }
catch (error) { if (!String(error).includes('prebuilt core is missing a compatible export: zinc:fs/exists')) throw error; missingRejected = true; }
assert(missingRejected, 'missing core exports must be rejected before execution');
for (const program of programs) {
  const dir = path.join(output, program.name), start = performance.now();
  program.stdout = command([runner, program.bundle], { ZINC_DETERMINISTIC: '1', ZINC_FIXED_DT: String(1 / 60), ZINC_FRAMES: '2', ZINC_SHOT: path.join(dir, 'frame.png'), ZINC_SHOT_FRAMES: '2', ZINC_RESIZE: 'letterbox', ZINC_CLIPBOARD: 'local', ZINC_DEMO: '1', ZINC_LOG_FORMAT: '' });
  program.runMs = performance.now() - start;
  const shots = fs.readdirSync(dir).filter(name => name.endsWith('.png'));assert.equal(shots.length, 1, 'UI core must render a real frame');
  program.capture = path.join(dir, shots[0]);program.captureSha256 = hash(fs.readFileSync(program.capture));
}
assert.notEqual(programs[0].captureSha256, programs[1].captureSha256, 'new script must change rendered pixels');
assert.deepEqual(snapshot(), before, 'script builds and runs must not modify or rebuild the core');
const report = { prototype: 'prebuilt UI core, script-only recompilation, process restart', core, coreFiles: before, missingExportRejected: missingRejected, programs };
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, programs, coreUnchanged: true }, null, 2));
