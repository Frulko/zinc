#!/usr/bin/env node
// zinc compat: standards conformance harness (docs/guide/06-testing.md, docs/reports/compat.md).
// Runs pinned external suites (WPT for the WinterTC Minimum Common Web API, test262, quickjs-ng's tests) and a curated
// Node API set through Zinc (sim and native, gradual and strict profiles) and through reference engines (Node, Deno,
// Bun, QuickJS), then writes tests/compat/results/<date>.json and docs/reports/compat.md.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { report } from './report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const CACHE = path.join(HERE, 'cache');
const WORK = path.join(CACHE, 'work');
const M = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));

// ---- options
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
if (flag('--help') || flag('-h')) {
  console.log(`zinc compat [options]: standards conformance (docs/reports/compat.md)
  --suite a,b         wpt, test262, node, quickjs (default: all)
  --engines a,b       zinc-sim, zinc-sim-strict, zinc-native, zinc-native-strict, node, deno, bun, qjs (default: all found)
  --filter text       only tests whose id contains text (the run is not recorded as a dated result)
  --jobs n            parallel tests (default 4)
  --exhaustive        compile every Zinc variant even when zinc-sim already rejected the program
  --zinc dir          measure another Zinc checkout (default: this one)
  --fetch             only fetch the pinned suites into tests/compat/cache
  --check             fail on regressions against tests/compat/baseline.json
  --update-baseline   record the Zinc passes of this run as the baseline
  --report file.json  regenerate docs/reports/compat.md from a results file (with --check / --update-baseline: offline)`);
  process.exit(0);
}
const ZINC_ROOT = path.resolve(val('--zinc', ROOT));
const ZINC_BIN = path.join(ZINC_ROOT, 'compiler/bin/zinc.mjs');
const JOBS = Number(val('--jobs', '4'));
const FILTER = val('--filter', '');
const SUITES = (val('--suite', 'wpt,test262,node,quickjs')).split(',');
const NATIVE = process.platform === 'darwin' ? 'macos' : 'linux';
const TIMEOUT = { sim: 30000, native: 120000, ref: 20000 };

const ENGINES = {
  'zinc-sim': { zinc: true, target: 'sim', strict: false },
  'zinc-sim-strict': { zinc: true, target: 'sim', strict: true },
  'zinc-native': { zinc: true, target: NATIVE, strict: false },
  'zinc-native-strict': { zinc: true, target: NATIVE, strict: true },
  node: { cmd: ['node', '--no-warnings'], version: ['node', '--version'] },
  // --location: the base URL Deno's own WPT runner gives (relative Request URLs); Node and Bun have no equivalent
  deno: { cmd: ['deno', 'run', '-A', '--quiet', '--location=http://web-platform.test/'], version: ['deno', '--version'] },
  bun: { cmd: ['bun'], version: ['bun', '--version'] },
  qjs: { cmd: ['qjs'], version: ['qjs', '-h'] },
};


