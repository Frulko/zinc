# wasm plugin (`zinc:wasm`, the `WebAssembly` global)

This plugin runs WebAssembly modules.

- **Native.** The [wasm3](https://github.com/wasm3/wasm3) 0.5.0 interpreter (MIT, about 400 KB of C in
  `plugins/wasm/vendor/wasm3`, compiled with the program).
- **Sim.** V8's WebAssembly.
- **Global.** A program that names `WebAssembly` gets it as a global (see the [Web APIs](../guide/09-web-apis.md)
  chapter). The classes are imported from `zinc:wasm`.
- **Targets and `requires`.** Targets are macos, linux, rpi1 and rmpp. `requires` is `heap>=1M` (a memory page is
  64 KiB).
- **Test.** `tests/conformance/wasm.ts`, with a module assembled by hand.

```ts
import { Module, Instance, Imports } from 'zinc:wasm';
import * as fs from 'zinc:fs';

async function main(): Promise<void> {
  const bytes = fs.readBytes('add.wasm');
  const imports = new Imports().fn('env', 'log', (a: f64[]): f64 => { console.log('wasm says', a[0]); return 0; });
  const { instance } = await WebAssembly.instantiate(bytes, imports);
  console.log(instance.exports.call('add', [2, 3]));          // 5
  const mem = instance.exports.memory();                       // the exported memory
  console.log(mem.byteLength, mem.read(0, 4));
}
main();
```

## API

| API | |
|---|---|
| `WebAssembly.validate(bytes)`, `compile(bytes)`, `instantiate(bytes, imports?)` | `instantiate` resolves `{ module, instance }`. |
| `new Module(bytes)` | Throws `CompileError`. |
| `Module.imports(m)`, `Module.exports(m)` | `{ module, name, kind }` / `{ name, kind }`, read from the binary. |
| `new Instance(module, imports?)` | Throws `LinkError` when a function import is missing, `RuntimeError` when the start function traps. |
| `new Imports().fn(module, name, (args: f64[]) => f64)` | Host functions. The result is ignored for void imports. An exception in a host function traps the call. |
| `exports.call(name, args: f64[]): f64` | Returns 0 for a function without a result. Throws `RuntimeError` on a trap: `unreachable`, `integer divide by zero`, `integer overflow`, `out of bounds memory access`, `stack overflow`… (the sim maps V8's messages to these). |
| `exports.global(name)`, `exports.memory(name = 'memory')`, `exports.has(name)`, `exports.list()` | |
| `memory.byteLength`, `memory.read(offset, n): u8[]`, `memory.write(offset, u8[])` | Throws `RangeError` out of bounds. |

## Differences from the JS API

- **Exports are reached by name.** Write `exports.call('add', [2, 3])`, not `exports.add(2, 3)`: a Zinc object has no
  dynamic function properties.
- **Values cross as `f64`.** An `i64` beyond 2^53 loses precision, where JS uses BigInt.
- **One memory.** wasm3 supports one memory. `memory.grow` and `Table` are not exposed yet, and neither are `Global`
  objects (only reading exported globals), `Tag` / `Exception` or `compileStreaming`.
- **Validation is shallow.** wasm3 compiles function bodies lazily, so a malformed body is reported at the first call,
  not by `validate`.
- **No WASI.** txiki's `tjs:wasi` has no counterpart yet. wasm3 has a WASI layer (`m3_api_wasi.c`) that could be added
  as an option.
- **Interpreter speed.** wasm3 interprets without a JIT. It is typically 4–10× slower than V8 compiled code, and fast
  enough for plugins, scripting and portable algorithms.
