// Real demo builds/execution. Unsupported operations remain failures with compiler diagnostics.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cli = path.join(root, 'compiler/bin/zinc.mjs');
const args = process.argv.slice(2);
const values = {}, selected = [];
for (let i = 0; i < args.length; i++) {
  if (['--out', '--engine', '--timeout', '--frames'].includes(args[i])) {
    const key = args[i++]; if (!args[i]) throw new Error(`${key} requires a value`); values[key] = args[i];
  } else if (!args[i].startsWith('-')) selected.push(path.resolve(args[i]));
  else if (!['--run', '--capture', '--list'].includes(args[i])) throw new Error(`unknown option ${args[i]}`);
}
const engines = values['--engine']?.split(',') ?? ['native', 'zinc-vm', ...(process.arch === 'arm64' ? ['zinc-vm-jit'] : []), 'quickjs'];
if (engines.some(engine => !['native', 'zinc-vm', 'zinc-vm-jit', 'quickjs'].includes(engine))) throw new Error('unknown engine');
const timeout = Number(values['--timeout'] ?? 120000), frames = Number(values['--frames'] ?? 60);
if (!Number.isSafeInteger(timeout) || timeout < 1 || !Number.isSafeInteger(frames) || frames < 1) throw new Error('timeout/frames must be positive integers');
const mode = args.includes('--capture') ? 'capture' : args.includes('--run') ? 'run' : 'build';
const programs = new Map();
function discover(dir) {
  const project = path.join(dir, 'zinc.json');
  if (fs.existsSync(project)) {
    const config = JSON.parse(fs.readFileSync(project, 'utf8'));
    const entry = path.resolve(dir, config.entry ?? (fs.existsSync(path.join(dir, 'src/main.tsx')) ? 'src/main.tsx' : 'src/main.ts'));
    programs.set(entry, { entry, project: dir, demo: config.bench?.demo });
  }
  for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['build', 'dist', 'node_modules', 'assets', 'vendor'].includes(item.name) || item.name.startsWith('.')) continue;
    const file = path.join(dir, item.name);
    if (item.isDirectory()) discover(file);
    else if (/^main\.[jt]sx?$/.test(item.name) && !programs.has(file)) {
      // Configured programs have one chosen entry; alternate main-react.ts files are not standalone projects.
      if (![...programs.values()].some(p => file.startsWith(p.project + path.sep))) programs.set(file, { entry: file, project: dir });
    }
  }
}
for (const file of selected.length ? selected : [path.join(root, 'examples')]) {
  if (fs.statSync(file).isDirectory()) discover(file);
  else programs.set(file, { entry: file, project: path.dirname(file) });
}
const entries = [...programs.values()].sort((a, b) => a.entry.localeCompare(b.entry));
if (args.includes('--list')) { console.log(entries.map(p => path.relative(root, p.entry)).join('\n')); process.exit(0); }
const output = path.resolve(values['--out'] ?? path.join(root, 'tests/engines/build/demo-matrix.json'));
fs.mkdirSync(path.dirname(output), { recursive: true });
const report = { date: new Date().toISOString(), mode, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model,
  node: process.version, frames, timeout, engines, results: [] };
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
const sha = data => createHash('sha256').update(data).digest('hex');
const env = { ...process.env, ZINC_DETERMINISTIC: '1', ZINC_FIXED_DT: String(1 / 60), ZINC_RESIZE: 'letterbox',
  ZINC_CLIPBOARD: 'local', ZINC_FRAMES: String(frames), ZINC_EXECUTION_TIMEOUT_MS: String(timeout), ZINC_LOG_FORMAT: '', SDL_VIDEO_DRIVER: 'dummy' };
function execute(command, argv, extra = {}) {
  const start = performance.now();
  const result = spawnSync(command, argv, { cwd: root, encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 16 << 20, env: { ...env, ...extra } });
  return { ms: performance.now() - start, status: result.status, signal: result.signal, error: result.error?.message,
    stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
for (const program of entries) for (const engine of engines) {
  const engineArgs = ['--engine', engine === 'zinc-vm-jit' ? 'zinc-vm' : engine, ...(engine === 'zinc-vm-jit' ? ['--jit'] : [])];
  const result = { entry: path.relative(root, program.entry), engine, success: false };
  if (mode === 'capture') {
    const shots = path.join(path.dirname(output), 'matrix-shots', sha(program.entry).slice(0, 12), engine);
    fs.rmSync(shots, { recursive: true, force: true });
    result.capture = execute(process.execPath, [cli, 'capture', program.entry, ...engineArgs, '--frames', String(frames), '--out', shots], { ZINC_DEMO: program.demo ?? 'bench' });
    result.pixels = fs.existsSync(shots) ? fs.readdirSync(shots).filter(f => f.endsWith('.png')).sort().map(file => ({ file, sha256: sha(fs.readFileSync(path.join(shots, file))) })) : [];
    result.success = result.capture.status === 0 && result.pixels.length > 0;
  } else {
    result.build = execute(process.execPath, [cli, 'build', program.entry, ...engineArgs, '--print-exe', '--json']);
    result.success = result.build.status === 0;
    if (result.success && mode === 'run') {
      const command = JSON.parse(result.build.stdout.trim().split('\n').at(-1));
      result.run = execute(command[0], command.slice(1), { ZINC_DEMO: program.demo ?? 'bench' });
      result.success = result.run.status === 0;
      result.stdoutSha256 = sha(result.run.stdout);
    }
  }
  report.results.push(result); save();
  console.log(`${result.success ? 'ok  ' : 'FAIL'} ${result.entry} [${engine}] ${mode}`);
}
for (const program of entries) {
  const rows = report.results.filter(row => row.entry === path.relative(root, program.entry));
  const reference = rows.find(row => row.engine === 'native' && row.success);
  for (const row of rows) if (reference && row.success) {
    if (mode === 'run') row.stdoutMatchesNative = row.stdoutSha256 === reference.stdoutSha256;
    if (mode === 'capture') row.pixelsMatchNative = JSON.stringify(row.pixels) === JSON.stringify(reference.pixels);
  }
}
report.summary = Object.fromEntries(engines.map(engine => {
  const rows = report.results.filter(row => row.engine === engine);
  return [engine, { attempted: rows.length, succeeded: rows.filter(row => row.success).length,
    mismatched: rows.filter(row => row.stdoutMatchesNative === false || row.pixelsMatchNative === false).length }];
}));
save();
const failed = report.results.filter(row => !row.success || row.stdoutMatchesNative === false || row.pixelsMatchNative === false).length;
console.log(`${report.results.length} real attempts, ${failed} failures/mismatches; ${output}`);
process.exitCode = failed ? 1 : 0;
