// zinc CLI (section 14): check, build, run, doctor.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadProgram, ZINC_ROOT, type Diag } from './frontend.ts';
import { Sema, ZincError, type NumKind } from './sema.ts';
import { emitCpp, type CppResult } from './emit-cpp.ts';
import { emitJs } from './emit-js.ts';
import { initProject, exportApp, dev, monitor } from './tools.ts';
import { collectResources, resourcesCpp, resourcesJson } from './resources.ts';
import { activePlugins, buildSettings, discover, listPlugins, projectDir, type BuildSettings } from './plugins.ts';

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
  // reMarkable Paper Pro: 1620x2160 portrait colour e-ink, 2 GiB RAM (docs/targets/remarkable-paper-pro.md)
  rmpp: { number: 'f64', width: 1620, height: 2160, typing: 'gradual', heap: 256 << 20 },
};


interface Project { name: string; dir: string; assets?: string; crash?: string; targets: Record<string, Partial<Profile>> }
/** dev: `zinc dev` build (source locations, red box, hot-reload library on the host platform, docs/dev-mode.md). */
export interface Opts { project: Project; cmd: string; entry: string; target: string; profile: string; debug: boolean; emit?: string; json: boolean; noFloat: boolean; rest: string[]; dev: boolean; devtools: boolean; device?: string }

function parseArgs(argv: string[]): Opts {
  const o: Opts = { project: { name: '', dir: '', targets: {} }, cmd: argv[0] ?? 'help', entry: '', target: process.platform === 'darwin' ? 'macos' : 'linux', profile: '', debug: false, json: false, noFloat: false, rest: [], dev: false, devtools: false };
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
    else if (a === '--dev') o.dev = true;
    else if (a === '--devtools') o.devtools = true;
    else if (a === '--device') o.device = argv[++i];
    else if (a.startsWith('--device=')) o.device = a.slice(9);
    else if (a === '--update' || a === '--print-exe' || a === '--no-devtools') { /* handled by the command */ }
    else if (!a.startsWith('-')) o.entry = a;
    else die(`unknown option ${a}`);
  }
  if (!o.entry && fs.existsSync('zinc.json')) o.entry = JSON.parse(fs.readFileSync('zinc.json', 'utf8')).entry ?? 'src/main.ts';
  if (!o.entry) o.entry = ['src/main.ts', 'src/main.tsx', 'main.ts', 'main.tsx'].find(f => fs.existsSync(f)) ?? 'main.ts';
  if (fs.existsSync(o.entry) && fs.statSync(o.entry).isDirectory() && fs.existsSync(path.join(o.entry, 'zinc.json')))
    o.entry = path.join(o.entry, JSON.parse(fs.readFileSync(path.join(o.entry, 'zinc.json'), 'utf8')).entry ?? 'src/main.ts');
  if (fs.existsSync(o.entry) && fs.statSync(o.entry).isDirectory()) { const d = o.entry; o.entry = path.join(d, ['main.ts', 'main.tsx', 'src/main.ts', 'src/main.tsx'].find(f => fs.existsSync(path.join(d, f))) ?? 'main.ts'); }
  if (!o.profile) o.profile = o.target;
  o.project = loadProject(o.entry);
  const over = o.project.targets[o.profile];
  if (over && PROFILES[o.profile]) PROFILES[o.profile] = { ...PROFILES[o.profile], ...over };
  if (!PROFILES[o.target]) die(`unknown target '${o.target}' (available: ${Object.keys(PROFILES).join(', ')})`);
  if (!PROFILES[o.profile]) die(`unknown profile '${o.profile}'`);
  return o;
}

/** zinc.json next to the entry (or one/two levels up): name, entry, assets dir, per-target overrides. */
function loadProject(entry: string): Project {
  let dir = path.dirname(path.resolve(entry));
  for (let i = 0; i < 3; i++) {
    const f = path.join(dir, 'zinc.json');
    if (fs.existsSync(f)) {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      return { name: j.name ?? path.basename(dir), dir, assets: path.join(dir, j.assets ?? 'assets'), crash: j.crash, targets: j.targets ?? {} };
    }
    dir = path.dirname(dir);
  }
  const d = path.dirname(path.resolve(entry));
  return { name: path.basename(d), dir: d, assets: fs.existsSync(path.join(d, 'assets')) ? path.join(d, 'assets') : undefined, targets: {} };
}

/** Build errors end the command; `zinc dev` builds in process and catches them (tools.ts). */
export class Exit extends Error { code: number; constructor(code: number) { super(`exit ${code}`); this.code = code; } }
function exit(code: number): never { throw new Exit(code); }
function die(msg: string): never { console.error(`zinc: ${msg}`); exit(2); }

function printDiags(ds: Diag[], json: boolean) {
  if (json) { console.log(JSON.stringify(ds.map(d => ({ uri: d.file, range: { start: { line: d.line - 1, character: d.col - 1 } }, code: d.code, severity: d.severity === 'error' ? 1 : 2, message: d.message })), null, 2)); return; }
  for (const d of ds) console.error(`${d.file}:${d.line}:${d.col} - ${d.severity} ${d.code}: ${d.message}`);
}

/** plugins/devtools entry (UI inspector, docs/dev-mode.md), when visible from the project. */
function devtoolsEntry(o: Opts): string[] {
  const p = discover(projectDir(o.entry)).find(x => x.name === 'devtools');
  return p?.entry && path.resolve(p.entry) !== path.resolve(o.entry) ? [p.entry] : [];
}

/** Frontend + Sema. Exits on the first error (CMP-03). */
function analyze(o: Opts): Sema {
  const fe = loadProgram(o.entry, o.devtools ? devtoolsEntry(o) : []);
  if (fe.tsDiagnostics.length) { printDiags(fe.tsDiagnostics, o.json); exit(1); }
  const prof = PROFILES[o.profile];
  try {
    const sema = new Sema(fe, path.dirname(path.resolve(o.entry)), { numberKind: prof.number, typing: prof.typing, warnFloat: !!prof.noFpu, noFloat: o.noFloat, heap0: false });
    if (!o.json) printDiags(sema.warnings, false);
    return sema;
  } catch (e) {
    if (e instanceof ZincError) { printDiags([e.diag], o.json); exit(1); }
    throw e;
  }
}

