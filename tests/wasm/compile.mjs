// Compiles a Zinc source on build-wasm/zinc-compile.wasm under Node's WASI (ZN-774.29): node compile.mjs zinc-compile.wasm <checkout> <dir> <main.ts> <out.zbc>.
// The checkout is preopened at /zinc (lib/std, targets/capabilities.json), the program's directory at /p (main.ts is relative to it), the directory
// of out.zbc (a path of this machine) at /o.
// Prints the compile time on stderr when ZN_TIME is set. Exit code = the compiler's.
import { WASI } from 'node:wasi';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
const [,, wasm, root, dir, src, out] = process.argv;
const mod = await WebAssembly.compile(readFileSync(wasm));
const t0 = performance.now();
const wasi = new WASI({ version: 'preview1', args: ['zinc-compile', '/p/' + src, '/o/' + basename(out)], env: { ZINC_ROOT: '/zinc', ...(process.env.ZINC_PLATFORM ? { ZINC_PLATFORM: process.env.ZINC_PLATFORM } : {}) }, preopens: { '/zinc': root, '/p': dir, '/o': dirname(resolve(out)) }, returnOnExit: true });
const inst = await WebAssembly.instantiate(mod, wasi.getImportObject());
process.exitCode = wasi.start(inst);
if (process.env.ZN_TIME) console.error(`compile ${(performance.now() - t0).toFixed(1)} ms`);
