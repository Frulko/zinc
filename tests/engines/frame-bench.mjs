// Real SDL rasterization with the dummy display, shared native profiler, no build time in samples.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../..', import.meta.url));
const output = path.join(root, 'tests/engines/build/frame-benchmark.json');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zinc-frames-'));
const frames = 600, warmup = 60, rounds = 3;
const engines = ['native', 'zinc-vm', ...(process.arch === 'arm64' ? ['zinc-vm-jit'] : []), 'quickjs'];
const env = { ...process.env, SDL_VIDEO_DRIVER: 'dummy', ZINC_DETERMINISTIC: '1', ZINC_FIXED_DT: String(1 / 60),
  ZINC_FRAMES: String(frames), ZINC_LOG_FORMAT: '', ZINC_PROFILE: '1' };
function run(exe, args, extra = {}) {
  const start = performance.now();
  const r = spawnSync(exe, args, { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 16 << 20, env: { ...env, ...extra } });
  assert.equal(r.error, undefined); assert.equal(r.signal, null); assert.equal(r.status, 0, r.stderr);
  return { ...r, elapsedMs: performance.now() - start };
}
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const stats = values => {
  const v = [...values].sort((a, b) => a - b);
  return { samples: v.length, p50Us: v[Math.floor((v.length - 1) * .5)], p99Us: v[Math.floor((v.length - 1) * .99)], maxUs: v.at(-1) };
};
try {
  const commands = new Map();
  for (const engine of engines) {
    const flags = ['--engine', engine === 'zinc-vm-jit' ? 'zinc-vm' : engine, ...(engine === 'zinc-vm-jit' ? ['--jit'] : [])];
    const result = run(process.execPath, ['compiler/bin/zinc.mjs', 'build', 'tests/engines/graphics.ts', ...flags, '--print-exe', '--json']);
    commands.set(engine, JSON.parse(result.stdout.trim().split('\n').at(-1)));
  }
  const report = { date: new Date().toISOString(), platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model,
    backend: 'SDL3 dummy, actual rasterization', source: 'tests/engines/graphics.ts', sourceSha256: hash(path.join(root, 'tests/engines/graphics.ts')),
    frames, warmup, rounds, units: 'microseconds', results: [] };
  let expected;
  for (let round = 0; round < rounds; round++) for (const engine of engines) {
    const traceFile = path.join(dir, `${engine}-${round}.json`), command = commands.get(engine);
    const r = run(command[0], command.slice(1), { ZINC_TRACE: traceFile });
    expected ??= r.stdout; assert.equal(r.stdout, expected, engine);
    const spans = JSON.parse(fs.readFileSync(traceFile, 'utf8')).filter(s => s.ph === 'X' && s.tid === 1);
    const allFrames = spans.filter(s => s.name === 'zinc frame');
    assert.equal(allFrames.length, frames, `${engine}: profiler must cover every frame`);
    const start = allFrames[warmup].ts;
    const phases = {};
    for (const name of ['zinc frame', 'effects', 'diff', 'raster', 'present']) {
      const durations = spans.filter(s => s.name === name && s.ts >= start).map(s => s.dur);
      assert.ok(durations.length, `${engine}: missing real ${name} samples`);
      phases[name] = { ...stats(durations), rawUs: durations };
    }
    report.results.push({ engine, round, executableSha256: hash(command[0]), elapsedMs: r.elapsedMs, phases });
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(`${engine} round ${round + 1}: frame p50=${phases['zinc frame'].p50Us}µs`);
  }
  console.log(output);
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
