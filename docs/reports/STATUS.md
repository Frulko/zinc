# Prototype status — increment 2 (2026-09-28)

All numbers below come from commands in this repository on an Apple Silicon Mac (Apple Clang 21, Node 24.14,
Docker Desktop with QEMU emulation). `zinc test` reruns the conformance suite.

## Conformance (TST-01/02: sim oracle vs target, byte for byte)

9 programs in `tests/conformance/`: language tour, errors, async/generators, features (unions, destructuring,
weak refs, pools, arenas), built-in modules, Solid UI, `text` screen in Solid and in React (identical layouts).

| Target | How it runs | Result |
| --- | --- | --- |
| `macos` (f64) | native, release (TLSF) and `--debug` (ASan + UBSan, 0 leaks) | 9/9 |
| `macos --profile ps1` (Q20.12 fixed point) | native | 9/9 |
| `linux` | GCC in `zinc/sdk-linux` (Docker) | 9/9 at last run |
| `rpi1` | ARMv6 hard-float (`armv6kz+fp`, VFPv2) in `zinc/sdk-rpi1`, QEMU `arm1176` | 6/6 of the pre-UI suite |
| `ps1` profile | MIPS I (R3000 ISA, `-march=mips1`) under `qemu-mipsel`, fixed point | 6/6 of the pre-UI suite (modules test skipped: not available on ps1) |
| `ps2` | EE ELF (`mips64r5900el-ps2-elf`, ps2sdk) — build only, running needs PCSX2 + BIOS | all programs build |
| `esp32` | ESP-IDF v6.0 firmware, Espressif QEMU, UART output | `hello` verified; suite: see `esp32-test` run |
| `wasm` | emscripten, canvas HAL, verified in Chrome (breakout) | manual |

## Measured sizes

| Item | Size |
| --- | --- |
| `hello` macOS executable (NFR-04 ≤ 200 KB) | ~70 KiB (73.8 KiB with assets + telemetry) |
| `breakout` wasm | 61 KiB `.wasm` |
| `hello` esp32 firmware (whole image incl. IDF) | 128.7 KiB |

## Coverage by area

✅ done · 🟡 partial · ❌ missing

| Area | Status | Notes |
| --- | --- | --- |
| CLI: check, build, run, test, export, init, dev, monitor, doctor | ✅ | `infer`, `bench`, `pack` missing |
| Frontend TS 6 isolated, strict, `noLib` + zinc.d.ts, JSX lowering | ✅ | |
| Diagnostics Z1xxx (forbidden), Z2/Z4 (memory/float), Z5 (modules), Z6 (UI), Z9 (unsupported), LSP JSON | 🟡 | no per-code fixture suite (TST-04) |
| HIR / MIR / SSA passes (CMP-06/08) | ❌ | direct AST → C++ (decision 0004); C++ compiler optimises |
| Generics (templates + explicit inference), tuples, unions, destructuring, spread, `?.` | ✅ | chained `?.`, call spread, labeled statements missing |
| Errors (RT-05): throw/try/catch/finally via status returns, Error subclasses | ✅ | `finally` inside async functions not supported |
| async/await, Promise, microtasks, generators (protothread frames) | ✅ | await inside loop conditions / catch blocks rejected with a diagnostic |
| `using` / Symbol.dispose | ✅ | |
| Numbers: f64, f32, fixed Q20.12/Q16.16 bit-identical with sim, i32 wrap, loop-counter inference | ✅ | |
| Memory: RC (RAII), TLSF on hal_heap_region, pools, arenas (runtime escape check), weak refs, incremental freeing, leak report | 🟡 | RC is RAII not compiler-inserted (0001); arena escape checked at runtime, not compile time; `heap: 0` mode and cycle warnings missing |
| Runtime: strings UTF-8/UTF-16, arrays, Map/Set, JSON, console levels/time/count/assert/table, JSON log mode | ✅ | number → string uses libc (0003) |
| UI: host ABI + flexbox + classes + wrap/align (in Zinc), Solid model, React model, canvas, focus navigation | 🟡 | no Inferno, no images, unkeyed lists, React re-renders whole components (no diff) |
| 2D backends: SDL3 (macos/linux), canvas (wasm) | 🟡 | ps1 GPU, ps2 gsKit, esp32 SPI LCD, rpi1 KMSDRM not written; those HALs are text-only |
| Modules: sys, fs, storage, assets, net (fetch+server), osc, mqtt, telemetry, gpio (simulator), events, user native specs | 🟡 | esp32 variants of fs/storage/net/gpio and libgpiod on rpi1 not written |
| Targets: macos, linux, sim, wasm, rpi1, esp32, ps2 (build), ps1 (ISA validation) | 🟡 | PS-EXE packaging (PSn00bSDK), PCSX2/PCSX-Redux runs, real hardware not done |
| Dyn / `zinc infer` (section 9) | ❌ | `any`/`unknown` are rejected |
| 3D (three.js scene graph) | ❌ | |

## Known debt

`grep -rn "ponytail:" compiler runtime targets lib sim` lists every deliberate shortcut with its ceiling.
Decisions: `docs/decisions/0001`–`0010`.