function guard<T>(o: Opts, f: () => T): T {
  try { return f(); } catch (e) {
    if (e instanceof ZincError) { printDiags([e.diag], o.json); exit(1); }
    throw e;
  }
}

function outDir(o: Opts): string {
  const base = path.basename(o.entry).replace(/\.[cm]?[jt]sx?$/, '');
  const name = (base === 'main' ? '' : base + '-') + o.target + (o.profile !== o.target ? `-${o.profile}` : '') + (o.dev ? '-dev' : o.debug ? '-debug' : '');
  return path.join(path.dirname(path.resolve(o.entry)), 'build', name);
}

function writeIfChanged(file: string, content: string) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return;
  fs.writeFileSync(file, content);
}

const MOD_LIBS: Record<string, string> = { net: 'CURL::libcurl', gpio_linux: 'libgpiod' };
/** crash: ZRT_CRASH policy; hot: the program is a shared library run by runtime/dev_host.cpp (zinc dev). */
interface BuildMode { dev: boolean; hot: boolean; crash: number }
function cmakeLists(dir: string, res: CppResult, debug: boolean, heap: number, target: string, ps: BuildSettings, mode: BuildMode): string {
  const usesGfx = res.usesGfx;
  // linux/rpi1: libgpiod (env ZRT_GPIOD, matching -DZRT_GPIOD passed to the compile below) picks
  // runtime/mod/gpio_linux.cpp over the simulator in gpio.cpp; gpio_linux.cpp itself falls back
  // to the same simulator, with a warning, when /dev/gpiochip0 is absent at runtime (no GPIO
  // chip under Docker/QEMU), so this is safe to build even without hardware.
  const gpiod = (target === 'linux' || target === 'rpi1') && !!process.env.ZRT_GPIOD
    && res.modules.has('gpio') && fs.existsSync(path.join(ZINC_ROOT, 'runtime/mod/gpio_linux.cpp'));
  const modFile = (m: string) => (gpiod && m === 'gpio' ? 'gpio_linux' : m);
  const mods = [...res.modules].map(modFile).filter(m => fs.existsSync(path.join(ZINC_ROOT, 'runtime/mod', m + '.cpp')));
  const rel = (f: string) => '${CMAKE_CURRENT_SOURCE_DIR}/' + path.relative(dir, f);
  const z = '${CMAKE_CURRENT_SOURCE_DIR}/' + path.relative(dir, ZINC_ROOT);

  if (mode.dev) debug = false;
  const san = debug ? '-fsanitize=address,undefined -fno-omit-frame-pointer' : '';
  const opt = mode.dev ? '-g -O0 -DZRT_DEV' : debug ? `-g -O0 -DZRT_DEBUG ${san}` : '-O2 -ffunction-sections -fdata-sections';
  const hot = mode.hot;
  const q = (x: string) => `"${x.replace(/"/g, '\\"')}"`;
  return `# Generated by zinc. Do not edit.
cmake_minimum_required(VERSION 3.20)
project(zinc_app CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(ZFLAGS -fno-exceptions -fno-rtti -fwrapv -fno-threadsafe-statics -DZRT_HEAP_BYTES=${heap}u${gpiod ? ' -DZRT_GPIOD' : ''}${mode.crash ? ` -DZRT_CRASH=${mode.crash}` : ''} ${opt})
${hot ? 'set(CMAKE_POSITION_INDEPENDENT_CODE ON)\n' : ''}add_library(zrt STATIC ${z}/runtime/zrt.cpp ${z}/runtime/host.cpp${mods.map(m => ` ${z}/runtime/mod/${m}.cpp`).join('')})
target_include_directories(zrt PUBLIC ${z}/runtime ${z}/runtime/include)
target_compile_options(zrt PUBLIC \${ZFLAGS})
target_compile_options(zrt PRIVATE -Wall -Wextra -Werror)
target_compile_definitions(zrt PUBLIC ZRT_PLATFORM="${target}")
option(ZINC_HEADLESS "use the null HAL even for zinc:gfx programs" OFF)
if(DEFINED ZINC_HAL_FILE)
  set(ZINC_HAL \${ZINC_HAL_FILE})
elseif(EMSCRIPTEN)
  set(ZINC_HAL ${z}/targets/wasm/hal_web.cpp)
elseif(${usesGfx ? 'NOT ZINC_HEADLESS' : 'FALSE'})
  set(ZINC_HAL ${z}/targets/macos/hal_sdl.cpp)
else()
  set(ZINC_HAL ${z}/targets/null/hal_null.cpp)
endif()
if(EMSCRIPTEN OR DEFINED ZINC_HAL_FILE)
  set(ZINC_POSIX "")
else()
  set(ZINC_POSIX ${z}/targets/common/hal_posix.cpp)
endif()
${hot ? `# zinc dev: the host keeps the HAL and the window; the program is reloaded as a module (runtime/dev_host.cpp)
add_executable(zinc_host ${z}/runtime/dev_host.cpp)
target_include_directories(zinc_host PRIVATE ${z}/runtime/include)
target_compile_definitions(zinc_host PRIVATE ZINC_HAL_SRC="\${ZINC_HAL}")
set_target_properties(zinc_host PROPERTIES ENABLE_EXPORTS ON)
target_link_libraries(zinc_host PRIVATE \${CMAKE_DL_LIBS})
${usesGfx ? 'find_package(SDL3 REQUIRED CONFIG)\ntarget_link_libraries(zinc_host PRIVATE SDL3::SDL3)' : ''}
add_library(app MODULE zinc_main.cpp${res.nativeSources.map(f => ' ' + rel(f)).join('')})
set_target_properties(app PROPERTIES PREFIX "" SUFFIX ".so")
target_compile_definitions(app PRIVATE ZRT_DYLIB)
target_link_libraries(app PRIVATE zinc_host)` : `add_executable(app zinc_main.cpp \${ZINC_HAL} \${ZINC_POSIX}${res.nativeSources.map(f => ' ' + rel(f)).join('')})`}
target_include_directories(app PRIVATE \${CMAKE_CURRENT_SOURCE_DIR})
target_compile_options(app PRIVATE -Wall -Wno-unused-variable -Wno-unused-parameter -Wno-unused-label -Wno-unused-lambda-capture -Wno-unused-but-set-variable -Wno-inconsistent-missing-override -Wno-parentheses-equality)
target_link_libraries(app PRIVATE zrt)
if(EMSCRIPTEN)
  set(CMAKE_EXECUTABLE_SUFFIX ".html")
  target_link_options(app PRIVATE -sALLOW_MEMORY_GROWTH=1 -sEXIT_RUNTIME=0 --shell-file ${z}/targets/wasm/shell.html)
endif()
${hot || mode.dev ? '' : debug && target !== 'wasm' ? `target_link_options(app PRIVATE ${san})` : `if(EMSCRIPTEN)
elseif(APPLE)
  target_link_options(app PRIVATE -Wl,-dead_strip)
else()
  target_link_options(app PRIVATE -Wl,--gc-sections)
endif()`}
${mods.filter(m => MOD_LIBS[m]).map(m => m === 'net' ? 'find_package(CURL REQUIRED)\ntarget_link_libraries(zrt PUBLIC CURL::libcurl)' : m === 'gpio_linux' ? 'find_package(PkgConfig REQUIRED)\npkg_check_modules(GPIOD REQUIRED IMPORTED_TARGET libgpiod)\ntarget_link_libraries(zrt PUBLIC PkgConfig::GPIOD)' : '').join('\n')}
${ps.includes.length ? `target_include_directories(app PRIVATE ${ps.includes.map(q).join(' ')})` : ''}
${ps.defines.length ? `target_compile_definitions(app PRIVATE ${ps.defines.map(q).join(' ')})` : ''}
${ps.flags.length ? `target_compile_options(app PRIVATE ${ps.flags.map(q).join(' ')})` : ''}
${ps.pkg.length ? `find_package(PkgConfig REQUIRED)\npkg_check_modules(ZPLUGINS REQUIRED IMPORTED_TARGET ${ps.pkg.join(' ')})\ntarget_link_libraries(app PRIVATE PkgConfig::ZPLUGINS)` : ''}
${ps.frameworks.length || ps.libs.length || ps.linkFlags.length ? `target_link_libraries(app PRIVATE ${[...ps.frameworks.map(f => `"-framework ${f}"`), ...ps.libs, ...ps.linkFlags.map(q)].join(' ')})` : ''}
${usesGfx && !hot ? 'if(NOT ZINC_HEADLESS AND NOT EMSCRIPTEN)\n  find_package(SDL3 REQUIRED CONFIG)\n  target_link_libraries(app PRIVATE SDL3::SDL3)\nendif()' : ''}
if(DEFINED ZINC_TARGET_CMAKE)
  include(\${ZINC_TARGET_CMAKE})
endif()
`;
}

