import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { Project } from './cli.ts';
import { spawnSync } from 'node:child_process';
import { ZINC_ROOT, ts, STD_MODULES } from './frontend.ts';
import type { Sema } from './sema.ts';
import { emitBytecode } from './emit-bc.ts';
import { emitJs } from './emit-js.ts';
import { emitAbi } from './abi.ts';

export type Engine = 'native' | 'zinc-vm' | 'quickjs';
interface Graphics { cpp: string; title: string; headless: boolean; defines: string[] }
export function buildEngine(s: Sema, engine: Engine, dir: string, target: string, debug: boolean, assets: string | undefined, screen: [number, number], tier: 0 | 1 = 0, nativeLibraries: string[] = [], graphics?: Graphics): { exe: string[]; dir: string; watch: string[] } {
  const host = process.platform === 'darwin' ? 'macos' : 'linux';
  if (target !== host) throw new Error(`${engine}: interpreter builds currently support the host target (${host})`);
  fs.mkdirSync(dir, { recursive: true });
  const abi = emitAbi(s, dir, target);
  // Do not silently substitute simulator no-ops for native graphics or services.
  for (const sf of s.fe.sources) if (!sf.fileName.endsWith('.spec.ts')) for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || st.importClause?.isTypeOnly) continue;
    const name = st.moduleSpecifier.text;
    if (name.startsWith('zinc:') && !STD_MODULES[name] && !abi.imports.has(name)) throw new Error(`${engine}: native module ${name} has no engine ABI adapter yet`);
  }
  const sources = [...abi.sources, ...(graphics ? ['gfx.cpp', 'raster.cpp', 'ttf.cpp'].map(file => path.join(ZINC_ROOT, 'runtime', file)).concat(graphics.cpp) : [])], defines = `target_compile_definitions(app PRIVATE ZINC_GENERATED_ABI="${abi.header}")`;
  let program: string;
  if (engine === 'zinc-vm') {
    program = path.join(dir, 'app.zbc');
    fs.writeFileSync(program, emitBytecode(s, abi, map => fs.writeFileSync(program + '.debug', map)));
  } else {
    emitJs(s, dir, assets, screen, undefined, abi.imports);
    program = bundleJs(path.join(dir, 'run.mjs'), path.join(dir, 'bundle'));
  }
  const q = (s: string) => '"' + s.replace(/\\/g, '/').replace(/"/g, '\\"').replace(/\$/g, '\\$') + '"';
  const root = ZINC_ROOT;
  const rt = path.join(root, 'runtime');
  const config = path.join(dir, 'zinc_engine_config.h');
  const configText = '#pragma once\n' + (graphics ? `#define ZINC_ENGINE_GFX 1\n#define ZINC_ENGINE_WIDTH ${screen[0]}\n#define ZINC_ENGINE_HEIGHT ${screen[1]}\n#define ZINC_ENGINE_TITLE ${JSON.stringify(graphics.title)}\n` : '');
  if (!fs.existsSync(config) || fs.readFileSync(config, 'utf8') !== configText) fs.writeFileSync(config, configText);
  const hal = graphics && !graphics.headless ? 'targets/macos/hal_sdl.cpp' : 'targets/null/hal_null.cpp';
  const san = debug ? '-fsanitize=address,undefined -fno-omit-frame-pointer' : '';
  const cmake = `cmake_minimum_required(VERSION 3.20)
project(zinc_engine LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
add_executable(app ${q(path.join(rt, 'vm', engine === 'quickjs' ? 'quickjs.cpp' : 'main.cpp'))} ${sources.map(q).join(' ')})
target_include_directories(app PRIVATE ${q(dir)} ${q(path.join(rt, 'vm'))} ${q(rt)} ${q(path.join(rt, 'include'))})
target_compile_definitions(app PRIVATE ZRT_HOSTED_CPP)
target_compile_definitions(app PRIVATE ZRT_PLATFORM="${target}")
target_compile_options(app PRIVATE ${debug ? '-O0 -g' : '-O2'} -fno-rtti -fwrapv -ffp-contract=off ${san} -include ${q(config)})
${graphics?.defines.length ? `target_compile_definitions(app PRIVATE ${graphics.defines.join(' ')})` : ''}
${debug ? `target_link_options(app PRIVATE ${san})` : ''}
${engine === 'quickjs' ? `add_library(qjs STATIC ${q(path.join(root, 'plugins/script/vendor/quickjs/quickjs-amalgam.c'))})
target_compile_options(qjs PRIVATE ${debug ? '-O0 -g' : '-O2'} ${san})
target_link_libraries(app PRIVATE qjs)` : ''}
add_library(zrt STATIC ${[path.join(rt, 'zrt.cpp'), path.join(rt, 'host.cpp'), path.join(root, hal), path.join(root, 'targets/common/hal_posix.cpp')].map(q).join(' ')})
target_include_directories(zrt PRIVATE ${q(rt)} ${q(path.join(rt, 'include'))})
target_compile_options(zrt PRIVATE ${debug ? '-O0 -g' : '-O2'} -fno-exceptions -fno-rtti -fwrapv -ffp-contract=off ${san})
target_link_libraries(app PRIVATE zrt \${CMAKE_DL_LIBS})
${graphics && !graphics.headless ? 'find_package(SDL3 REQUIRED CONFIG)\ntarget_link_libraries(zrt PUBLIC SDL3::SDL3)' : ''}
${graphics?.defines.length ? `target_compile_definitions(zrt PRIVATE ${graphics.defines.join(' ')})` : ''}
${defines}
`;
  const file = path.join(dir, 'CMakeLists.txt');
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== cmake) fs.writeFileSync(file, cmake);
  const bdir = path.join(dir, 'cmake');
  for (const args of [['-S', dir, '-B', bdir], ['--build', bdir, '--parallel', '4']]) {
    const r = spawnSync('cmake', args, { encoding: 'utf8' });
    if (r.error || r.status !== 0) throw new Error(r.error?.message ?? `${r.stdout}${r.stderr}`);
  }
  const exe = [path.join(bdir, 'app'), program, ...(engine === 'zinc-vm' && tier === 1 ? ['--jit'] : []), ...nativeLibraries.flatMap(file => ['--native-library', file])];
  const artifacts = [exe[0], program, path.join(dir, 'core.abi.json'), ...nativeLibraries];
  if (engine === 'zinc-vm') artifacts.push(program + '.debug');
  if (engine === 'quickjs') artifacts.push(...fs.readdirSync(path.join(dir, 'bundle')).map(file => path.join(dir, 'bundle', file)).filter(file => file !== program));
  const files = artifacts.map(file => ({ path: path.relative(dir, file), sha256: hash(fs.readFileSync(file)) }));
  fs.writeFileSync(path.join(dir, 'engine.json'), JSON.stringify({ engine, target, arch: process.arch, debug, graphics: graphics ? { headless: graphics.headless, screen } : null, tier: engine === 'zinc-vm' ? tier : null,
    entry: path.relative(dir, program), libraries: nativeLibraries, fingerprint: hash(JSON.stringify({ engine, target, debug, tier, files })), files }, null, 2) + '\n');
  const runtimeInputs = [path.join(rt, 'zrt.cpp'), path.join(rt, 'zrt.h'), path.join(rt, 'host.cpp'), path.join(root, hal), path.join(root, 'targets/common/hal_posix.cpp'),
    ...fs.readdirSync(path.join(rt, 'vm')).filter(file => /\.(h|cpp)$/.test(file)).map(file => path.join(rt, 'vm', file))];
  return { exe, dir, watch: [...s.fe.sources.map(source => source.fileName), ...sources, ...nativeLibraries, ...runtimeInputs] };
}

