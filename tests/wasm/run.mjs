// Runs a .zbc on build-wasm/vm.wasm under Node's WASI (the headless runner of ZN-135; wasmtime does the same when installed): node run.mjs vm.wasm dir file.zbc. Prints the program's output; exit code = the program's.
import { WASI } from 'node:wasi';
import { readFileSync } from 'node:fs';
const [,, wasm, dir, file] = process.argv;
const wasi = new WASI({ version: 'preview1', args: ['vm.wasm', file], preopens: { '/': dir }, returnOnExit: true });
const mod = await WebAssembly.compile(readFileSync(wasm));
const inst = await WebAssembly.instantiate(mod, wasi.getImportObject());
process.exitCode = wasi.start(inst);
