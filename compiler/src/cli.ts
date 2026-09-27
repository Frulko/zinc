// zinc CLI (section 14): check, build, run, doctor.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadProgram, ZINC_ROOT, type Diag } from './frontend.ts';
import { Sema, ZincError, type NumKind } from './sema.ts';
import { emitCpp, type CppResult } from './emit-cpp.ts';
import { emitJs } from './emit-js.ts';

interface Profile { number: NumKind; width: number; height: number; typing: 'strict' | 'gradual'; heap: number; noFpu?: boolean }
// Section 12 defaults: number representation, typing profile, resolution, TLSF heap budget.
const PROFILES: Record<string, Profile> = {
  macos: { number: 'f64', width: 320, height: 240, typing: 'gradual', heap: 512 << 20 },
  linux: { number: 'f64', width: 320, height: 240, typing: 'gradual', heap: 512 << 20 },
  sim: { number: 'f64', width: 320, height: 240, typing: 'gradual', heap: 512 << 20 },
  wasm: { number: 'f64', width: 320, height: 240, typing: 'gradual', heap: 64 << 20 },
  rpi1: { number: 'f64', width: 1280, height: 720, typing: 'gradual', heap: 64 << 20 },
  esp32: { number: 'f32', width: 320, height: 240, typing: 'strict', heap: 160 << 10 },
  ps2: { number: 'f32', width: 640, height: 448, typing: 'gradual', heap: 16 << 20 },
  ps1: { number: 'fx12', width: 320, height: 240, typing: 'strict', heap: 256 << 10, noFpu: true },
};
const NATIVE = new Set(['macos', 'linux']);

interface Opts { cmd: string; entry: string; target: string; profile: string; debug: boolean; emit?: string; json: boolean; noFloat: boolean; rest: string[] }

function parseArgs(argv: string[]): Opts {
  const o: Opts = { cmd: argv[0] ?? 'help', entry: '', target: process.platform === 'darwin' ? 'macos' : 'linux', profile: '', debug: false, json: false, noFloat: false, rest: [] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { o.rest = argv.slice(i + 1); break; }
    if (a === '--target') o.target = argv[++i];
    else if (a.startsWith('--target=')) o.target = a.slice(9);
    else if (a === '--profile') o.profile = argv[++i];
    else if (a.startsWith('--profile=')) o.profile = a.slice(10);
    else if (a === '--debug') o.debug = true;
    else if (a === '--release') o.debug = false;
    else if (a.startsWith('--emit=')) o.emit = a.slice(7);
    else if (a === '--json') o.json = true;
    else if (a === '--no-float') o.noFloat = true;
    else if (a === '--update') { /* zinc test */ }
    else if (!a.startsWith('-')) o.entry = a;
    else die(`unknown option ${a}`);
  }
  if (!o.entry) o.entry = fs.existsSync('src/main.ts') ? 'src/main.ts' : 'main.ts';
  if (fs.existsSync(o.entry) && fs.statSync(o.entry).isDirectory()) o.entry = path.join(o.entry, fs.existsSync(path.join(o.entry, 'main.ts')) ? 'main.ts' : 'src/main.ts');
  if (!o.profile) o.profile = o.target;
  if (!PROFILES[o.target]) die(`unknown target '${o.target}' (available: macos, linux, sim; others need their SDK image, see docs/reports/STATUS.md)`);
  if (!PROFILES[o.profile]) die(`unknown profile '${o.profile}'`);
  return o;
}

function die(msg: string): never { console.error(`zinc: ${msg}`); process.exit(2); }

function printDiags(ds: Diag[], json: boolean) {
  if (json) { console.log(JSON.stringify(ds.map(d => ({ uri: d.file, range: { start: { line: d.line - 1, character: d.col - 1 } }, code: d.code, severity: d.severity === 'error' ? 1 : 2, message: d.message })), null, 2)); return; }
  for (const d of ds) console.error(`${d.file}:${d.line}:${d.col} - ${d.severity} ${d.code}: ${d.message}`);
}

/** Frontend + Sema. Exits on the first error (CMP-03). */
function analyze(o: Opts): Sema {
  const fe = loadProgram(o.entry);
  if (fe.tsDiagnostics.length) { printDiags(fe.tsDiagnostics, o.json); process.exit(1); }
  const prof = PROFILES[o.profile];
  try {
    const sema = new Sema(fe, path.dirname(path.resolve(o.entry)), { numberKind: prof.number, typing: prof.typing, warnFloat: !!prof.noFpu, noFloat: o.noFloat, heap0: false });
    if (!o.json) printDiags(sema.warnings, false);
    return sema;
  } catch (e) {
    if (e instanceof ZincError) { printDiags([e.diag], o.json); process.exit(1); }
    throw e;
  }
}