function hash(content: string | Buffer): string { return createHash('sha256').update(content).digest('hex'); }

/** Copy the actual static/dynamic-literal module graph, including shared Zinc JS helpers. No checkout paths at runtime. */
function bundleJs(entry: string, out: string): string {
  fs.mkdirSync(out, { recursive: true });
  const visited = new Map<string, string>();
  const copy = (file: string): string => {
    file = path.resolve(file);
    const existing = visited.get(file); if (existing) return existing;
    const dest = path.join(out, file === path.resolve(entry) ? 'run.mjs' : hash(file).slice(0, 20) + '-' + path.basename(file).replace(/\.[^.]+$/, '') + '.mjs');
    visited.set(file, dest);
    let code = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const edits: { start: number; end: number; text: string }[] = [];
    const visit = (node: ts.Node) => {
      let spec: ts.Expression | undefined;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) spec = node.moduleSpecifier;
      else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) spec = node.arguments[0];
      if (spec && ts.isStringLiteral(spec) && (spec.text.startsWith('.') || path.isAbsolute(spec.text))) {
        const dependency = copy(path.resolve(path.dirname(file), spec.text));
        edits.push({ start: spec.getStart(sf), end: spec.end, text: JSON.stringify('./' + path.basename(dependency)) });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    for (const edit of edits.sort((a, b) => b.start - a.start)) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== code) fs.writeFileSync(dest, code);
    return dest;
  };
  const result = copy(entry);
  const live = new Set(visited.values());
  for (const name of fs.readdirSync(out)) if (!live.has(path.join(out, name))) fs.rmSync(path.join(out, name));
  return result;
}

