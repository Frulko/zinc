// Real engines, same sources, byte-exact stdout; build time is excluded from --bench.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../..', import.meta.url));
const engines = ['native', 'zinc-vm', ...(process.arch === 'arm64' ? ['zinc-vm-jit'] : []), 'quickjs'];
const flags = e => ['--engine', e === 'zinc-vm-jit' ? 'zinc-vm' : e, ...(e === 'zinc-vm-jit' ? ['--vm-tier=1'] : [])];
const target = process.platform === 'darwin' ? 'macos' : 'linux';
function run(exe, args, extra = {}) {
  const r = spawnSync(exe, args, { cwd: root, encoding: 'utf8', timeout: 120000, env: { ...process.env, ZINC_LOG_FORMAT: 'plain' }, ...extra });
  assert.equal(r.error, undefined, r.error?.message);
  assert.equal(r.signal, null, `${exe}: ${r.signal}\n${r.stderr}`);
  assert.equal(r.status, 0, `${exe} ${args.join(' ')}\n${r.stderr}`);
  return r.stdout;
}
function command(source, engine) {
  const jit = engine === 'zinc-vm-jit';
  if (jit) engine = 'zinc-vm';
  const stem = path.basename(source).replace(/\.[jt]s$/, '');
  const dir = path.resolve(root, path.dirname(source), 'build', `${engine === 'native' ? '' : engine + '-'}${stem}-${target}`);
  const entry = engine === 'native' ? null : JSON.parse(fs.readFileSync(path.join(dir, 'engine.json'), 'utf8')).entry;
  return [path.join(dir, 'cmake/app'), ...(entry ? [path.join(dir, entry)] : []), ...(jit ? ['--jit'] : [])];
}
if (!process.argv.includes('--bench-only')) {
for (const source of ['tests/engines/scalar.ts', 'tests/engines/math.ts', 'tests/engines/stdlib-path.ts', 'tests/engines/default-arguments.ts', 'tests/engines/native.ts', 'tests/engines/plain.js', 'tests/engines/modules.ts', 'tests/engines/heap.ts', 'tests/engines/collections.ts', 'tests/engines/splice.ts', 'tests/engines/array-slice.ts', 'tests/engines/array-sort.ts', 'tests/engines/array-methods.ts', 'tests/engines/string-arrays.ts', 'tests/engines/string-expansion.ts', 'tests/engines/closures.ts', 'tests/engines/bind.ts', 'tests/engines/classes.ts', 'tests/engines/generics.ts', 'tests/engines/accessors.ts', 'tests/engines/static-fields.ts', 'tests/engines/destructuring.ts', 'tests/engines/exceptions.ts', 'tests/engines/async.ts', 'tests/engines/async-control.ts', 'tests/engines/promise-jobs.ts', 'tests/engines/promise-timers.ts', 'tests/engines/promise-all.ts', 'tests/engines/promise-chains.ts', 'tests/engines/promise-order.ts', 'tests/engines/generators.ts', 'tests/engines/generator-close.ts', 'tests/engines/generator-delegate.ts', 'tests/engines/resources.ts', 'tests/engines/callbacks.ts', 'tests/engines/strings.ts', 'tests/engines/services.ts', 'tests/engines/bytes.ts', 'tests/engines/records.ts', 'tests/engines/events.ts']) {
  let expected;
  const modes = source.endsWith('async-control.ts') ? engines.filter(e => e !== 'native') : engines;
  for (const engine of modes) {
    const out = run(process.execPath, ['compiler/bin/zinc.mjs', 'run', source, ...flags(engine)]);
    expected ??= out; assert.equal(out, expected, `${source}: ${engine}`);
    if (source === 'tests/engines/async.ts') assert.equal(out, 'start 3\nstart 4\nstart 5\nsync\nfirst observer 10\nsecond observer 10\nresults 6 8\ncaught async failure\ncollected alive 4516500\n');
    if (source === 'tests/engines/async-control.ts') assert.equal(out, 'sync\ninner finally\ncaught rejected\nouter finally 7\nrejections 1000\n');
    if (source === 'tests/engines/modules.ts') assert.equal(out, 'left 7\nright 20\n9 9 32 20 101\n12 13 13\n');
  }
  console.log(`ok ${source}: ${modes.length} modes agree`);
}
run(process.execPath, ['tests/engines/matrix.mjs', 'tests/engines/graphics.ts', '--capture', '--frames', '2', '--out', 'tests/engines/build/graphics-matrix.json']);
console.log('ok real graphics captures: all modes match native');
run(process.execPath, ['tests/engines/destructuring-check.mjs']);
run(process.execPath, ['tests/engines/generics-check.mjs']);
run(process.execPath, ['tests/engines/array-limits.mjs']);
run(process.execPath, ['tests/engines/string-limits.mjs']);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zinc-engines-'));
try {
  fs.writeFileSync(path.join(tmp, 'cycle-a.ts'), "import './cycle-b'; console.log('a');");
  fs.writeFileSync(path.join(tmp, 'cycle-b.ts'), "import './cycle-a'; console.log('b');");
  const cyclic = spawnSync(process.execPath, ['compiler/bin/zinc.mjs', 'build', path.join(tmp, 'cycle-a.ts'), '--engine', 'zinc-vm'], { cwd: root, encoding: 'utf8', timeout: 120000 });
  assert.equal(cyclic.error, undefined); assert.equal(cyclic.signal, null); assert.notEqual(cyclic.status, 0);
  assert.match(cyclic.stderr, /cyclic module initialization/);
  const collectionsCheck = path.join(tmp, 'collections-check');
  run(process.env.CXX ?? 'c++', ['-std=c++17', '-fno-rtti', 'tests/engines/collections.cpp', '-Iruntime/include', '-Iruntime', path.join(path.dirname(command('tests/engines/collections.ts', 'zinc-vm')[0]), 'libzrt.a'), '-o', collectionsCheck]);run(collectionsCheck, []);
  const resourceCheck = path.join(tmp, 'resource-check');
  run(process.env.CXX ?? 'c++', ['-std=c++17', 'tests/engines/resources.cpp', '-o', resourceCheck]);run(resourceCheck, []);
  const abiCheck = path.join(tmp, 'abi-check');
  run(process.env.CXX ?? 'c++', ['-std=c++17', 'tests/engines/abi.cpp', '-o', abiCheck, ...(process.platform === 'linux' ? ['-ldl'] : [])]);
  run(abiCheck, []);
  const bytesCheck = path.join(tmp, 'bytes-check');
  run(process.env.CXX ?? 'c++', ['-std=c++17', 'tests/engines/bytes.cpp', '-o', bytesCheck, ...(process.platform === 'linux' ? ['-ldl'] : [])]);run(bytesCheck, []);
  const recordsCheck = path.join(tmp, 'records-check');
  run(process.env.CXX ?? 'c++', ['-std=c++17', 'tests/engines/records.cpp', '-o', recordsCheck, ...(process.platform === 'linux' ? ['-ldl'] : [])]);run(recordsCheck, []);
  const dynamic = path.join(tmp, process.platform === 'darwin' ? 'sensor.dylib' : 'sensor.so');
  const shared = process.platform === 'darwin' ? ['-dynamiclib'] : ['-shared', '-fPIC'];
  run(process.env.CC ?? 'cc', [...shared, 'tests/engines/dynamic.c', '-o', dynamic]);
  for (const engine of engines.filter(e => e !== 'native')) {
    const [exe, ...args] = command('tests/engines/native.ts', engine);
    const r = spawnSync(exe, [...args, '--native-library', dynamic], { encoding: 'utf8', timeout: 5000 });
    assert.equal(r.error, undefined);assert.equal(r.signal, null);assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'DYNAMIC\n40.25\n41.25\n');assert.equal(r.stderr, 'dispose\nunload\n');
    const duplicate = spawnSync(exe, [...args, '--native-library', dynamic, '--native-library', dynamic], { encoding: 'utf8', timeout: 5000 });
    assert.equal(duplicate.error, undefined);assert.equal(duplicate.signal, null);assert.equal(duplicate.status, 1);
    assert.match(duplicate.stderr, /duplicate native module/);
    assert.equal(duplicate.stderr.match(/^dispose$/gm)?.length, 2);assert.equal(duplicate.stderr.match(/^unload$/gm)?.length, 1);
    assert.ok(duplicate.stderr.lastIndexOf('dispose') < duplicate.stderr.indexOf('unload'));
  }
  assert.equal(run(process.execPath, ['compiler/bin/zinc.mjs', 'run', 'tests/engines/native.ts', '--engine', 'zinc-vm', '--native-library', dynamic]), 'DYNAMIC\n40.25\n41.25\n');
  const resourceLibrary = path.join(tmp, 'resources' + path.extname(dynamic));
  run(process.env.CC ?? 'cc', [...shared, 'tests/engines/dynamic-resources.c', '-o', resourceLibrary]);
  for (const engine of engines.filter(e => e !== 'native')) {
    const [exe, ...args] = command('tests/engines/resources.ts', engine);
    const r = spawnSync(exe, [...args, '--native-library', resourceLibrary], { encoding: 'utf8', timeout: 10000 });
    assert.equal(r.error, undefined);assert.equal(r.signal, null);assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'identity true 4 1\nshared 9\ncollected 4999950000 9\n');
    assert.equal(r.stderr, 'dispose alive=0\nunload resources\n');
  }
  const [resourceQjs] = command('tests/engines/resources.ts', 'quickjs');
  for (const value of ['null', '{}', '1', 'new Proxy({}, {})']) {
    const file = path.join(tmp, 'invalid-resource.mjs');
    fs.writeFileSync(file, `import Store from 'zinc:native/Store'; Store.get(${value});`);
    const r = spawnSync(resourceQjs, [file], { encoding: 'utf8', timeout: 5000 });
    assert.equal(r.error, undefined);assert.equal(r.signal, null);assert.equal(r.status, 1, r.stderr);
  }
  for (const [flag, message, disposals] of [['NO_ENTRY', /native library entry/, 0], ['FAIL_OPEN', /initialization failed/, 0], ['BAD_SIGNATURE', /signature mismatch/, 1]]) {
    const file = path.join(tmp, flag + path.extname(dynamic));
    run(process.env.CC ?? 'cc', [...shared, '-D' + flag, 'tests/engines/dynamic.c', '-o', file]);
    for (const engine of engines.filter(e => e !== 'native')) {
      const [exe, ...args] = command('tests/engines/native.ts', engine);
      const r = spawnSync(exe, [...args, '--native-library', file], { encoding: 'utf8', timeout: 5000 });
      assert.equal(r.error, undefined);assert.equal(r.signal, null);assert.equal(r.status, 1);assert.match(r.stderr, message);
      assert.equal(r.stderr.match(/^dispose$/gm)?.length ?? 0, disposals);assert.match(r.stderr, /^unload$/m);
    }
  }
  const [vm, bundle] = command('tests/engines/scalar.ts', 'zinc-vm');
  const bytes = fs.readFileSync(bundle);
  for (const [name, data] of [['magic', Buffer.from('BAD!')], ['truncated', bytes.subarray(0, bytes.length - 1)], ['trailing', Buffer.concat([bytes, Buffer.from([0])])]]) {
    const file = path.join(tmp, name + '.zbc'); fs.writeFileSync(file, data);
    const r = spawnSync(vm, [file], { encoding: 'utf8', timeout: 1000 });
    assert.equal(r.signal, null); assert.equal(r.status, 1, `${name}: must reject invalid bytecode`);
  }
  // Decode only the container boundaries to mutate real instructions, not a mock VM.
  function instructionOffsets(bytes) {
    let at = 8;
    const u = () => { const n = bytes.readUInt32LE(at); at += 4; return n; };
    const skipString = () => { const n = u(); at += n; };
    { const n = u(); at += n * 4; }
    for (let n = u(); n > 0; n--) { if (u() === 6) skipString(); else at += 8; }
    for (let n = u(); n > 0; n--) { skipString(); skipString(); const count = u(); at += count * 4 + 4; }
    for (let n = u(); n > 0; n--) { u(); const count = u(); at += count * 8; const methods = u(); at += methods * 8; }
    const fnCount = u(), entry = u(), offsets = [], entryOffsets = [];
    for (let fn = 0; fn < fnCount; fn++) {
      const regs = u(), params = u(); u(); const count = u(), captures = u(), handlers = u(); at += (regs + params + captures) * 4;
      for (let i = 0; i < count; i++) { offsets.push(at); if (fn === entry) entryOffsets.push(at); at += 16; }
      at += handlers * 8;
    }
    return { offsets, entryOffsets };
  }
  const { offsets, entryOffsets } = instructionOffsets(bytes);
  for (let sample = 0; sample < 24; sample++) {
    const changed = Buffer.from(bytes), offset = offsets[(sample * 17) % offsets.length];
    changed[offset + (sample % 16)] ^= 1 << (sample % 8);
    const file = path.join(tmp, 'mutated.zbc'); fs.writeFileSync(file, changed);
    for (const jit of process.arch === 'arm64' ? [false, true] : [false]) {
      const r = spawnSync(vm, [file, ...(jit ? ['--jit'] : [])], { encoding: 'utf8', timeout: 2000, env: { ...process.env, ZINC_EXECUTION_TIMEOUT_MS: '30' } });
      assert.equal(r.error, undefined); assert.equal(r.signal, null); assert.ok(r.status === 0 || r.status === 1, r.stderr);
    }
  }
  // New container/callback instructions must reject forged register indexes before execution.
  for (const [source, opcode] of [['collections', 69], ['generator-close', 70], ['bind', 71], ['string-arrays', 65], ['string-arrays', 68], ['array-slice', 67]]) {
    const [exe, bundle] = command(`tests/engines/${source}.ts`, 'zinc-vm');
    const original = fs.readFileSync(bundle), candidates = instructionOffsets(original).offsets.filter(offset => original[offset] === opcode);
    assert.ok(candidates.length, `${source}: expected opcode ${opcode}`);
    for (const offset of candidates.slice(0, 3)) {
      const changed = Buffer.from(original); changed.writeUInt32LE(0xffffffff, offset + 4);
      const file = path.join(tmp, 'invalid-register.zbc'); fs.writeFileSync(file, changed);
      for (const jit of process.arch === 'arm64' ? [false, true] : [false]) {
        const r = spawnSync(exe, [file, ...(jit ? ['--jit'] : [])], { encoding: 'utf8', timeout: 2000 });
        assert.equal(r.error, undefined); assert.equal(r.signal, null); assert.equal(r.status, 1); assert.match(r.stderr, /bytecode verification failed/);
      }
    }
  }
  const jump = entryOffsets.find(offset => bytes[offset] === 25);
  assert.notEqual(jump, undefined);
  const loop = Buffer.from(bytes), entryStart = entryOffsets[0];
  loop.writeUInt32LE((jump - entryStart) / 16, jump + 4);
  const loopFile = path.join(tmp, 'loop.zbc'); fs.writeFileSync(loopFile, loop);
  for (const jit of process.arch === 'arm64' ? [false, true] : [false]) {
    const r = spawnSync(vm, [loopFile, ...(jit ? ['--jit'] : [])], { encoding: 'utf8', timeout: 2000, env: { ...process.env, ZINC_EXECUTION_TIMEOUT_MS: '20' } });
    assert.equal(r.error, undefined); assert.equal(r.signal, null); assert.equal(r.status, 1); assert.match(r.stderr, /timed out/);
  }
  for (const source of ['tests/engines/heap.ts', 'tests/engines/collections.ts', 'tests/engines/splice.ts', 'tests/engines/array-slice.ts', 'tests/engines/array-sort.ts', 'tests/engines/array-methods.ts', 'tests/engines/string-arrays.ts', 'tests/engines/string-expansion.ts', 'tests/engines/closures.ts', 'tests/engines/bind.ts', 'tests/engines/classes.ts', 'tests/engines/generics.ts', 'tests/engines/accessors.ts', 'tests/engines/static-fields.ts', 'tests/engines/destructuring.ts', 'tests/engines/exceptions.ts', 'tests/engines/async.ts', 'tests/engines/async-control.ts', 'tests/engines/promise-jobs.ts', 'tests/engines/promise-timers.ts', 'tests/engines/promise-all.ts', 'tests/engines/promise-chains.ts', 'tests/engines/generators.ts', 'tests/engines/generator-close.ts', 'tests/engines/resources.ts', 'tests/engines/callbacks.ts', 'tests/engines/strings.ts', 'tests/engines/bytes.ts', 'tests/engines/records.ts']) for (const engine of engines.filter(e => e.startsWith('zinc-vm'))) {
    const [exe, ...args] = command(source, engine);
    const r = spawnSync(exe, args, { encoding: 'utf8', timeout: 10000, env: { ...process.env, ZINC_VM_HEAP_BYTES: '65536', ZINC_VM_STATS: '1' } });
    assert.equal(r.error, undefined); assert.equal(r.signal, null); assert.equal(r.status, 0, r.stderr);
    const stats = JSON.parse(r.stderr.trim()); assert.ok(stats.collections > 0, `${source} ${engine}: must exercise collection`); assert.ok(stats.peakHeapBytes <= 65536);
  }
  for (const [name, source, message] of [
    ['fraction-index', 'const a: i32[] = [1]; const i: number = 0.5; console.log(a[i]);', /non-integer array index/],
    ['bounds-index', 'const a: i32[] = [1]; console.log(a[2]);', /array index out of bounds/],
    ['null-object', 'interface A { x: i32; } let a: A | null = null; console.log(a!.x);', /null VM object/],
    ['async-timeout', 'async function spin(): Promise<void> { while (true) await Promise.resolve(); } spin();', /timed out/],
    ['unhandled-async', "async function fail(): Promise<void> { await Promise.resolve(); throw new Error('unhandled'); } fail();", /unhandled VM promise rejection/],
    ['uncaught-guest', "throw new Error('unhandled');", /uncaught guest exception/],
    ['heap-limit', 'const a: i32[] = []; for (let i: i32 = 0; i < 100000; i++) a.push(i);', /heap memory limit/],
  ]) {
    const file = path.join(tmp, name + '.ts'); fs.writeFileSync(file, source);
    run(process.execPath, ['compiler/bin/zinc.mjs', 'build', file, '--engine', 'zinc-vm']);
    for (const engine of engines.filter(e => e.startsWith('zinc-vm'))) {
      const [exe, ...args] = command(file, engine);
      const r = spawnSync(exe, args, { encoding: 'utf8', timeout: 5000, env: { ...process.env, ZINC_VM_HEAP_BYTES: '65536', ...(name === 'async-timeout' ? { ZINC_EXECUTION_TIMEOUT_MS: '30' } : {}) } });
      assert.equal(r.error, undefined); assert.equal(r.signal, null); assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, message);
    }
  }
  const [qjs] = command('tests/engines/native.ts', 'quickjs');
  for (const [name, source, expected] of [
    ['import', `import Sensor from 'zinc:native/Sensor'; console.log(Sensor.serial());`, 'HOST-0001\n'],
    ['dynamic-import', `const {default: Sensor} = await import('zinc:native/Sensor'); console.log(Sensor.temperature());`, '21.75\n'],
    ['jobs', `await Promise.resolve(); console.log('settled');`, 'settled\n'],
  ]) {
    const file = path.join(tmp, name + '.mjs'); fs.writeFileSync(file, source); assert.equal(run(qjs, [file]), expected);
  }
  for (const [name, source] of [
    ['unknown', `await import('zinc:not-registered');`],
    ['reject', `Promise.reject(new Error('expected rejection'));`],
    ['argument', `import Sensor from 'zinc:native/Sensor'; Sensor.setLed();`],
    ['timeout', `while(true){}`],
  ]) {
    const file = path.join(tmp, name + '.mjs'); fs.writeFileSync(file, source);
    const r = spawnSync(qjs, [file], { encoding: 'utf8', timeout: 2000, env: { ...process.env, ZINC_EXECUTION_TIMEOUT_MS: '20' } });
    assert.equal(r.error, undefined); assert.equal(r.signal, null); assert.equal(r.status, 1, `${name}: must fail`);
  }
  console.log('ok verifier, collected heaps, exceptions, bounds, native import/load, promise jobs, rejection, arity and timeout');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