/** Embeds the project's assets as constant data (PACKAGE_PROD-style single binary). Deterministic: sorted paths. */
function assetsSource(o: Opts): string {
  const files: string[] = [];
  const walk = (d: string, pre: string) => { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p, pre + f + '/'); else if (!f.startsWith('.')) files.push(pre + f); } };
  if (o.project.assets) walk(o.project.assets, '');
  const out = ['// Generated by zinc: embedded assets.', '#include <stdint.h>', 'struct ZincAsset { const char* name; const unsigned char* data; uint32_t size; };'];
  files.forEach((f, i) => {
    const b = fs.readFileSync(path.join(o.project.assets!, f));
    const hex: string[] = [];
    for (let k = 0; k < b.length; k++) hex.push('0x' + b[k].toString(16));
    out.push(`static const unsigned char a${i}[] = {${hex.join(',') || '0'}};`);
  });
  out.push(`extern const ZincAsset zinc_assets[] = {${files.map((f, i) => `{${JSON.stringify(f)}, a${i}, ${fs.statSync(path.join(o.project.assets!, f)).size}u}`).join(', ') || '{"", 0, 0}'}};`);
  out.push(`extern const uint32_t zinc_asset_count = ${files.length}u;`, '');
  return out.join('\n');
}

/** Does any source of the project import zinc:ui (or a UI compat module)? A textual scan, before compiling. */
function usesUi(dir: string): boolean {
  const walk = (d: string): boolean => fs.readdirSync(d, { withFileTypes: true }).some(e => {
    if (e.name.startsWith('.') || e.name === 'build' || e.name === 'dist' || e.name === 'node_modules') return false;
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) && /from\s+['"](zinc:ui|solid-js|@pocketjs)/.test(fs.readFileSync(p, 'utf8'));
  });
  return walk(dir);
}
function usesGfx(sema: Sema): boolean { return sema.fe.sources.some(f => /from ['"]zinc:gfx['"]/.test(f.text)); }
/** Fonts and images baked for this program (cached by content key in the build directory). */
function bakeResources(o: Opts, sema: Sema, dir: string): { cpp: string; json: string } {
  const user = sema.fe.sources.filter(f => !f.fileName.startsWith(path.join(ZINC_ROOT, 'lib') + path.sep)).map(f => ({ fileName: f.fileName, text: f.text }));
  const assetStamp: string[] = [];
  const walk = (d?: string) => { if (!d || !fs.existsSync(d)) return; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else assetStamp.push(p + ':' + st.mtimeMs); } };
  walk(o.project.assets);
  const key = JSON.stringify([user.map(u => u.text), assetStamp, fs.statSync(path.join(ZINC_ROOT, 'compiler/src/resources.ts')).mtimeMs]);
  const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };
  const cpp = path.join(dir, 'zinc_resources.cpp'), json = path.join(dir, 'resources.json'), stamp = path.join(dir, 'resources.key');
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === hash(key) && fs.existsSync(cpp) && fs.existsSync(json)) return { cpp, json: fs.readFileSync(json, 'utf8') };
  const t = Date.now();
  const rs = collectResources(user, o.project.assets);
  writeIfChanged(cpp, resourcesCpp(rs));
  const j = resourcesJson(rs);
  fs.writeFileSync(json, j);
  fs.writeFileSync(stamp, hash(key));
  log(o, `baked ${rs.fonts.length} font sizes and ${rs.images.length} image(s) in ${Date.now() - t} ms`);
  return { cpp, json: j };
}