// ---- pinned sources (git sparse checkouts in the git-ignored cache; offline once fetched)
function git(dir, ...args) {
  const r = spawnSync('git', dir ? ['-C', dir, ...args] : args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
function fetchSources() {
  for (const [name, s] of Object.entries(M.sources)) {
    const dir = path.join(CACHE, name);
    if (!fs.existsSync(path.join(dir, '.git'))) {
      console.error(`compat: fetching ${s.repo} (sparse)`);
      git(null, 'clone', '-q', '--filter=blob:none', '--no-checkout', s.repo, dir);
    }
    let sparse = '';
    try { sparse = git(dir, 'sparse-checkout', 'list'); } catch { /* a fresh clone is not sparse yet (git 2.4x: "this worktree is not sparse") */ }
    if (sparse.split('\n').sort().join('\n') !== [...s.sparse].sort().join('\n')) git(dir, 'sparse-checkout', 'set', '--cone', ...s.sparse);
    let head = '';
    try { head = git(dir, 'rev-parse', 'HEAD'); } catch { /* fresh clone */ }
    if (head !== s.commit || !s.sparse.every(p => fs.existsSync(path.join(dir, p)))) {
      try { git(dir, 'cat-file', '-e', s.commit); } catch { git(dir, 'fetch', '-q', '--filter=blob:none', 'origin', s.commit); }
      git(dir, 'checkout', '-q', s.commit);
    }
  }
}

// ---- test selection
const sample = (files, max) => files.length <= max ? files : Array.from({ length: max }, (_, i) => files[Math.floor(i * files.length / max)]);
const walk = (dir) => fs.readdirSync(dir, { recursive: true }).map(String).filter(f => f.endsWith('.js') && !f.includes('_FIXTURE')).sort();

function collect() {
  const cases = [];
  if (SUITES.includes('wpt')) {
    const seen = new Set();
    for (const a of M.wintertc.apis) for (const f of a.wpt) {
      if (seen.has(f)) continue;
      seen.add(f);
      cases.push({ id: `wpt/${f}`, suite: 'wpt', area: a.api, file: path.join(CACHE, 'wpt', f) });
    }
  }
  if (SUITES.includes('test262')) {
    const base = path.join(CACHE, 'test262');
    for (const sel of M.test262.select) {
      const dir = path.join(base, sel.dir);
      let files = walk(dir);
      if (sel.perDir) {
        const groups = new Map();
        for (const f of files) { const g = f.includes('/') ? f.split('/')[0] : '.'; groups.set(g, [...(groups.get(g) ?? []), f]); }
        files = [...groups.values()].flatMap(g => sample(g, sel.perDir));
      } else files = sample(files, sel.max);
      for (const f of files) {
        const rel = path.relative(path.join(base, 'test'), path.join(dir, f));
        const parts = rel.split('/');
        cases.push({ id: `test262/${rel}`, suite: 'test262', area: `${parts[0]}/${parts[1]}`, sub: parts.length > 3 ? parts[2] : '', file: path.join(dir, f) });
      }
    }
  }
  if (SUITES.includes('node')) {
    const dir = path.join(HERE, 'node');
    for (const f of fs.readdirSync(dir).filter(f => f.startsWith('test-')).sort())
      cases.push({ id: `node/${f}`, suite: 'node', area: f.split('-')[1], file: path.join(dir, f) });
  }
  if (SUITES.includes('quickjs')) {
    for (const f of M.quickjs.files) {
      const file = path.join(CACHE, 'quickjs', f);
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/^(\w+)\(\)(?:\.catch\([^\n]*\))?;\s*$/gm))
        cases.push({ id: `quickjs/${path.basename(f)}#${m[1]}`, suite: 'quickjs', area: path.basename(f), file, fn: m[1] });
    }
  }
  return cases.filter(c => c.id.includes(FILTER));
}

