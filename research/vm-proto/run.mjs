// Builds the dispatch prototype, runs every strategy and the reference engines on the same kernels, and prints a
// markdown table of median wall-clock times (spawn to exit, like scripts/bench.mjs).
//   node research/vm-proto/run.mjs [--runs 7] [--only fib,nbody]
// Hermes is used when HERMES / HERMESC point at its CLI binaries (e.g. from `npm pack hermes-engine-cli`).
import { spawnSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(HERE, 'build');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const RUNS = Number(opt('--runs', 7));
const KERNELS = opt('--only', 'fib,mandelbrot,nbody,spectralnorm').split(',');
const { HERMES, HERMESC } = process.env;
mkdirSync(OUT, { recursive: true });

const sh = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
function must(r, what) { if (r.status !== 0) throw new Error(`${what} failed:\n${r.stdout}${r.stderr}`); return r; }
function time(cmd, args) {
  const ms = []; let out = '';
  for (let i = 0; i < RUNS; i++) {
    const t = process.hrtime.bigint();
    const r = must(sh(cmd, args), `${cmd} ${args.join(' ')}`);
    ms.push(Number(process.hrtime.bigint() - t) / 1e6);
    out = r.stdout.trim();
  }
  ms.sort((a, b) => a - b);
  return { ms: ms[RUNS >> 1], out };
}

const cxx = ['clang++', '-std=c++20', '-O2', '-fno-math-errno', path.join(HERE, 'vm.cpp')];
must(sh(cxx[0], [...cxx.slice(1), '-o', path.join(OUT, 'vm')]), 'clang++');
const pn = sh(cxx[0], [...cxx.slice(1), '-DPRESERVE_NONE', '-o', path.join(OUT, 'vm-pn')]).status === 0;
const VM = path.join(OUT, 'vm');

const cols = [
  ['switch', [VM, 'switch']], ['goto', [VM, 'goto']], ['goto-direct', [VM, 'goto-direct']],
  ['tail', [VM, 'tail']], ['tail-acc', [VM, 'tail-acc']], ['tail-acc nofuse', [VM, 'tail-acc', '--nofuse']],
  ['tail-acc inline', [VM, 'tail-acc', '--inline']],
  ...(pn ? [['tail-acc preserve_none', [path.join(OUT, 'vm-pn'), 'tail-acc']]] : []),
  ...(process.platform === 'darwin' && process.arch === 'arm64' ? [['jit', [VM, 'jit'], 'mandelbrot'], ['jit-pin', [VM, 'jit-pin'], 'mandelbrot']] : []),
];
const rows = [];
for (const k of KERNELS) {
  const ts = path.join(ROOT, 'tests/bench/kernels', `${k}.ts`);
  const js = path.join(OUT, `${k}.js`);
  writeFileSync(js, 'if (typeof console === "undefined") globalThis.console = { log: print };\n' + stripTypeScriptTypes(readFileSync(ts, 'utf8'), { mode: 'strip' }));
  const b = must(sh('node', [path.join(ROOT, 'compiler/src/cli.ts'), 'build', ts, '--release']), `zinc build ${k}`);
  const native = path.resolve(ROOT, (b.stdout + b.stderr).match(/-> (\S+)\s*$/m)[1]);
  const r = { k };
  for (const [name, [cmd, ...args], only] of cols) if (!only || only === k) r[name] = time(cmd, [k, ...args]);
  r['Zinc native'] = time(native, []);
  r.QuickJS = time('qjs', [js]);
  if (HERMES && HERMESC && existsSync(HERMES)) {
    const hbc = path.join(OUT, `${k}.hbc`), hjs = path.join(OUT, `${k}.hermes.js`);
    // ponytail: Hermes 0.12 (the last CLI on npm) has no `class`; rewrite nbody's one class into a constructor function
    writeFileSync(hjs, readFileSync(js, 'utf8').replace(/class (\w+) \{[^]*?constructor\(([^)]*)\) \{([^]*?)\n  \}\n\}/, 'function $1($2) {$3\n}'));
    must(sh(HERMESC, ['-O', '-emit-binary', '-out', hbc, hjs]), 'hermesc');
    r['Hermes (hbc)'] = time(HERMES, [hbc]);
  }
  r.Node = time('node', [ts]);
  const ref = r.QuickJS.out;
  for (const [name, v] of Object.entries(r)) if (name !== 'k' && v.out !== ref) throw new Error(`${k}: ${name} printed ${v.out}, QuickJS ${ref}`);
  rows.push(r);
  console.error(`${k}: ok (${ref})`);
}

const names = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(n => n !== 'k');
const f = x => x === undefined ? '—' : x < 10 ? x.toFixed(1) : x.toFixed(0);
console.log(`| Kernel | ${names.join(' | ')} |\n|${' --- |'.repeat(names.length + 1)}`);
for (const r of rows) console.log(`| ${r.k} | ${names.map(n => f(r[n]?.ms)).join(' | ')} |`);
const best = 'tail-acc';
const others = names.filter(n => !cols.some(c => c[0] === n) && rows.every(r => r[n]));
console.log(`\nRatios of ${best} (time / other engine's time; < 1 means the VM is faster):\n`);
console.log(`| Kernel | ${others.map(n => `vs ${n}`).join(' | ')} |\n|${' --- |'.repeat(others.length + 1)}`);
for (const r of rows) console.log(`| ${r.k} | ${others.map(n => (r[best].ms / r[n].ms).toFixed(2) + 'x').join(' | ')} |`);
const gm = n => Math.exp(rows.reduce((s, r) => s + Math.log(r[best].ms / r[n].ms), 0) / rows.length);
console.log(`| geomean | ${others.map(n => gm(n).toFixed(2) + 'x').join(' | ')} |`);