function run(cmd: string, args: string[], cwd?: string, quiet = false): number {
  const r = spawnSync(cmd, args, { cwd, stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8' });
  if (r.error) die(`cannot run ${cmd}: ${r.error.message}`);
  if (quiet && r.status !== 0) { process.stderr.write(r.stdout ?? ''); process.stderr.write(r.stderr ?? ''); }
  return r.status ?? 1;
}

/** lib: the program as a module for runtime/dev_host.cpp (hot reload, exe is the host). */
export interface Built { exe: string[]; dir: string; lib?: string }
const CRASH: Record<string, number> = { exit: 0, redbox: 1, restart: 2 };
/** zinc dev reloads in place when the target runs on this machine (macos on macOS, linux on Linux). */
function hotTarget(o: Opts): boolean { return o.dev && !o.device && ((o.target === 'macos' && process.platform === 'darwin') || (o.target === 'linux' && process.platform === 'linux')); }

/** Active plugins for this build (PLG); unavailable ones are Z5003 like built-in modules. */
let extraMounts: string[] = [];  // plugin directories outside the project, visible to docker builds
function pluginSettings(o: Opts, sema: Sema): BuildSettings {
  const pd = projectDir(o.entry);
  const act = activePlugins(pd, sema.fe.sources.map(f => f.fileName), o.target);
  if (act.errors.length) { console.error(act.errors.map(e => `${o.entry}:1:1 - error Z5003: ${e}`).join('\n')); exit(1); }
  if (act.plugins.length) log(o, `plugins: ${act.plugins.map(p => p.name).join(', ')}`);
  extraMounts = act.plugins.map(p => p.dir);
  return buildSettings(act.plugins, pd, o.target);
}

function build(o: Opts): Built {
  const t0 = Date.now();
  const sema = analyze(o);
  const dir = outDir(o);
  fs.mkdirSync(dir, { recursive: true });
  const title = o.project.name;
  const prof = PROFILES[o.profile];
  if (o.target === 'sim' || o.emit === 'js') {
    pluginSettings(o, sema);
    const baked = usesGfx(sema) ? bakeResources(o, sema, dir) : undefined;
    const runner = guard(o, () => emitJs(sema, dir, o.project.assets, [prof.width, prof.height], baked?.json));
    if (o.emit === 'js') { console.log(runner.files.map(f => f.path).join('\n')); process.exit(0); }
    log(o, `built sim in ${Date.now() - t0} ms -> ${path.relative(process.cwd(), dir)}`);
    return { exe: ['node', path.join(dir, 'run.mjs')], dir };
  }
  const ps = pluginSettings(o, sema);
  const crash = o.dev ? 1 : CRASH[o.project.crash ?? 'exit'];
  if (crash === undefined) die(`zinc.json: crash must be "exit", "redbox" or "restart"`);
  const mode: BuildMode = { dev: o.dev, hot: hotTarget(o), crash };
  const res = guard(o, () => emitCpp(sema, { debug: o.debug, title, width: prof.width, height: prof.height, outDir: dir, target: o.target, dev: o.dev }));
  res.nativeSources.push(...ps.sources);
  if (res.usesGfx) {
    const baked = bakeResources(o, sema, dir);
    res.nativeSources.push(path.join(ZINC_ROOT, 'runtime/raster.cpp'), path.join(ZINC_ROOT, 'runtime/gfx.cpp'), baked.cpp);
  }
  writeIfChanged(path.join(dir, 'zinc_main.cpp'), res.code);
  if (o.emit === 'cpp') { process.stdout.write(res.code); process.exit(0); }
  if (res.modules.has('assets')) { writeIfChanged(path.join(dir, 'zinc_assets.cpp'), assetsSource(o)); res.nativeSources.push(path.join(dir, 'zinc_assets.cpp')); }
  writeIfChanged(path.join(dir, 'CMakeLists.txt'), cmakeLists(dir, res, o.debug, prof.heap, o.profile, ps, mode));
  const tc = Date.now();
  const bdir = path.join(dir, 'cmake');
  if (DOCKER[o.target] && !(o.target === 'linux' && process.platform === 'linux')) return dockerBuild(o, dir, bdir, sema, tc, t0, res.usesGfx, ps);
  if (o.target === 'wasm') return wasmBuild(o, dir, bdir, sema, tc, t0, res.usesGfx);
  if (o.target === 'esp32') return espBuild(o, dir, res, sema, tc, t0, prof.heap, ps);
  if (!fs.existsSync(path.join(bdir, 'CMakeCache.txt'))) {
    const genArgs = ['-S', dir, '-B', bdir, `-DCMAKE_BUILD_TYPE=${o.debug ? 'Debug' : 'Release'}`];
    if (spawnSync('ninja', ['--version']).status === 0) genArgs.push('-G', 'Ninja');
    if (run('cmake', genArgs, undefined, true) !== 0) die('cmake configure failed');
  }
  if (run('cmake', ['--build', bdir, '-j'], undefined, true) !== 0) die('C++ build failed');
  if (mode.hot) {
    const lib = path.join(bdir, 'app.so');
    log(o, `built ${o.target} (dev): zinc ${tc - t0} ms, C++ ${Date.now() - tc} ms -> ${path.relative(process.cwd(), lib)}`);
    return { exe: [path.join(bdir, 'zinc_host')], dir, lib };
  }
  const exe = path.join(bdir, 'app');
  const size = fs.statSync(exe).size;
  log(o, `built ${o.target}${o.profile !== o.target ? ` (profile ${o.profile})` : ''}: zinc ${tc - t0} ms, C++ ${Date.now() - tc} ms, ${(size / 1024).toFixed(1)} KiB -> ${path.relative(process.cwd(), exe)}`);
  writeReport(dir, o, sema, size, res.usesGfx);
  return { exe: [exe], dir };
}

// DEV-01: each cross target builds inside its pinned SDK image; the project and zinc are mounted at the same paths.
/** out: build artifact (default app); frames: `zinc run` builds in a frame budget (ZINC_FRAMES, default 60) since the
 *  program cannot read the environment (console emulators). */
interface DockerTarget { image: string; dockerfile: string; platform?: string; cmake: string[]; run: string[]; env?: string[]; entrypoint?: string; out?: string; frames?: boolean }
const DOCKER: Record<string, DockerTarget> = {
  linux: { image: 'zinc/sdk-linux', dockerfile: 'docker/sdk-linux', cmake: ['-G', 'Ninja'], run: ['./cmake/app'] },
  // TGT-RPI-01/04: ARMv6 hard-float, executed under QEMU with the arm1176 CPU
  rpi1: { image: 'zinc/sdk-rpi1', dockerfile: 'docker/sdk-rpi1', platform: 'linux/arm/v6', cmake: ['-DCMAKE_CXX_FLAGS=-march=armv6kz+fp -mfpu=vfp -mfloat-abi=hard'], run: ['./cmake/app'], env: ['QEMU_CPU=arm1176'] },
  // TGT-PS1: PS-EXE with PSn00bSDK, run headless in PCSX-Redux (OpenBIOS, no Sony BIOS); the TTY between the HAL
  // markers is the program's output, the exit code comes from the emulator (-testmode). docs/targets/playstation.md
  ps1: { image: 'zinc/sdk-psx', dockerfile: 'docker/sdk-psx', platform: 'linux/amd64', out: 'app.exe', frames: true,
    cmake: ['-DCMAKE_TOOLCHAIN_FILE=/opt/psn00bsdk/lib/libpsn00b/cmake/sdk.cmake', `-DZINC_HAL_FILE=${ZINC_ROOT}/targets/ps1/hal_ps1.cpp`, `-DZINC_TARGET_CMAKE=${ZINC_ROOT}/targets/ps1/ps1.cmake`],
    run: ['bash', '-c', `set -o pipefail; timeout ${process.env.ZINC_EMU_TIMEOUT ?? 300} /opt/redux/usr/bin/pcsx-redux -cli -testmode -stdout -run -loadexe cmake/app.exe 2>&1 | awk '/^zinc:exit$/{f=0} f{print; fflush()} /^zinc:start$/{f=1}'`] },
  // TGT-PS2-01: EE ELF with ps2sdk; running needs PCSX2 + the user's BIOS (TGT-PS2-04), so `run` only builds
  // reMarkable Paper Pro: static aarch64 binary (independent of the device's glibc), Cortex-A53 tuning
  rmpp: { image: 'zinc/sdk-rmpp', dockerfile: 'docker/sdk-rmpp', platform: 'linux/arm64', cmake: ['-G', 'Ninja', '-DCMAKE_CXX_FLAGS=-mcpu=cortex-a53', '-DCMAKE_EXE_LINKER_FLAGS=-static'], run: ['./cmake/app'] },
  ps2: { image: 'zinc/sdk-ps2', dockerfile: 'docker/sdk-ps2', platform: 'linux/amd64', cmake: ['-DCMAKE_TOOLCHAIN_FILE=/usr/local/ps2dev/ps2sdk/ps2dev.cmake', `-DZINC_HAL_FILE=${ZINC_ROOT}/targets/ps2/hal_ps2.cpp`], run: ['echo', 'ps2: ELF built; run it in PCSX2 with your BIOS (zinc export --target ps2)'] },
};
function dockerArgs(dir: string, t: DockerTarget): string[] {
  const mounts = [ZINC_ROOT, path.dirname(path.dirname(dir)), ...extraMounts].filter((m, i, a) => !a.some((x, j) => j !== i && (m + '/').startsWith(x + '/')));
  return ['run', '--rm', '-e', 'ZINC_FRAMES', ...(t.env ?? []).flatMap(e => ['-e', e]), ...(t.platform ? ['--platform', t.platform] : []), ...mounts.flatMap(m => ['-v', `${m}:${m}`]), '-w', dir, ...(t.entrypoint ? ['--entrypoint', t.entrypoint] : []), t.image];
}
function dockerBuild(o: Opts, dir: string, bdir: string, sema: Sema, tc: number, t0: number, gfx: boolean, ps: BuildSettings): Built {
  let t = DOCKER[o.target];
  if (spawnSync('docker', ['image', 'inspect', t.image], { stdio: 'ignore' }).status !== 0) {
    log(o, `building docker image ${t.image} (first time only)...`);
    if (run('docker', ['build', '-t', t.image, path.join(ZINC_ROOT, t.dockerfile)], undefined, true) !== 0) die('docker build failed');
  }
  // plugin system packages: a derived image per package set, built once
  if (ps.packages.length) {
    const pk = [...ps.packages].sort();
    const image = `${t.image}-p${fnv(pk.join(' '))}`;
    if (spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore' }).status !== 0) {
      log(o, `building docker image ${image} (${pk.join(' ')})...`);
      const install = fs.readFileSync(path.join(ZINC_ROOT, t.dockerfile, 'Dockerfile'), 'utf8').includes('apk add') ? 'apk add --no-cache' : 'apt-get update && apt-get install -y --no-install-recommends';
      const r = spawnSync('docker', ['build', ...(t.platform ? ['--platform', t.platform] : []), '-t', image, '-'], { input: `FROM ${t.image}\nRUN ${install} ${pk.join(' ')}\n`, stdio: ['pipe', 'ignore', 'inherit'] });
      if (r.status !== 0) die('docker build failed (plugin packages)');
    }
    t = { ...t, image };
  }
  if (t.frames && o.cmd === 'run') t = { ...t, cmake: [...t.cmake, `-DZINC_FRAMES=${Number(process.env.ZINC_FRAMES ?? 60)}`] };
  // a cache configured by another toolchain cannot be reused
  const stamp = path.join(bdir, '.zinc-image');
  const want = t.image + ' ' + t.cmake.join(' ');
  if (fs.existsSync(bdir) && (!fs.existsSync(stamp) || fs.readFileSync(stamp, 'utf8') !== want)) fs.rmSync(bdir, { recursive: true, force: true });
  fs.mkdirSync(bdir, { recursive: true });
  fs.writeFileSync(stamp, want);
  const cm = ['cmake', '-S', '.', '-B', 'cmake', '-DZINC_HEADLESS=ON', `-DCMAKE_BUILD_TYPE=${o.debug ? 'Debug' : 'Release'}`, ...t.cmake].map(a => `'${a}'`).join(' ');
  const script = `${cm} >/dev/null && cmake --build cmake -j4`;
  if (run('docker', [...dockerArgs(dir, t), 'sh', '-c', script], undefined, true) !== 0) die(`C++ build failed (${o.target})`);
  const out = path.join(bdir, t.out ?? 'app');
  const size = fs.statSync(out).size;
  log(o, `built ${o.target} (docker ${t.image}${t.platform ? ', ' + t.platform : ''}): zinc ${tc - t0} ms, C++ ${Date.now() - tc} ms, ${(size / 1024).toFixed(1)} KiB -> ${path.relative(process.cwd(), out)}`);
  writeReport(dir, o, sema, size, gfx);
  return { exe: ['docker', ...dockerArgs(dir, t), ...t.run], dir };
}

// TGT-ESP-01: the program becomes an ESP-IDF project (main component); runs in Espressif's QEMU (TGT-ESP-05).
const IDF_IMAGE = 'espressif/idf:v6.0';
// REQUIRES per zinc:<mod> on esp32 (esp_http_client pulls in lwip+esp_event itself; osc/mqtt/
// telemetry talk raw POSIX sockets directly so they need lwip's socket headers on their own).
const ESP_MOD_REQUIRES: Record<string, string[]> = {
  storage: ['nvs_flash'], fs: ['spiffs'], gpio: ['esp_driver_gpio'],
  net: ['esp_http_client', 'nvs_flash'], osc: ['lwip'], mqtt: ['lwip'], telemetry: ['lwip'],
};
function espBuild(o: Opts, dir: string, res: CppResult, sema: Sema, tc: number, t0: number, heap: number, ps: BuildSettings): Built {
  const idf = path.join(dir, 'idf');
  fs.mkdirSync(path.join(idf, 'main'), { recursive: true });
  // TGT-ESP variants: prefer runtime/mod/<name>_esp32.cpp over the host/sim runtime/mod/<name>.cpp.
  const modFile = (m: string) => fs.existsSync(path.join(ZINC_ROOT, 'runtime/mod', `${m}_esp32.cpp`)) ? `${m}_esp32` : m;
  const mods = [...res.modules].filter(m => fs.existsSync(path.join(ZINC_ROOT, 'runtime/mod', modFile(m) + '.cpp')));
  const srcs = [path.join(dir, 'zinc_main.cpp'), path.join(ZINC_ROOT, 'runtime/zrt.cpp'), path.join(ZINC_ROOT, 'runtime/host.cpp'),
    ...mods.map(m => path.join(ZINC_ROOT, 'runtime/mod', modFile(m) + '.cpp')), path.join(ZINC_ROOT, 'targets/esp32/hal_esp32.cpp'), ...res.nativeSources];
  const requires = [...new Set(['esp_timer', ...mods.flatMap(m => ESP_MOD_REQUIRES[m] ?? []), ...ps.idf])];
  const comps = Object.entries(ps.idfComponents);
  if (comps.length) writeIfChanged(path.join(idf, 'main/idf_component.yml'), `# Generated by zinc (plugin components).\ndependencies:\n${comps.map(([k, v]) => `  ${k}: "${v}"`).join('\n')}\n`);
  writeIfChanged(path.join(idf, 'CMakeLists.txt'), `# Generated by zinc.\ncmake_minimum_required(VERSION 3.16)\ninclude($ENV{IDF_PATH}/tools/cmake/project.cmake)\nproject(${o.project.name.replace(/[^A-Za-z0-9_]/g, '_')})\n`);
  // zinc.json: targets.esp32.wifi = { ssid, password } -> ZINC_WIFI_SSID/ZINC_WIFI_PASSWORD
  // compile defines. There's no esp_wifi station bring-up yet (QEMU has no WiFi radio to
  // exercise one against); see the comment in runtime/mod/net_esp32.cpp.
  const wifi = (o.project.targets.esp32 as unknown as { wifi?: { ssid?: string; password?: string } } | undefined)?.wifi;
  const wifiDefs = wifi?.ssid ? ` -DZINC_WIFI_SSID=${JSON.stringify(wifi.ssid)} -DZINC_WIFI_PASSWORD=${JSON.stringify(wifi.password ?? '')}` : '';
  writeIfChanged(path.join(idf, 'main/CMakeLists.txt'), `# Generated by zinc.
idf_component_register(SRCS ${srcs.map(f => `"${f}"`).join(' ')}
                       INCLUDE_DIRS "${path.join(ZINC_ROOT, 'runtime')}" "${path.join(ZINC_ROOT, 'runtime/include')}" "${dir}"${ps.includes.map(i => ` "${i}"`).join('')}
                       REQUIRES ${requires.join(' ')}${ps.sources.length ? '\n                       WHOLE_ARCHIVE' : ''})
${ps.defines.length || ps.flags.length ? `target_compile_options(\${COMPONENT_LIB} PRIVATE ${[...ps.defines.map(d => `-D${d}`), ...ps.flags].map(x => `"${x.replace(/"/g, '\\"')}"`).join(' ')})` : ''}
target_compile_options(\${COMPONENT_LIB} PRIVATE -std=gnu++17 -fno-exceptions -fno-rtti -fwrapv -Wno-unused-variable -Wno-unused-parameter -Wno-unused-label -Wno-unused-but-set-variable -Wno-unused-function -Wno-format -Wno-misleading-indentation -DZRT_HEAP_BYTES=${heap}u -DZRT_PLATFORM="esp32" -DZRT_MAX_DRAW_CMDS=256 -DZRT_TEXT_POOL=2048 -DZRT_POINT_POOL=1024 -DZRT_MICROTASKS=128 -DZRT_DEFERRED=64 -DZRT_TIMERS=16${CRASH[o.project.crash ?? 'exit'] ? ` -DZRT_CRASH=${CRASH[o.project.crash!]}` : ''}${wifiDefs})
set_source_files_properties("${path.join(dir, 'zinc_main.cpp')}" PROPERTIES COMPILE_OPTIONS "-Dmain=zinc_program_main")
`);
  // fs: a SPIFFS partition ("storage") mounted at /zinc (runtime/mod/fs_esp32.cpp) needs a
  // custom partition table; storage (NVS) alone fits inside IDF's default table.
  const usesFs = mods.includes('fs_esp32') || mods.includes('fs');
  if (usesFs) writeIfChanged(path.join(idf, 'partitions.csv'), `# Generated by zinc.
# Name,   Type, SubType, Offset,  Size, Flags
nvs,      data, nvs,     0x9000,  0x6000,
phy_init, data, phy,     0xf000,  0x1000,
factory,  app,  factory, 0x10000, 1M,
storage,  data, spiffs,  ,        512K,
`);
  writeIfChanged(path.join(idf, 'sdkconfig.defaults'), `CONFIG_ESP_MAIN_TASK_STACK_SIZE=16384
CONFIG_COMPILER_OPTIMIZATION_SIZE=y
CONFIG_ESP_TASK_WDT_EN=n
CONFIG_LOG_DEFAULT_LEVEL_ERROR=y
${usesFs ? 'CONFIG_PARTITION_TABLE_CUSTOM=y\nCONFIG_PARTITION_TABLE_CUSTOM_FILENAME="partitions.csv"\n' : ''}`);
  const t: DockerTarget = { image: IDF_IMAGE, dockerfile: '', cmake: [], run: [] };
  if (run('docker', [...dockerArgs(dir, t), 'idf.py', '-C', idf, '-B', path.join(idf, 'build'), 'build'], undefined, true) !== 0) die('ESP-IDF build failed');
  const bin = path.join(idf, 'build', `${o.project.name.replace(/[^A-Za-z0-9_]/g, '_')}.bin`);
  const size = fs.existsSync(bin) ? fs.statSync(bin).size : 0;
  log(o, `built esp32 (ESP-IDF v6.0): zinc ${tc - t0} ms, C++ ${Date.now() - tc} ms, firmware ${(size / 1024).toFixed(1)} KiB -> ${path.relative(process.cwd(), bin)}`);
  writeReport(dir, o, sema, size, res.usesGfx);
  // UART output between the HAL markers; awk exits at the end marker, which stops QEMU
  const script = `timeout ${process.env.ZINC_QEMU_TIMEOUT ?? 120} idf.py -C '${idf}' -B '${path.join(idf, 'build')}' qemu 2>&1 | awk '/zinc:exit/{exit} f{print; fflush()} /zinc:start/{f=1}'`;
  return { exe: ['docker', ...dockerArgs(dir, { ...t, entrypoint: 'bash' }), '-c', `source /opt/esp/idf/export.sh >/dev/null 2>&1; ${script}`], dir };
}

/** Environment for emscripten: a Python >= 3.10 and the LLVM shipped with the emscripten formula, if present. */
function emEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const py of ['/opt/homebrew/bin/python3', '/usr/local/bin/python3']) if (!env.EMSDK_PYTHON && fs.existsSync(py)) env.EMSDK_PYTHON = py;
  const emcc = spawnSync('sh', ['-c', 'command -v emcc'], { encoding: 'utf8' }).stdout.trim();
  if (emcc) {
    const base = path.dirname(fs.realpathSync(emcc));
    const llvm = [path.join(base, 'llvm/bin'), path.join(base, '../libexec/llvm/bin')].find(d => fs.existsSync(path.join(d, 'wasm-ld')));
    if (!env.EM_LLVM_ROOT && llvm) { env.EM_LLVM_ROOT = path.resolve(llvm); env.PATH = `${env.EM_LLVM_ROOT}:${env.PATH}`; }
  }
  return env;
}
function wasmBuild(o: Opts, dir: string, bdir: string, sema: Sema, tc: number, t0: number, gfx: boolean): Built {
  Object.assign(process.env, emEnv());
  if (spawnSync('emcc', ['--version']).status !== 0) die('wasm target needs emscripten (brew install emscripten)');
  if (!fs.existsSync(path.join(bdir, 'CMakeCache.txt')) && run('emcmake', ['cmake', '-S', dir, '-B', bdir, `-DCMAKE_BUILD_TYPE=${o.debug ? 'Debug' : 'Release'}`], undefined, true) !== 0) die('emcmake configure failed');
  if (run('cmake', ['--build', bdir, '-j'], undefined, true) !== 0) die('C++ build failed (wasm)');
  const wasm = path.join(bdir, 'app.wasm');
  const size = fs.statSync(wasm).size;
  log(o, `built wasm: zinc ${tc - t0} ms, C++ ${Date.now() - tc} ms, ${(size / 1024).toFixed(1)} KiB wasm -> ${path.relative(process.cwd(), path.join(bdir, 'app.html'))}`);
  writeReport(dir, o, sema, size, gfx);
  return { exe: [process.execPath, path.join(ZINC_ROOT, 'compiler/bin/serve.mjs'), bdir], dir };
}