// ---- programs
const read = (f) => fs.readFileSync(f, 'utf8');
/** The mechanical rewrites `zinc check --fix` is planned to make (perryts-comparison.md #4); applied to Zinc inputs only. */
const zincRewrite = (s) => s.replace(/(^|[;{}(\s])var(\s)/g, '$1let$2')
  // constructors are not first-class values in Zinc: the harness compares error names instead
  .replace(/\b(assert\.throws|assert_throws_js|assertThrows)\(\s*([A-Z]\w*Error)\s*,/g, "$1('$2',");
const T262_ZINC_INCLUDES = new Set(['compareArray.js', 'asyncHelpers.js', 'doneprintHandle.js']);
const PRINT_SHIM = "if (typeof print === 'undefined') globalThis.print = (...a) => console.log(...a);\n";

function meta262(src) {
  const y = /\/\*---([\s\S]*?)---\*\//.exec(src)?.[1] ?? '';
  const list = (key) => {
    const inline = new RegExp(`^${key}:\\s*\\[(.*)\\]`, 'm').exec(y);
    if (inline) return inline[1].split(',').map(s => s.trim()).filter(Boolean);
    const block = new RegExp(`^${key}:\\s*\\n((?:\\s+-.*\\n?)+)`, 'm').exec(y);
    return block ? block[1].split('\n').map(l => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean) : [];
  };
  const neg = /^negative:\s*\n((?:\s+\w+:.*\n?)+)/m.exec(y)?.[1];
  return {
    includes: list('includes'), flags: list('flags'), features: list('features'),
    negative: neg ? { phase: /phase:\s*(\w+)/.exec(neg)?.[1], type: /type:\s*(\w+)/.exec(neg)?.[1] } : undefined,
  };
}

/** Per case: { skip } (no engine runs it), or { ref, zinc } sources ({ unsupported } for an engine family that cannot run it). */
function programs(c) {
  const src = read(c.file);
  if (c.suite === 'test262') {
    const m = meta262(src);
    c.meta = m;
    const skipped = m.features.filter(f => M.test262.skipFeatures.includes(f));
    if (skipped.length) return { skip: `feature ${skipped.join(', ')}` };
    if (m.flags.includes('module')) return { skip: 'module flag (harness runs scripts)' };
    const async = m.flags.includes('async');
    const h = (f) => read(path.join(CACHE, 'test262/harness', f));
    const includes = [...(async ? ['doneprintHandle.js'] : []), ...m.includes];
    const tail = async || m.negative ? '' : "\nconsole.log('ZC:PASS');\n";
    const ref = (m.flags.includes('onlyStrict') ? '"use strict";\n' : '') + PRINT_SHIM + h('assert.js') + h('sta.js') + includes.map(h).join('\n') + '\n' + src + tail;
    const missing = m.includes.filter(i => !T262_ZINC_INCLUDES.has(i));
    const zinc = m.flags.includes('noStrict') ? { unsupported: 'sloppy-mode test (Zinc programs are modules)' }
      : missing.length ? { unsupported: `harness ${missing.join(', ')} (needs reflection)` }
      : { text: "import { assert, Test262Error, $DONOTEVALUATE, compareArray, $DONE, asyncTest } from './t262.ts';\n" + zincRewrite(src).replace(/(^|[^.\w$])assert\s*\(/g, '$1assert.ok(') + tail };
    return { ref: { text: ref }, zinc };
  }
  if (c.suite === 'wpt') {
    const wpt = path.join(CACHE, 'wpt');
    const testDir = path.dirname(c.file);
    const scripts = [...src.matchAll(/^\/\/ META: script=(.+)$/gm)].map(x => x[1].trim())
      .map(s => s.startsWith('/') ? path.join(wpt, s) : path.join(testDir, s));
    // local JSON resources (url/resources/urltestdata.json...) are inlined: no network, no file server.
    // Relative URLs resolve against the test page, then against the script that fetches them.
    const files = {};
    const inline = (text, dir) => text.replace(/\b(fetch|fetch_json)\((["'`])([^"'`]+\.json)\2\)/g, (_m, fn, _q, rel) => {
      const f = [rel.startsWith('/') ? path.join(wpt, rel) : path.join(testDir, rel), path.join(dir, rel)].find(x => fs.existsSync(x));
      if (f) files[rel] = read(f);
      return fn === 'fetch' ? `__zc_fetch(${JSON.stringify(rel)})` : `__zc_fetch(${JSON.stringify(rel)}).then(r => r.json())`;
    });
    const helpers = scripts.map(f => fs.existsSync(f) ? inline(read(f), path.dirname(f)) : `throw new Error('missing META script ${path.basename(f)}');`).join('\n');
    const body = inline(src, testDir);
    const fetchShim = `const __ZC_FILES = ${JSON.stringify(files)};
function __zc_fetch(p) { return p in __ZC_FILES ? Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(__ZC_FILES[p])), text: () => Promise.resolve(__ZC_FILES[p]) }) : Promise.reject(new TypeError('compat harness: no local file ' + p)); }
`;
    // the real testharness.js in its shell environment; each subtest result is printed once, then the process ends
    // (an open MessagePort or interval keeps some runtimes alive)
    const ref = PRINT_SHIM + `if (typeof self === 'undefined') globalThis.self = globalThis;
globalThis.location ??= { search: '', href: ${JSON.stringify('http://web-platform.test/' + path.relative(wpt, c.file))}, pathname: ${JSON.stringify('/' + path.relative(wpt, c.file))} };
globalThis.GLOBAL = { isWindow: () => false, isWorker: () => false, isShadowRealm: () => false };
` + fetchShim + read(path.join(wpt, 'resources/testharness.js')) + `
const __zc_seen = new Set();
const __zc_print = t => { if (__zc_seen.has(t)) return; __zc_seen.add(t); console.log('ZC:SUB ' + (t.status === 0 ? 'PASS' : 'FAIL') + ' ' + String(t.name).replace(/\\s+/g, ' ') + (t.status ? ': ' + String(t.message).split('\\n')[0].slice(0, 200) : '')); };
add_result_callback(__zc_print);
add_completion_callback((ts, st) => {
  ts.forEach(__zc_print);
  console.log('ZC:DONE ' + st.status + (st.message ? ' ' + String(st.message).split('\\n')[0] : ''));
  const exit = globalThis.process?.exit ?? globalThis.Deno?.exit;
  if (exit) setTimeout(() => exit(0), 50);
});
// UMD helpers (pako...) must define globals, not CommonJS exports
var module = undefined, exports = undefined;
` + helpers + '\n' + body + '\n';
    const unsupported = /\basync_test\s*\(|\bEventWatcher\b|\.step_func|\.step_timeout|\bfetch_tests_from_worker\b/.exec(src + helpers);
    const web = zincWebImports(helpers + body);
    const zinc = unsupported ? { unsupported: `harness ${unsupported[0].replace(/[\s(.]/g, '')} (asynchronous testharness API)` }
      : { text: `import { ${TH_EXPORTS.join(', ')} } from './testharness.ts';\n` + web + zincRewrite(helpers + '\n' + body).replace(/__zc_fetch\(("[^"]*")\)/g, (_m, p) => `Promise.resolve({ json: () => JSON.parse(${JSON.stringify(files[JSON.parse(p)] ?? 'null')}) })`) + '\n__zc_done();\n' };
    return { ref: { text: ref }, zinc };
  }
  if (c.suite === 'node') {
    const common = read(path.join(HERE, 'node/common.js'));
    return { ref: { text: common + src }, zinc: { text: zincRewrite(common + src) } };
  }
  // quickjs: one test_* function and the top-level declarations it reaches
  return quickjsProgram(c, src);
}

const TH_EXPORTS = [...read(path.join(HERE, 'shims/testharness.ts')).matchAll(/^export (?:async )?(?:function|class) (\w+)/gm)].map(m => m[1]);

/** Names the Zinc checkout exports from its Web / net modules, for WPT programs and the WinterTC table. */
function zincApiIndex() {
  const idx = {};
  // Web globals: the compiler adds their import itself (compiler/src/frontend.ts WEB_GLOBALS)
  const fe = read(path.join(ZINC_ROOT, 'compiler/src/frontend.ts'));
  for (const list of fe.matchAll(/for \(const n of \[([^\]]*)\]\) WEB_GLOBALS\[n\]/g))
    for (const m of list[1].matchAll(/'(\w+)'/g)) idx[m[1]] = 'global';
  for (const m of fe.matchAll(/^WEB_GLOBALS\.(\w+) =/gm)) idx[m[1]] = 'global';
  const lib = path.join(ZINC_ROOT, 'lib');
  for (const f of ['zinc.d.ts', 'gfx.d.ts', 'modules.d.ts', 'ui.d.ts']) {
    const p = path.join(lib, f);
    if (!fs.existsSync(p)) continue;
    const text = read(p);
    for (const m of text.replace(/declare module[\s\S]*?\n}\n/g, '').matchAll(/^declare (?:var|let|const|function|class) (\w+)/gm)) idx[m[1]] ??= 'global';
    for (const mod of text.matchAll(/declare module '(zinc:[\w/]+)' \{([\s\S]*?)\n\}/g))
      for (const m of mod[2].matchAll(/export (?:declare )?(?:class|function|const|let|interface) (\w+)/g)) idx[m[1]] ??= mod[1];
  }
  const web = path.join(lib, 'std/web.ts');
  if (fs.existsSync(web)) for (const m of read(web).matchAll(/^export (?:abstract )?(?:class|function|const|let) (\w+)/gm)) idx[m[1]] ??= 'zinc:web';
  return idx;
}
const ZINC_API = zincApiIndex();
function zincWebImports(text) {
  const byMod = {};
  for (const [name, mod] of Object.entries(ZINC_API)) {
    if (mod === 'global' || !['zinc:web', 'zinc:net'].includes(mod) || !new RegExp(`\\b${name}\\b`).test(text)) continue;
    (byMod[mod] ??= []).push(name);
  }
  return Object.entries(byMod).map(([mod, names]) => `import { ${names.join(', ')} } from '${mod}';\n`).join('');
}

let ts;
async function loadTs() {
  const req = (await import('node:module')).createRequire(path.join(ZINC_ROOT, 'compiler/src/frontend.ts'));
  ts = req('@typescript/typescript6');
}
// Zinc versions of quickjs-ng's assert helpers (the originals use `arguments`); assertThrows only when used
const QJS_ASSERT_ZINC = `function assert(actual, expected = true, message = '') {
  if (actual === expected) return;
  if (typeof actual === 'number' && typeof expected === 'number' && isNaN(actual) && isNaN(expected)) return;
  throw new Error('assertion failed: got |' + actual + '|, expected |' + expected + '|' + (message ? ' (' + message + ')' : ''));
}
`;
const QJS_THROWS_ZINC = `function assertThrows(err, func) {
  let ex = false;
  try { func(); } catch (e) { ex = true; }
  assert(ex, true, 'exception expected');
}
`;
function quickjsProgram(c, src) {
  const sf = ts.createSourceFile(c.file, src, ts.ScriptTarget.Latest, true);
  const decls = new Map();  // name -> statement text
  const order = [];
  const helpers = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      const spec = st.moduleSpecifier.text;
      if (spec.startsWith('./')) helpers.push(read(path.join(path.dirname(c.file), spec)).replace(/^export /gm, ''));
      continue;  // qjs:os / qjs:std are QuickJS-only modules
    }
    const names = ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) ? [st.name?.text]
      : ts.isVariableStatement(st) ? st.declarationList.declarations.map(d => d.name.getText()) : [];
    if (!names.length || !names[0]) continue;
    order.push(st);
    for (const n of names) decls.set(n, st);
  }
  const want = new Set([decls.get(c.fn)]);
  const words = (t) => new Set(t.match(/[A-Za-z_$][\w$]*/g));
  for (const st of want) for (const w of words(st.getText())) { const d = decls.get(w); if (d && !want.has(d)) want.add(d); }
  const fnDecl = decls.get(c.fn);
  const isAsync = !!fnDecl?.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword);
  const call = isAsync ? `${c.fn}().then(() => console.log('ZC:PASS'));\n` : `${c.fn}();\nconsole.log('ZC:PASS');\n`;
  const body = order.filter(s => want.has(s)).map(s => s.getFullText()).join('\n');
  const own = ['assert', 'assertThrows', 'assertArrayEquals'];
  const zincBody = order.filter(s => want.has(s) && !(ts.isFunctionDeclaration(s) && own.includes(s.name?.text))).map(s => s.getFullText()).join('\n');
  return { ref: { text: PRINT_SHIM + helpers.join('\n') + '\n' + body + '\n' + call }, zinc: { text: QJS_ASSERT_ZINC + (/\bassertThrows\b/.test(zincBody) ? QJS_THROWS_ZINC : '') + zincRewrite(zincBody) + '\n' + call } };
}

// ---- execution
function exec(cmd, args, opts) {
  return new Promise(resolve => {
    const t0 = performance.now();
    let out = '', err = '', timedOut = false;
    const p = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const cap = (s, d) => s.length > 1 << 20 ? s : s + d;
    p.stdout.on('data', d => { out = cap(out, d); });
    p.stderr.on('data', d => { err = cap(err, d); });
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-p.pid, 'SIGKILL'); } catch { /* gone */ } }, opts.timeout);
    p.on('error', e => { clearTimeout(timer); resolve({ code: -1, out, err: String(e.message), ms: 0, timedOut }); });
    p.on('close', code => { clearTimeout(timer); resolve({ code: code ?? -1, out, err, ms: Math.round(performance.now() - t0), timedOut }); });
  });
}

