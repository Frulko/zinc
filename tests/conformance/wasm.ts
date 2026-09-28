// zinc-test: requires heap>=1M process
// WebAssembly (plugins/wasm): wasm3 natively, V8 on the sim. The module (assembled by hand) exports add, callHost
// (calls the imports env.log and env.hostAdd), div (traps on zero), half (f64), mul64 (i64), trap (unreachable), its
// memory with "hi zinc" at 16, and the global answer = 1234.
import { Module, Instance, Imports, LinkError, CompileError, RuntimeError, ModuleExportDescriptor, ModuleImportDescriptor } from 'zinc:wasm';

const bytes: u8[] = [0, 97, 115, 109, 1, 0, 0, 0, 1, 32, 6, 96, 2, 127, 127, 1, 127, 96, 1, 127, 0, 96, 0, 1, 127, 96, 1, 124, 1, 124, 96, 2, 126, 126, 1,
  126, 96, 2, 127, 127, 1, 127, 2, 25, 2, 3, 101, 110, 118, 3, 108, 111, 103, 0, 1, 3, 101, 110, 118, 7, 104, 111, 115, 116, 65, 100, 100, 0, 5, 3, 7, 6,
  0, 2, 0, 3, 4, 2, 5, 3, 1, 0, 1, 6, 7, 1, 127, 0, 65, 210, 9, 11, 7, 64, 8, 3, 97, 100, 100, 0, 2, 8, 99, 97, 108, 108, 72, 111, 115, 116, 0, 3, 3, 100,
  105, 118, 0, 4, 4, 104, 97, 108, 102, 0, 5, 5, 109, 117, 108, 54, 52, 0, 6, 4, 116, 114, 97, 112, 0, 7, 6, 109, 101, 109, 111, 114, 121, 2, 0, 6, 97,
  110, 115, 119, 101, 114, 3, 0, 10, 57, 6, 7, 0, 32, 0, 32, 1, 106, 11, 12, 0, 65, 42, 16, 0, 65, 40, 65, 2, 16, 1, 11, 7, 0, 32, 0, 32, 1, 109, 11, 14,
  0, 32, 0, 68, 0, 0, 0, 0, 0, 0, 224, 63, 162, 11, 7, 0, 32, 0, 32, 1, 126, 11, 3, 0, 0, 11, 11, 13, 1, 0, 65, 16, 11, 7, 104, 105, 32, 122, 105, 110, 99];

console.log(WebAssembly.validate(bytes), WebAssembly.validate([0, 97, 115, 109, 2, 0, 0, 0]), WebAssembly.validate([1, 2, 3]));
const m = new Module(bytes);
console.log(Module.imports(m).map((d: ModuleImportDescriptor) => `${d.module}.${d.name}:${d.kind}`), Module.exports(m).map((d: ModuleExportDescriptor) => `${d.name}:${d.kind}`));
try { new Instance(m); } catch (e) { console.log(e.name, e instanceof LinkError, e.message); }
try { new Module([0, 97, 115, 109, 1, 0, 0, 0, 99]); } catch (e) { console.log(e.name, e instanceof CompileError); }

const logged: f64[] = [];
const imports = new Imports()
  .fn('env', 'log', (a: f64[]): f64 => { logged.push(a[0]); return 0; })
  .fn('env', 'hostAdd', (a: f64[]): f64 => a[0] + a[1]);
async function main(): Promise<void> {
  const { instance } = await WebAssembly.instantiate(bytes, imports);
  const x = instance.exports;
  console.log(x.call('add', [2, 3]), x.call('add', [0x7fffffff, 1]), x.call('callHost'), logged, x.call('half', [3]), x.call('mul64', [6, 7]), x.call('div', [-7, 2]));
  console.log(x.global('answer'), x.has('memory'), x.list().length);
  const mem = x.memory();
  console.log(mem.byteLength, mem.read(16, 7), String.fromCharCode(mem.read(16, 1)[0]));
  mem.write(0, [1, 2, 3]);
  console.log(mem.read(0, 4));
  for (const f of [(): f64 => x.call('div', [1, 0]), (): f64 => x.call('trap'), (): f64 => x.call('nope'), (): f64 => x.call('add', [1])]) {
    try { f(); } catch (e) { console.log(e.name, e instanceof RuntimeError, e.message); }
  }
  try { mem.read(65530, 10); } catch (e) { console.log(e.name, e.message); }
  const second = new Instance(m, imports);
  second.exports.memory().write(16, [72]);
  console.log('instances are separate:', String.fromCharCode(x.memory().read(16, 1)[0]), String.fromCharCode(second.exports.memory().read(16, 1)[0]));
}
main();