if (process.argv.includes('--bench') || process.argv.includes('--bench-only')) {
  const reports = [];
  for (const [source, expected] of [['tests/bench/kernels/fib.ts', '2178309\n'], ['tests/bench/kernels/mandelbrot.ts', '6095446\n'], ['tests/engines/bridge-bench.ts', '1252162500\n'], ['tests/engines/callback-bench.ts', '5000050000\n']]) {
    const samples = Object.fromEntries(engines.map(e => [e, []]));
    for (const engine of engines) run(process.execPath, ['compiler/bin/zinc.mjs', 'build', source, ...flags(engine)]);
    for (let round = -1; round < 7; round++) for (let i = 0; i < engines.length; i++) {
      const engine = engines[(i + round + engines.length) % engines.length], [exe, ...args] = command(source, engine);
      const start = performance.now(), out = run(exe, args), ms = performance.now() - start;
      assert.equal(out, expected); if (round >= 0) samples[engine].push(ms);
    }
    const medians = Object.fromEntries(engines.map(e => [e, [...samples[e]].sort((a,b)=>a-b)[3]]));
    const artifacts = Object.fromEntries(engines.map(engine => {
      const [exe, file] = command(source, engine);
      const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      return [engine, { executable: hash(exe), ...(file ? { program: hash(file) } : {}) }];
    }));
    reports.push({ source, samples, medians, artifacts });
    console.log(source, medians);
  }
  const compiler = run(process.env.CXX ?? 'c++', ['--version']).split('\n')[0];
  const quickjs = fs.readFileSync(path.join(root, 'plugins/script/vendor/quickjs/quickjs.h'), 'utf8');
  const quickjsVersion = ['MAJOR', 'MINOR', 'PATCH'].map(k => quickjs.match(new RegExp('QJS_VERSION_' + k + ' (\\d+)'))[1]).join('.');
  const report = { compiler, quickjsVersion, node: process.version, revision: run('git', ['rev-parse', 'HEAD']).trim(), dirty: run('git', ['status', '--porcelain']).length > 0, date: new Date().toISOString(), platform: process.platform, arch: process.arch, cpu: os.cpus()[0].model, metric: 'spawn-to-exit ms, build excluded, one warmup + seven interleaved runs', reports };
  const file = path.join(root, 'tests/engines/build/benchmark.json');
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  console.log(`raw samples: ${file}`);
}