const DETERMINISTIC = { ZINC_DETERMINISTIC: '1', ZINC_FIXED_DT: String(1 / 60), ZINC_LOG_FORMAT: '' };
const keyOf = (id) => ('z_' + id.replace(/[^A-Za-z0-9]+/g, '_')).slice(0, 72) + '_' + createHash('sha1').update(id).digest('hex').slice(0, 8);

function prepareWork() {
  for (const d of ['gradual', 'strict', 'ref']) fs.mkdirSync(path.join(WORK, d), { recursive: true });
  for (const d of ['gradual', 'strict']) for (const f of ['t262.ts', 'testharness.ts']) fs.copyFileSync(path.join(HERE, 'shims', f), path.join(WORK, d, f));
  // the strict profile on the same targets: zinc.json overrides the typing of sim and the host target
  fs.writeFileSync(path.join(WORK, 'strict/zinc.json'), JSON.stringify({ name: 'compat-strict', targets: { sim: { typing: 'strict' }, [NATIVE]: { typing: 'strict' } } }, null, 2) + '\n');
  fs.writeFileSync(path.join(WORK, 'ref/package.json'), '{ "type": "commonjs" }\n');
}

function detail(r) {
  const lines = (r.err + '\n' + r.out).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('zinc: built') && !l.startsWith('ZC:') && !/^\[\s*\d+%\]/.test(l));
  const hit = lines.find(l => /panic|Uncaught|Error|error|assert/i.test(l)) ?? lines[0] ?? `exit ${r.code}`;
  return hit.replace(/\s+/g, ' ').slice(0, 180);
}

