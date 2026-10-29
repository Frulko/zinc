# script (`zinc:script`, `zinc:script/fast`)

## What it is
Run JavaScript inside a Zinc app, sandboxed with time and memory limits: user scripts, game mods, live-coded visuals, rules that change without a rebuild. `zinc:script/fast` is a numbers-only fast path for hot calls.

## Targets and status
- plugin.json: macos, linux, rpi1, rmpp (QuickJS-ng amalgam), `sim` (node flags). `requires: heap>=4M`. Windows, android, ios are not listed.
- Doc: same, plus esp32/ps1/ps2/wasm refused (Z5003/Z5005). ESP32 "not enabled".
- Tests: `tests/t1/script.sh`, conformance `script_basic`, `script_async`, `script_fast`; affected.json maps plugins/script to `webgl_js`, `webgl_surface`, `three`, `webgl_gizmo`, `webgl_studio`.
- Examples: examples/scripting/{playground,breakout-mods,bench}; also used by webgl-cube, webgl-studio.
- Later: ZN-772 (Spline modules), ZN-712 measurement.

## What the docs have
- [x] Overview and sandbox model
- [x] Requirements (heap, availability table, binary size)
- [x] Quick start / API snippet
- [x] API reference: full `Script` member table, value model, errors, limits, async, ES modules
- [~] `zinc:script/fast`: one example, no signature table
- [x] Example code
- [x] Runnable examples in examples/scripting with README
- [x] Screenshots (docs/img/script-playground.png, -error.png, -breakout-mods.png); only the first is embedded in docs/plugins/script.md
- [ ] Step-by-step tutorial
- [~] Commands (3 `zinc run` lines; no `--engine quickjs` explanation, no Windows)
- [~] Troubleshooting: error kinds and limits documented; no "my script times out" recipe
- [x] Tests named only indirectly (conformance programs, no explicit test line)

## What is missing
1. Embed `script-breakout-mods.png` and `script-playground-error.png` in the doc (files already in docs/img).
2. A 6-step tutorial "Let players mod your game": expose `log`, load `assets/rules.js`, hot-reload on edit, handle ScriptError, set limits (based on breakout-mods).
3. A `ScriptOptions`/`ErrorInfo`/`ScriptEngine` reference table generated from index.ts, plus `ScriptFunction` and `createEngine`.
4. `zinc:script/fast` API table (`NumFn`, `exposeNum`, `callNum` n semantics) and when to use it vs `expose`.
5. A "which engine am I on" note: `zinc run --engine quickjs` (the program's own JS) vs `zinc:script` (embedded sandbox) vs the WebAssembly pack.
6. GIF of the playground live-coding (ZINC_FRAMES + capture) and of the bench output.
7. Troubleshooting page: timeouts in headless runs, `Z9043` on bad `expose` parameters, `ReferenceError: could not load module`, "no console".
8. Windows/android/ios targets: state whether supported; manifest lacks them. (owner)
9. ESP32-S3 PSRAM path: (hardware) experiment before documenting as possible.
10. Recipe: expose `setTimeout`/`fetch` via `exposeAsync` (doc points at a conformance file only).
11. Name the T1 test `tests/t1/script.sh` in the doc.

## Wrong or stale
- "QuickJS is C, so the build compiles `.c` ... (`compiler/src/cli.ts`)": compiler/ was removed 2026-10-20.
- "builds an adapter (`emit-cpp.ts` `dynFnAdapter`, `sim/zinc.mjs` `$z.dynfn`)": prototype files; the engine is C++ now (`src/frontend`, AOT in `src/aot`).
- "The sim" section: `node:vm` stand-in; the Node sim was removed, the bench README still says `--target sim for the node:vm numbers`. Verify `native/quickjs.sim.ts` still runs; otherwise delete the section and the sim row of the table and of the measurements.
- "Embedding a compiled application": cites `node tests/engines/embedded.mjs`, `zinc_vm.h`, `embedded.cpp` "is the prototype's and is not in this tree" - the section documents what does not exist here; move to docs/reports or delete.
- "zinc build file.ts --engine zinc-vm", ZBC4: check against current ZBC version.
- Last line "Next only (the prototype has no such module)": prototype wording.
- "ESP32 profile is strict": check against targets/capabilities.json.
- Measurements say "Apple M1 Pro" correctly; the Mac sizes ("+1008 KiB") not re-checked.

## Suggested pages
- API: script (generated: Script, ScriptError, ScriptFunction, ScriptOptions)
- API: script/fast
- Guide: Sandbox, limits and errors
- Guide: Values across the boundary (Dyn model)
- Guide: ES modules, async and host functions
- Steps: Let players mod your game (breakout-mods)
- Steps: A live-coding canvas (playground)
- Examples: playground, breakout-mods, bench, webgl-studio
- Notes: Measurements, engine choice, targets, ESP32