/** A portable host package: native runner plus verified bytecode or the emitted JS graph. */
export function exportEngine(project: Project, engine: Engine, target: string, dir: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(project.name)) throw new Error('engine export needs a plain project name (letters, digits, . _ -)');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'engine.json'), 'utf8'));
  const out = path.join(project.dir, 'dist', `${project.name}-${target}-${engine}`);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(path.join(dir, 'cmake/app'), path.join(out, 'runner'));
  fs.chmodSync(path.join(out, 'runner'), 0o755);
  const program = engine === 'quickjs' ? 'bundle/run.mjs' : 'app.zbc';
  if (engine === 'quickjs') fs.cpSync(path.join(dir, 'bundle'), path.join(out, 'bundle'), { recursive: true });
  else { fs.copyFileSync(path.join(dir, 'app.zbc'), path.join(out, 'app.zbc')); if (fs.existsSync(path.join(dir, 'app.zbc.debug'))) fs.copyFileSync(path.join(dir, 'app.zbc.debug'), path.join(out, 'app.zbc.debug')); }
  if (engine === 'quickjs') {
    const entry = path.join(out, program);
    fs.writeFileSync(entry, fs.readFileSync(entry, 'utf8').replace(/globalThis\.\$zAssetsDir = [^\n]*;\n/, 'globalThis.$zAssetsDir = "./assets";\n'));
  }
  if (project.assets && fs.existsSync(project.assets)) fs.cpSync(project.assets, path.join(out, 'assets'), { recursive: true });
  const libraries = (manifest.libraries as string[]).map((file, i) => {
    const name = `${i}-${path.basename(file)}`;
    fs.mkdirSync(path.join(out, 'native'), { recursive: true });
    fs.copyFileSync(file, path.join(out, 'native', name));
    return 'native/' + name;
  });
  const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
  const args = [program, ...(manifest.tier === 1 ? ['--jit'] : []), ...libraries.flatMap(file => ['--native-library', file])];
  fs.writeFileSync(path.join(out, 'run.sh'), '#!/bin/sh\nset -e\ncd "$(dirname "$0")"\nexport ZINC_ASSETS="$PWD/assets"\nexec ./runner ' + args.map(quote).join(' ') + ' "$@"\n', { mode: 0o755 });
  fs.copyFileSync(path.join(dir, 'core.abi.json'), path.join(out, 'core.abi.json'));
  const files: { path: string; sha256: string }[] = [];
  const collect = (folder: string) => { for (const name of fs.readdirSync(folder).sort()) {
    const file = path.join(folder, name);
    if (fs.statSync(file).isDirectory()) collect(file);
    else files.push({ path: path.relative(out, file), sha256: hash(fs.readFileSync(file)) });
  } };
  collect(out);
  fs.writeFileSync(path.join(out, 'engine.json'), JSON.stringify({ ...manifest, entry: program, libraries, files,
    fingerprint: hash(JSON.stringify({ engine, target, tier: manifest.tier, files })) }, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'README.txt'), `${project.name}: ${engine}, ${target}/${process.arch}. Run ./run.sh.\nNative library transitive dependencies must be available on the destination host.\n`);
  return out;
}