function classify(c, r, zinc) {
  if (r.timedOut && !(c.suite === 'wpt' && /^ZC:DONE/m.test(r.out))) return ['timeout', '', r.ms];
  if (zinc) {
    const m = /error (Z\d{4}|TS\d+): ([^\n]*)/.exec(r.err);
    if (m) {
      const early = c.meta?.negative && ['parse', 'resolution'].includes(c.meta.negative.phase);
      if (early && m[1].startsWith('TS')) return ['pass', `rejected at compile time (${m[1]})`, r.ms];
      return ['rejected', `${m[1]} ${m[2]}`.slice(0, 180), r.ms];
    }
    if (/zinc: C\+\+ build failed/.test(r.err)) {
      const e = /error: ([^\n]*)/.exec(r.err + r.out);
      return ['fail', `C++ build failed: ${e ? e[1] : ''}`.slice(0, 180), r.ms];
    }
    const cli = /^zinc: (?!built)(.*)$/m.exec(r.err);
    if (cli && r.code === 2 && !r.out) return ['fail', `zinc: ${cli[1]}`.slice(0, 180), r.ms];
  }
  const all = r.out + '\n' + r.err;
  if (c.suite === 'test262') {
    const neg = c.meta.negative;
    if (neg) return r.code !== 0 && all.includes(neg.type) ? ['pass', '', r.ms] : ['fail', r.code === 0 ? `expected ${neg.type} (${neg.phase})` : detail(r), r.ms];
    if (c.meta.flags.includes('async')) {
      if (r.out.includes('Test262:AsyncTestComplete')) return ['pass', '', r.ms];
      return ['fail', /Test262:AsyncTestFailure:(.*)/.exec(r.out)?.[1]?.slice(0, 180) ?? detail(r), r.ms];
    }
  }
  if (c.suite === 'wpt') {
    const subs = [...r.out.matchAll(/^ZC:SUB (PASS|FAIL) (.*)$/gm)];
    const pass = subs.filter(s => s[1] === 'PASS').length;
    const done = /^ZC:DONE ?(\d*)(.*)$/m.exec(r.out);
    const firstFail = subs.find(s => s[1] === 'FAIL')?.[2];
    // setup({ single_test: true }) files report through the harness status only
    if (!subs.length && done && done[1] !== '') return done[1] === '0' ? ['pass', '', r.ms, 1, 1] : ['fail', `harness status ${done[1]}${done[2]}`.slice(0, 180), r.ms, 0, 1];
    const ok = done && (done[1] === '' || done[1] === '0') && subs.length > 0 && pass === subs.length && r.code === 0;
    const why = ok ? '' : !subs.length && done ? `harness status ${done[1]}${done[2]}` : firstFail ?? (done ? `harness status ${done[1]}${done[2]}` : `incomplete: ${detail(r)}`);
    return [ok ? 'pass' : 'fail', why.slice(0, 180), r.ms, pass, subs.length];
  }
  return r.code === 0 && r.out.includes('ZC:PASS') ? ['pass', '', r.ms] : ['fail', detail(r), r.ms];
}