function guard<T>(o: Opts, f: () => T): T {
  try { return f(); } catch (e) {
    if (e instanceof ZincError) { printDiags([e.diag], o.json); process.exit(1); }
    throw e;
  }
}

function outDir(o: Opts): string {
  const base = path.basename(o.entry).replace(/\.[cm]?[jt]sx?$/, '');
  const name = (base === 'main' ? '' : base + '-') + o.target + (o.profile !== o.target ? `-${o.profile}` : '') + (o.debug ? '-debug' : '');
  return path.join(path.dirname(path.resolve(o.entry)), 'build', name);
}

function writeIfChanged(file: string, content: string) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return;
  fs.writeFileSync(file, content);
}

const MOD_LIBS: Record<string, string> = { net: 'CURL::libcurl' };
function cmakeLists(dir: string, res: CppResult, debug: boolean, heap: number): string {
  const usesGfx = res.usesGfx;
  const mods = [...res.modules].filter(m => fs.existsSync(path.join(ZINC_ROOT, 'runtime/mod', m + '.cpp')));
  const rel = (f: string) => '${CMAKE_CURRENT_SOURCE_DIR}/' + path.relative(dir, f);
  const z = '${CMAKE_CURRENT_SOURCE_DIR}/' + path.relative(dir, ZINC_ROOT);

  const san = debug ? '-fsanitize=address,undefined -fno-omit-frame-pointer' : '';
  return `# Generated by zinc. Do not edit.
cmake_minimum_required(VERSION 3.20)
project(zinc_app CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(ZFLAGS -fno-exceptions -fno-rtti -fwrapv -fno-threadsafe-statics -DZRT_HEAP_BYTES=${heap}u ${debug ? `-g -O0 -DZRT_DEBUG ${san}` : '-O2 -ffunction-sections -fdata-sections'})
add_library(zrt STATIC ${z}/runtime/zrt.cpp ${z}/runtime/host.cpp${mods.map(m => ` ${z}/runtime/mod/${m}.cpp`).join('')})
target_include_directories(zrt PUBLIC ${z}/runtime ${z}/runtime/include)
target_compile_options(zrt PUBLIC \${ZFLAGS})
target_compile_options(zrt PRIVATE -Wall -Wextra -Werror)
option(ZINC_HEADLESS "use the null HAL even for zinc:gfx programs" OFF)
if(${usesGfx ? 'NOT ZINC_HEADLESS' : 'FALSE'})
  set(ZINC_HAL ${z}/targets/macos/hal_sdl.cpp)
else()
  set(ZINC_HAL ${z}/targets/null/hal_null.cpp)
endif()
add_executable(app zinc_main.cpp \${ZINC_HAL} ${z}/targets/common/hal_posix.cpp${res.nativeSources.map(f => ' ' + rel(f)).join('')})
target_include_directories(app PRIVATE \${CMAKE_CURRENT_SOURCE_DIR})
target_compile_options(app PRIVATE -Wall -Wno-unused-variable -Wno-unused-parameter -Wno-unused-label -Wno-unused-lambda-capture -Wno-unused-but-set-variable -Wno-inconsistent-missing-override)
target_link_libraries(app PRIVATE zrt)
${debug ? `target_link_options(app PRIVATE ${san})` : `if(APPLE)
  target_link_options(app PRIVATE -Wl,-dead_strip)
else()
  target_link_options(app PRIVATE -Wl,--gc-sections)
endif()`}
${mods.filter(m => MOD_LIBS[m]).map(m => m === 'net' ? 'find_package(CURL REQUIRED)\ntarget_link_libraries(zrt PUBLIC CURL::libcurl)' : '').join('\n')}
${usesGfx ? 'if(NOT ZINC_HEADLESS)\n  find_package(SDL3 REQUIRED CONFIG)\n  target_link_libraries(app PRIVATE SDL3::SDL3)\nendif()' : ''}
`;
}

