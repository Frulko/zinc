# wasm (`zinc:wasm`, the `WebAssembly` global)

## What it is
Run WebAssembly modules from a Zinc program (wasm3 interpreter), with the JS API's shape: validate, compile, instantiate, host imports, exported functions and memory. For plugins written in other languages, portable algorithms and scripting.

## Targets and status
- plugin.json: macos, linux, windows, rpi1, rmpp (all wasm3 sources). `requires: heap>=1M`. Not in the manifest: wasm, esp32, ps1/ps2, mobile.
- Doc: "macos, linux, rpi1 and rmpp"; windows is in the manifest but not the doc.
- QuickJS engine has its own `WebAssembly` from the separate wasm pack (WAMR, `zinc engine install wasm`, `tests/t1/wasm_pack.sh`, ZN-773.06): documented nowhere in docs/plugins/wasm.md.
- Tests: `tests/conformance/wasm.ts` (+ .out at three sizes), `wasm_pack`, `export_wasm`, `image_rect_wasm` (the last two are the web export, not this plugin). No `plugins/wasm/` mapping found in tests/affected.json.
- Later: ZN-772 (Spline modules under QuickJS), ZN-773.06 (WASI preview1), ZN-102 (Linux container conformance).

## What the docs have
- [x] Overview
- [~] Requirements (targets, heap); no word on the QuickJS pack
- [x] Quick start (but see stale)
- [~] API reference: table covers validate/compile/instantiate, Module, Instance, Imports, exports, memory. Missing `ModuleImportDescriptor`/`ModuleExportDescriptor` types, error classes list, `Instance.exports` field, `InstantiateResult`
- [x] "Differences from the JS API" is a strong section
- [ ] Runnable example in examples/ (none; a hand-assembled module lives only in tests)
- [ ] Screenshot/GIF
- [ ] Tutorial
- [ ] Commands (how to get an `add.wasm`: no `wat2wasm`, Rust, C or AssemblyScript recipe)
- [~] Notes: limits and speed good; nothing on WASI, host-function signatures, threading
- [~] Test named (conformance file)

## What is missing
1. A runnable `examples/wasm-add` with a small `.wasm` committed (or built from a `.wat`), printing the add and a memory read, plus `ZINC_HEADLESS=1 zinc run examples/wasm-add`.
2. Tutorial "Build and call a module from C": clang `--target=wasm32 -nostdlib -Wl,--no-entry -Wl,--export=add`, or Rust `wasm32-unknown-unknown`, or AssemblyScript; then load it with `fs.readBytes`.
3. Tutorial "Give a wasm module a host function" (Imports.fn, f64 only, trap on exception).
4. Explain wasm3 vs the QuickJS pack (WAMR): which engine gets which implementation, the `zinc engine install wasm` command, the `Memory`/`Table`/`Global` objects the pack offers that `zinc:wasm` does not.
5. Document the typed API gaps in a table: no `memory.grow`, `Table`, `Global`, BigInt i64, `compileStreaming`, WASI (ZN-773.06).
6. Types reference: `ModuleImportDescriptor`, `ModuleExportDescriptor` (`kind` values), `CompileError`/`LinkError`/`RuntimeError`, `InstantiateResult`.
7. Troubleshooting: lazily compiled bodies (error at first call), `heap>=1M` on small boards, trap messages list.
8. Windows row in the targets table; arm64 verification note.
9. Benchmark line (wasm3 vs QuickJS-pack) from `bench/`.
10. tests/affected.json mapping for `plugins/wasm/` and a small `tests/t0/wasm.sh` (the conformance file is frozen corpus).
11. rpi1/rmpp verification status (hardware).

## Wrong or stale
- "Sim. V8's WebAssembly": the Node prototype was removed 2026-10-20; the sim is now the device simulator (`src/sim`); `native/wasm.sim.ts` may be dead. Reword or remove.
- `plugins/wasm/index.ts` header cites `compiler/src/frontend.ts webGlobals` (compiler/ is gone).
- Doc: "Targets are macos, linux, rpi1 and rmpp" omits windows.
- Doc: "`WebAssembly` global ... on QuickJS" is implied; the QuickJS engine uses the pack, not wasm3.
- Quick start imports `Module, Instance` and never uses them.
- docs/guide/09-web-apis.md says "Runs on wasm3 natively": true for the typed engines only.

## Suggested pages
- API: wasm (generated)
- Guide: WebAssembly in Zinc (wasm3, the QuickJS pack, differences from the JS API)
- Steps: Compile C to wasm and call it
- Steps: Host functions and shared memory
- Examples: wasm-add, js-spline modules
- Notes: Limits (one memory, f64 values, no WASI) and speed
- Notes: Engines and `zinc engine install wasm`