async function runZinc(c, eng, text) {
  const dir = path.join(WORK, eng.strict ? 'strict' : 'gradual');
  const file = path.join(dir, keyOf(c.id) + '.js');
  fs.writeFileSync(file, text);
  const r = await exec(process.execPath, [ZINC_BIN, 'run', file, '--target', eng.target], { cwd: dir, env: { ...process.env, ...DETERMINISTIC }, timeout: eng.target === 'sim' ? TIMEOUT.sim : TIMEOUT.native });
  fs.rmSync(path.join(dir, 'build', `${keyOf(c.id)}-${eng.target}`), { recursive: true, force: true });
  return classify(c, r, true);
}
async function runRef(c, name, text) {
  const file = path.join(WORK, 'ref', keyOf(c.id) + '.cjs');
  fs.writeFileSync(file, text);
  const e = ENGINES[name];
  const r = await exec(e.cmd[0], [...e.cmd.slice(1), file], { cwd: path.join(WORK, 'ref'), timeout: TIMEOUT.ref });
  return classify(c, r, false);
}

async function runCase(c, engines, exhaustive) {
  let p;
  try { p = programs(c); } catch (e) { p = { skip: `harness error: ${e.message}` }; }
  const res = { suite: c.suite, area: c.area };
  if (c.sub) res.sub = c.sub;
  if (c.meta?.features?.length) res.features = c.meta.features;
  if (p.skip) { res.skip = p.skip; return res; }
  const r = res.r = {};
  for (const name of engines) {
    const e = ENGINES[name];
    if (e.zinc) {
      if (p.zinc.unsupported) { r[name] = ['unsupported', p.zinc.unsupported, 0]; continue; }
      // a program zinc-sim rejects is rejected by every Zinc variant (same front end; strict only adds errors)
      const from = !exhaustive && (r['zinc-sim']?.[0] === 'rejected' ? r['zinc-sim'] : e.strict && e.target !== 'sim' && r['zinc-sim-strict']?.[0] === 'rejected' ? r['zinc-sim-strict'] : undefined);
      r[name] = from ? ['rejected', from[1], 0, 'inherited'] : await runZinc(c, e, p.zinc.text);
    } else r[name] = await runRef(c, name, p.ref.text);
  }
  return res;
}