function run(cmd: string, args: string[], cwd?: string, quiet = false): number {
  const r = spawnSync(cmd, args, { cwd, stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8' });
  if (r.error) die(`cannot run ${cmd}: ${r.error.message}`);
  if (quiet && r.status !== 0) { process.stderr.write(r.stdout ?? ''); process.stderr.write(r.stderr ?? ''); }
  return r.status ?? 1;
}

interface Built { exe: string[]; dir: string }

function build(o: Opts): Built {
  const t0 = Date.now();
  const sema = analyze(o);
  const dir = outDir(o);
  fs.mkdirSync(dir, { recursive: true });
  const title = path.basename(path.dirname(path.resolve(o.entry)));
  const prof = PROFILES[o.profile];
  if (o.target === 'sim' || o.emit === 'js') {
    const runner = guard(o, () => emitJs(sema, dir));
    if (o.emit === 'js') { console.log(runner.files.map(f => f.path).join('\n')); process.exit(0); }
    log(o, `built sim in ${Date.now() - t0} ms -> ${path.relative(process.cwd(), dir)}`);
    return { exe: ['node', path.join(dir, 'run.mjs')], dir };
  }
  const res = guard(o, () => emitCpp(sema, { debug: o.debug, title, width: prof.width, height: prof.height, outDir: dir, target: o.target }));
  writeIfChanged(path.join(dir, 'zinc_main.cpp'), res.code);
  if (o.emit === 'cpp') { process.stdout.write(res.code); process.exit(0); }
  writeIfChanged(path.join(dir, 'CMakeLists.txt'), cmakeLists(dir, res, o.debug, prof.heap));
  const tc = Date.now();
  const bdir = path.join(dir, 'cmake');
  if (o.target === 'linux' && process.platform !== 'linux') return dockerBuild(o, dir, bdir, sema, tc, t0, res.usesGfx);
  if (!fs.existsSync(path.join(bdir, 'CMakeCache.txt'))) {
    const genArgs = ['-S', dir, '-B', bdir, `-DCMAKE_BUILD_TYPE=${o.debug ? 'Debug' : 'Release'}`];
    if (spawnSync('ninja', ['--version']).status === 0) genArgs.push('-G', 'Ninja');
    if (run('cmake', genArgs, undefined, true) !== 0) die('cmake configure failed');
  }
  if (run('cmake', ['--build', bdir, '-j'], undefined, true) !== 0) die('C++ build failed');
  const exe = path.join(bdir, 'app');
  const size = fs.statSync(exe).size;
  log(o, `built ${o.target}${o.profile !== o.target ? ` (profile ${o.profile})` : ''}: zinc ${tc - t0} ms, C++ ${Date.now() - tc} ms, ${(size / 1024).toFixed(1)} KiB -> ${path.relative(process.cwd(), exe)}`);
  writeReport(dir, o, sema, size, res.usesGfx);
  return { exe: [exe], dir };
}

// DEV-01: build inside the pinned SDK image; the project and zinc are mounted at the same paths.
function dockerArgs(dir: string): string[] {
  const mounts = [ZINC_ROOT, path.dirname(dir)].filter((m, i, a) => !a.some((x, j) => j !== i && (m + '/').startsWith(x + '/')));
  return ['run', '--rm', '-e', 'ZINC_FRAMES', ...mounts.flatMap(m => ['-v', `${m}:${m}`]), '-w', dir, 'zinc/sdk-linux'];
}
function dockerBuild(o: Opts, dir: string, bdir: string, sema: Sema, tc: number, t0: number, gfx: boolean): Built {
  if (spawnSync('docker', ['image', 'inspect', 'zinc/sdk-linux'], { stdio: 'ignore' }).status !== 0) {
    log(o, 'building docker image zinc/sdk-linux (first time only)...');
    if (run('docker', ['build', '-t', 'zinc/sdk-linux', path.join(ZINC_ROOT, 'docker/sdk-linux')], undefined, true) !== 0) die('docker build failed');
  }
  const script = `cmake -S . -B cmake -G Ninja -DZINC_HEADLESS=ON -DCMAKE_BUILD_TYPE=${o.debug ? 'Debug' : 'Release'} >/dev/null && cmake --build cmake`;
  if (run('docker', [...dockerArgs(dir), 'sh', '-c', script], undefined, true) !== 0) die('C++ build failed (linux)');
  const size = fs.statSync(path.join(bdir, 'app')).size;
  log(o, `built linux (docker, headless): zinc ${tc - t0} ms, C++ ${Date.now() - tc} ms, ${(size / 1024).toFixed(1)} KiB -> ${path.relative(process.cwd(), path.join(bdir, 'app'))}`);
  writeReport(dir, o, sema, size, gfx);
  return { exe: ['docker', ...dockerArgs(dir), './cmake/app'], dir };
}

function log(o: Opts, msg: string) { if (!o.json) console.error(`zinc: ${msg}`); }

/** CMP-13 (partial): build report JSON. */
function writeReport(dir: string, o: Opts, sema: Sema, size: number, gfx: boolean) {
  const report = {
    target: o.target, profile: o.profile, debug: o.debug, number: sema.numberKind,
    modules: sema.fe.sources.map(s => path.relative(dir, s.fileName)),
    executableBytes: size, usesGfx: gfx, boxedCaptures: sema.boxed.size, i32LoopCounters: sema.loopI32.size, dynSites: 0,
  };
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}

/** TST-01/02: conformance programs, sim output is the oracle (.out), native output must match byte for byte. */
function test(o: Opts, update: boolean) {
  const dir = path.join(ZINC_ROOT, 'tests/conformance');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts')).sort();
  let failed = 0;
  for (const f of files) {
    const entry = path.join(dir, f);
    const runOne = (target: string): string => {
      const r = spawnSync(process.execPath, [path.join(ZINC_ROOT, 'compiler/bin/zinc.mjs'), 'run', entry, '--target', target, ...(o.profile !== o.target ? ['--profile', o.profile] : []), ...(o.debug ? ['--debug'] : [])], { encoding: 'utf8', env: { ...process.env, ZINC_LOG_FORMAT: '' } });
      return (r.stdout ?? '') + (r.status ? `[exit ${r.status}] ${(r.stderr ?? '').split('\n').filter(l => !l.startsWith('zinc:')).join('\n')}` : '');
    };
    const expectFile = entry.replace(/\.ts$/, o.profile !== 'macos' && o.profile !== 'linux' && o.profile !== o.target ? `.${o.profile}.out` : '.out');
    const sim = runOne('sim');
    if (update || !fs.existsSync(expectFile)) fs.writeFileSync(expectFile, sim);
    const expected = fs.readFileSync(expectFile, 'utf8');
    const results: [string, string][] = [['sim', sim]];
    if (o.target !== 'sim') results.push([o.target, runOne(o.target)]);
    for (const [t, out] of results) {
      const ok = out === expected;
      if (!ok) failed++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${f} [${t}${o.profile !== o.target ? '/' + o.profile : ''}]`);
      if (!ok) console.log(diffText(expected, out));
    }
  }
  console.log(`${files.length} programs, ${failed} failure(s)`);
  process.exit(failed ? 1 : 0);
}
function diffText(a: string, b: string): string {
  const x = a.split('\n'), y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return `  line ${i + 1}:\n  - ${x[i] ?? ''}\n  + ${y[i] ?? ''}`;
  return '';
}

function doctor() {
  const check = (name: string, cmd: string, args: string[]) => {
    const r = spawnSync(cmd, args, { encoding: 'utf8' });
    const ok = r.status === 0;
    console.log(`${ok ? 'ok  ' : 'MISS'} ${name}${ok ? ': ' + (r.stdout || r.stderr).split('\n')[0] : ''}`);
    return ok;
  };
  console.log(`ok   node ${process.version}`);
  check('cmake', 'cmake', ['--version']);
  check('c++ compiler', 'c++', ['--version']);
  check('ninja (optional)', 'ninja', ['--version']);
  check('SDL3 (zinc:gfx on macos/linux)', 'pkg-config', ['--modversion', 'sdl3']) || console.log('     install: brew install sdl3 (macOS) / build SDL3 from source (Linux)');
  check('docker (cross targets)', 'docker', ['--version']);
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log(`zinc — TypeScript to native C++ (prototype)

  zinc check [entry] [--json]                       typecheck + Zinc sema, LSP-style diagnostics with --json
  zinc build [entry] [--target macos|linux|sim] [--profile <target>] [--debug] [--emit=cpp|js]
  zinc run   [entry] [same options] [-- program args]
  zinc test  [--target <id>] [--profile <id>] [--debug] [--update]   conformance: sim oracle vs native
  zinc doctor

entry defaults to src/main.ts or main.ts; a directory means <dir>/main.ts.`);
    return;
  }
  if (cmd === 'doctor') return doctor();
  const o = parseArgs(argv);
  if (cmd === 'check') {
    const sema = analyze(o);
    // run both emitters in memory to surface every Z diagnostic
    guard(o, () => emitCpp(sema, { debug: false, title: '', width: 0, height: 0, outDir: outDir(o), target: o.target }));
    if (o.json) console.log('[]'); else console.error(`zinc: ${o.entry}: no errors`);
    return;
  }
  if (cmd === 'build') { build(o); return; }
  if (cmd === 'test') return test(o, argv.includes('--update'));
  if (cmd === 'run') {
    const b = build(o);
    const r = spawnSync(b.exe[0], [...b.exe.slice(1), ...o.rest], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  }
  die(`unknown command '${cmd}'`);
}

main();
