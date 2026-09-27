# Prototype status — increment 1 (2026-09-27)

Goal of this increment: go end to end as early as possible — one TypeScript source compiled to native code
on macOS (and Linux through Docker), with the `sim` oracle producing identical output, plus playable demos.
It covers most of **M1** and parts of M0, M2 and M5. Tests were deliberately left out at this stage (owner's request).

## Measured

All numbers from `node compiler/bin/zinc.mjs build …` on an Apple Silicon Mac (Apple Clang 21, Node 24.14), release build unless noted.

| Item | Result |
| --- | --- |
| `examples/hello` executable (NFR-04 target ≤ 200 KB, not stripped) | 70.3 KiB |
| `examples/breakout` executable (SDL3 linked dynamically) | 74.4 KiB |
| Zinc compile time (TS → C++) for the examples | 60–110 ms |
| `examples/lang` + `examples/hello`: sim vs macos, sim vs linux (GCC, Docker), sim vs macos `--profile ps1` | byte-identical |
| `examples/lang --debug` (ASan + UBSan, leak report) | clean, 0 live objects at exit |
| `bouncing-ball`, `breakout` on macOS | 60 fps (vsync), verified with `ZINC_SHOT` captures |

## Coverage against the specification

Legend: ✅ done · 🟡 partial · ❌ not started

| Area | Status | Notes |
| --- | --- | --- |
| CLI `check`, `build`, `run`, `doctor` (CMP-01, §14) | 🟡 | no `init`, `test`, `bench`, `export`, `infer`, `pack`, `dev`; no `zinc.config.ts` yet |
| Frontend on `@typescript/typescript6`, isolated (CMP-02, CMP-21) | ✅ | only `frontend.ts` imports `typescript` |
| Strict typecheck before codegen, `noLib` + `zinc.d.ts` (CMP-03, CMP-04) | ✅ | |
| `Z####` diagnostics, LSP JSON (CMP-05, CMP-14) | 🟡 | forbidden constructs `Z1001`–`Z1013`; unsupported features report `Z9xxx`; no fixtures yet |
| HIR / MIR / SSA passes (CMP-06, CMP-08) | ❌ | C++ emitted straight from the checked AST (decision 0004) |
| Generics (CMP-07) | 🟡 | emitted as C++ templates (monomorphization by the C++ compiler) |
| C++17 emission, CMake (CMP-09) | 🟡 | single translation unit instead of one file per module (decision 0004) |
| `#line` in debug (CMP-10) | ✅ | `--debug` |
| `sim` emitter with Zinc numeric semantics (CMP-11) | ✅ | `\|0`, `Math.imul`, `Math.fround`, checked array access, deterministic `Math.random` |
| Build report (CMP-13) | 🟡 | `report.json`: size, modules, profile; no per-site allocation or stack data |
| Deterministic output (CMP-15) | 🟡 | no timestamps, relative paths in CMake; not verified by a test |
| Machine types, `number` profiles (LNG-02/03) | 🟡 | f64 and f32 profiles; **fixed point (Q20.12) not implemented** (decision 0005) |
| `i32` inference for loop counters (LNG-04) | 🟡 | `for (let i = 0; i < n; i++)` patterns only |
| Strings UTF-8 with UTF-16 indices, shared slices (LNG-06, MEM-20) | ✅ | ASCII fast path |
| Arrays, Map, Set ordered (LNG-07, LNG-19) | ✅ | bounds checked, no holes, stable sort (RT-11) |
| Classes, inheritance, abstract, statics, accessors, interfaces (LNG-08/09) | 🟡 | a class extends one class *or* implements one interface; structural conversions refused (`Z9002`) |
| Unions, `T \| null`, enums (LNG-11/12) | 🟡 | nullable references and numeric enums; no discriminated unions yet |
| Closures (LNG-13) | ✅ | capture by value, cells for reassigned captures, non-escaping `const` lambdas never allocate |
| Errors (LNG-15, RT-05) | ❌ | `throw` panics with the `.ts` position; `try/catch` refused (decision 0006) |
| `async`/`await`, generators, `using` (LNG-16/17) | ❌ | timers (`setTimeout`/`setInterval`) work |
| Number → string like JS (LNG-20) | ✅ | shortest round-trip via libc on hosted targets (decision 0003) |
| Reference counting, immortal literals (MEM-02/03/05) | 🟡 | RAII smart pointer, not compiler-inserted (decision 0001) |
| Arenas, pools, TLSF, `heap: 0`, weak refs, escape analysis (MEM-07…17) | ❌ | allocation goes through `hal_alloc` (malloc) (decision 0002) |
| Debug leak report, sanitizers (MEM-18) | 🟡 | live-object count at exit, ASan/UBSan in `--debug`; no per-site `.ts` line yet |
| Runtime C++17 without STL/exceptions/RTTI, `-Wall -Wextra -Werror` (RT-01/02) | ✅ | built with Clang and GCC |
| `console.log` formatter shared with sim (RT-07) | ✅ | |
| Null HAL, virtual clock (RT-12, TST-10) | ✅ | `ZINC_FRAMES` |
| `zinc:gfx` immediate API, frame loop (UI-12, UI-13) | 🟡 | clear, rect, line, text (8×8 font), input; no replay recording yet |
| Solid / React models, flexbox, retained UI (UI-02…11) | ❌ | |
| Native modules (NAT) | ❌ | |
| Targets `macos` (P0) | 🟡 | SDL3 window, `--profile` emulation of number kind and resolution |
| Target `linux` (P0) | 🟡 | builds and runs headless in `zinc/sdk-linux` (Docker); no SDL3 in the image yet |
| Targets `rpi1`, `esp32`, `ps2`, `ps1` | ❌ | profiles exist only for `--profile` emulation |
| Dyn / JS inference (section 9) | ❌ | `any`/`unknown` are refused |

## Known debt

Search the sources for `ponytail:` comments; each names its ceiling and the upgrade path.
The larger items are the decisions in `docs/decisions/0001`–`0006`.

## Suggested next steps

1. Conformance tests (`tests/conformance/*.ts` + `.out`) and a `zinc test` differential runner — `scripts/parity.sh` is the manual version.
2. Error returns for `try/catch/finally` (RT-05), then `using`.
3. TLSF over `hal_heap_region`, arenas and pools (MEM-07…10), then compiler-inserted RC with borrowing.
4. Fixed-point profile (`fx12`) in runtime and sim, then the PS1 toolchain image (PSn00bSDK).
5. Discriminated unions, destructuring, spread, optional chaining.