function fnv(s: string): string { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); }
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
  const files = fs.readdirSync(dir).filter(f => /\.tsx?$/.test(f)).sort();
  let failed = 0;
  for (const f of files) {
    const entry = path.join(dir, f);
    const runOne = (target: string): string => {
      const r = spawnSync(process.execPath, [path.join(ZINC_ROOT, 'compiler/bin/zinc.mjs'), 'run', entry, '--target', target, '--profile', o.profile, ...(o.debug ? ['--debug'] : [])], { encoding: 'utf8', env: { ZINC_FIXED_DT: String(1 / 60), ...process.env, ZINC_LOG_FORMAT: '' } });  // deterministic frame clock
      return (r.stdout ?? '').replace(/\r\n/g, '\n') + (r.status ? `[exit ${r.status}] ${(r.stderr ?? '').split('\n').filter(l => !l.startsWith('zinc:')).join('\n')}` : '');
    };
    const pr = PROFILES[o.profile];
    const key = [pr.number === 'f64' ? '' : pr.number, pr.width === 320 && pr.height === 240 ? '' : `${pr.width}x${pr.height}`].filter(Boolean).join('.');
    const expectFile = entry.replace(/\.tsx?$/, key ? `.${key}.out` : '.out');
    const sim = runOne('sim');
    if (update || !fs.existsSync(expectFile)) fs.writeFileSync(expectFile, sim);
    const expected = fs.readFileSync(expectFile, 'utf8');
    const results: [string, string][] = [['sim', sim]];
    if (o.target !== 'sim') results.push([o.target, runOne(o.target)]);
    for (const [t, out] of results) {
      if (out.includes('Z5003')) { console.log(`skip ${f} [${t}] (module not available on this target)`); continue; }
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
  // symlinked working dirs (/tmp -> /private/tmp on macOS) would give two spellings of every path
  process.chdir(fs.realpathSync(process.cwd()));
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log(`zinc — TypeScript to native C++ (prototype)

  zinc check [entry] [--json]                       typecheck + Zinc sema, LSP-style diagnostics with --json
  zinc build [entry] [--target macos|linux|sim] [--profile <target>] [--debug] [--emit=cpp|js]
  zinc run   [entry] [same options] [-- program args]
  zinc test  [--target <id>] [--profile <id>] [--debug] [--update]   conformance: sim oracle vs native
  zinc export [entry] --target <id>                  dist/<name>-<target>: self-contained executable, scripts, service unit
  zinc deploy [entry] --target linux|rpi1|rmpp [--device user@host]   export, copy over ssh and start (rmpp: root@10.11.99.1)
  zinc init <dir> [--template game|cli|server|iot]
  zinc dev [entry] [--target macos|linux|sim|wasm|rpi1] [--device user@host] [--no-devtools]
                                                    hot reload on save, red box, UI inspector (docs/dev-mode.md)
  zinc monitor [--port 9999]                        live view of zinc:telemetry
  zinc plugins [project]                            the plugin toolbox: modules, display drivers, targets
  zinc doctor

entry defaults to src/main.ts or main.ts; a directory means <dir>/main.ts.`);
    return;
  }
  if (cmd === 'doctor') return doctor();
  if (cmd === 'plugins') { console.log(listPlugins(projectDir(argv[1] && !argv[1].startsWith('-') ? path.join(argv[1], 'x') : 'x'))); return; }
  if (cmd === 'init') {
    const t = argv.indexOf('--template');
    try { initProject(argv[1] && !argv[1].startsWith('-') ? argv[1] : '.', t > 0 ? argv[t + 1] : 'game'); } catch (e) { die((e as Error).message); }
    return;
  }
  if (cmd === 'monitor') { const p = argv.indexOf('--port'); return monitor(p > 0 ? Number(argv[p + 1]) : 9999); }
  if (cmd === 'dev') {
    const o = parseArgs(argv);
    o.dev = true;
    // the UI inspector (plugins/devtools) comes with zinc:ui programs on hosts that can listen on a socket
    if (!argv.includes('--no-devtools') && ['macos', 'linux', 'rpi1'].includes(o.target) && usesUi(o.project.dir)) o.devtools = true;
    return dev(o, () => { try { return build(o); } catch (e) { if (e instanceof Exit) return null; throw e; } });
  }
  const o = parseArgs(argv);
  if (cmd === 'check') {
    const sema = analyze(o);
    // run both emitters in memory to surface every Z diagnostic
    guard(o, () => emitCpp(sema, { debug: false, title: '', width: 0, height: 0, outDir: outDir(o), target: o.target }));
    if (o.json) console.log('[]'); else console.error(`zinc: ${o.entry}: no errors`);
    return;
  }
  if (cmd === 'build') { const b = build(o); if (argv.includes('--print-exe')) console.log(b.exe.join(' ')); return; }
  if (cmd === 'export' || cmd === 'deploy') {
    if (o.target === 'sim') die('export needs a native target');
    const b = build(o);
    const out = exportApp(o.project.name, o.target, b.exe[b.exe.length - 1].startsWith('./') ? path.join(b.dir, b.exe[b.exe.length - 1]) : b.exe[0], o.project.dir);
    if (cmd === 'deploy') {
      const script = path.join(out, 'deploy.sh');
      if (!fs.existsSync(script)) die(`no deploy script for target '${o.target}'`);
      process.exit(run('sh', [script, o.device ?? (o.target === 'rmpp' ? 'root@10.11.99.1' : die('deploy needs --device user@host'))]));
    }
    return;
  }
  if (cmd === 'test') return test(o, argv.includes('--update'));
  if (cmd === 'run') {
    const b = build(o);
    const r = spawnSync(b.exe[0], [...b.exe.slice(1), ...o.rest], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  }
  die(`unknown command '${cmd}'`);
}

try { main(); } catch (e) { if (e instanceof Exit) process.exit(e.code); throw e; }