async function probes(engines) {
  const list = M.wintertc.apis.map(a => a.probe ?? a.api);
  const src = `const out = {};
for (const p of ${JSON.stringify(list)}) {
  let ok = false;
  try {
    if (p === 'globalThis') ok = typeof globalThis === 'object';
    else if (/^on/.test(p)) ok = p in globalThis;
    else if (p === 'navigator.userAgent') ok = typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string';
    else { let o = globalThis; for (const k of p.split('.')) o = o == null ? undefined : o[k]; ok = o !== undefined; }
  } catch { ok = false; }
  out[p] = ok;
}
console.log(JSON.stringify(out));
`;
  const file = path.join(WORK, 'ref', 'wintertc_probe.cjs');
  fs.writeFileSync(file, src);
  const outp = {};
  for (const name of engines.filter(n => !ENGINES[n].zinc)) {
    const e = ENGINES[name];
    const r = await exec(e.cmd[0], [...e.cmd.slice(1), file], { cwd: path.join(WORK, 'ref'), timeout: TIMEOUT.ref });
    try { outp[name] = JSON.parse(r.out.trim().split('\n').pop()); } catch { outp[name] = {}; }
  }
  return outp;
}

function version(name) {
  const e = ENGINES[name];
  if (e.zinc) return '';
  const r = spawnSync(e.version[0], e.version.slice(1), { encoding: 'utf8' });
  return ((r.stdout || r.stderr || '').split('\n')[0] ?? '').trim();
}

// ---- main
async function main() {
  if (flag('--report')) {  // offline: regenerate the page (and check / record the baseline) from a results file
    const res = JSON.parse(fs.readFileSync(val('--report'), 'utf8'));
    writeReport(res);
    if (flag('--update-baseline')) updateBaseline(res);
    if (flag('--check')) process.exit(check(res) ? 0 : 1);
    return;
  }
  fetchSources();
  if (flag('--fetch')) return;
  await loadTs();
  const wanted = (val('--engines', Object.keys(ENGINES).join(','))).split(',');
  const engines = wanted.filter(n => ENGINES[n] && (ENGINES[n].zinc || spawnSync('which', [ENGINES[n].cmd[0]]).status === 0));
  for (const n of wanted.filter(n => !engines.includes(n))) console.error(`compat: engine ${n} not found, skipped`);
  prepareWork();
  const cases = collect();
  console.error(`compat: ${cases.length} tests x ${engines.length} engines, ${JOBS} jobs`);
  const t0 = Date.now();
  const tests = {};
  let next = 0, done = 0;
  const exhaustive = flag('--exhaustive');
  await Promise.all(Array.from({ length: JOBS }, async () => {
    while (next < cases.length) {
      const c = cases[next++];
      tests[c.id] = await runCase(c, engines, exhaustive);
      if (++done % 50 === 0 || done === cases.length) console.error(`compat: ${done}/${cases.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
  }));
  const commit = spawnSync('git', ['-C', ZINC_ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const dirty = spawnSync('git', ['-C', ZINC_ROOT, 'status', '--porcelain', '--', 'compiler', 'runtime', 'lib', 'sim'], { encoding: 'utf8' }).stdout.trim() !== '';
  const results = {
    date: new Date().toISOString().slice(0, 10), commit, dirty, zincRoot: path.relative(ROOT, ZINC_ROOT) || '.',
    platform: `${process.platform}-${process.arch}`, host: { cpus: os.cpus().length }, durationS: Math.round((Date.now() - t0) / 1000),
    options: { suites: SUITES, filter: FILTER, exhaustive, jobs: JOBS },
    pins: Object.fromEntries(Object.entries(M.sources).map(([k, s]) => [k, { repo: s.repo, commit: s.commit, license: s.license }])),
    engines: Object.fromEntries(engines.map(n => [n, version(n)])),
    zincApis: ZINC_API, probes: await probes(engines),
    tests: Object.fromEntries(Object.entries(tests).sort(([a], [b]) => a < b ? -1 : 1)),
  };
  const full = !FILTER && SUITES.length === 4;
  const out = full ? path.join(HERE, 'results', `${results.date}.json`) : path.join(CACHE, 'last.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(results) + '\n');
  console.error(`compat: wrote ${path.relative(process.cwd(), out)} in ${results.durationS} s`);
  summary(results);
  if (full) writeReport(results);
  if (flag('--update-baseline')) updateBaseline(results);
  if (flag('--check')) process.exit(check(results) ? 0 : 1);
}

function summary(res) {
  const engines = Object.keys(res.engines);
  const rows = {};
  for (const t of Object.values(res.tests)) {
    if (t.skip) continue;
    for (const e of engines) { const s = t.r[e]?.[0] ?? 'n/a'; ((rows[t.suite] ??= {})[e] ??= {})[s] = (rows[t.suite][e][s] ?? 0) + 1; }
  }
  for (const [suite, byEng] of Object.entries(rows)) {
    console.log(`\n${suite}`);
    for (const [e, st] of Object.entries(byEng)) {
      const total = Object.values(st).reduce((a, b) => a + b, 0);
      console.log(`  ${e.padEnd(20)} ${String(st.pass ?? 0).padStart(5)}/${String(total).padEnd(5)} ${(100 * (st.pass ?? 0) / total).toFixed(1).padStart(5)}%  ${Object.entries(st).filter(([k]) => k !== 'pass').map(([k, v]) => `${k} ${v}`).join(', ')}`);
    }
  }
}

const BASELINE = path.join(HERE, 'baseline.json');
function updateBaseline(res) {
  const pass = {};
  for (const [id, t] of Object.entries(res.tests)) for (const [e, r] of Object.entries(t.r ?? {})) if (ENGINES[e]?.zinc && r[0] === 'pass') (pass[e] ??= []).push(id);
  fs.writeFileSync(BASELINE, JSON.stringify({ date: res.date, commit: res.commit, pins: res.pins, pass }, null, 1) + '\n');
  console.error(`compat: baseline updated (${Object.entries(pass).map(([e, l]) => `${e} ${l.length}`).join(', ')})`);
}
function check(res) {
  if (!fs.existsSync(BASELINE)) { console.error('compat: no baseline (run with --update-baseline)'); return false; }
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const reg = [];
  let gained = 0;
  for (const [e, ids] of Object.entries(base.pass)) {
    const set = new Set(ids);
    for (const id of ids) { const r = res.tests[id]?.r?.[e]; if (r && r[0] !== 'pass') reg.push(`${e} ${id}: ${r[0]} ${r[1] ?? ''}`); }
    for (const [id, t] of Object.entries(res.tests)) if (t.r?.[e]?.[0] === 'pass' && !set.has(id)) gained++;
  }
  for (const l of reg) console.log(`REGRESSION ${l}`);
  console.log(`compat check: ${reg.length} regression(s), ${gained} new pass(es)${gained ? ' (zinc compat --update-baseline to record them)' : ''}`);
  return reg.length === 0;
}

function writeReport(res) {
  const notes = path.join(HERE, 'notes.md');
  const md = report(res, M, fs.existsSync(notes) ? fs.readFileSync(notes, 'utf8') : '');
  fs.writeFileSync(path.join(ROOT, 'docs/reports/compat.md'), md);
  console.error('compat: wrote docs/reports/compat.md');
}

main().catch(e => { console.error(e); process.exit(2); });
