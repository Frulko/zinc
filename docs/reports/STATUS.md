# Prototype status — increment 3 (2026-09-28)

All numbers below come from commands in this repository on an Apple Silicon Mac (Apple Clang 21, Node 24.14,
Docker Desktop with QEMU emulation). `zinc test` reruns the conformance suite.

## Conformance (TST-01/02: sim oracle vs target, byte for byte)

18 programs in `tests/conformance/` (language tour, errors, async/generators, features, modules, Dyn, UI in Solid /
React / Inferno, PocketJS Hero, ink, Lottie, 3D…) plus golden HIR/MIR dumps. Latest runs: macOS 18/18, `--profile ps1`
18/18, `--profile esp32` 18/18 (gradual-only Dyn programs are skipped in strict profiles). The cross-target rows
below were last run at increment 2 with 9 programs.

| Target | How it runs | Result |
| --- | --- | --- |
| `macos` (f64) | native, release (TLSF) and `--debug` (ASan + UBSan, 0 live objects at exit) | 9/9 |
| `macos --profile ps1` / `--profile esp32` | native, emulating fixed point Q20.12 / f32 | 9/9 each |
| `linux` | GCC in `zinc/sdk-linux` (Docker) | 9/9 |
| `rpi1` | ARMv6 hard-float (`armv6kz+fp`, VFPv2) in `zinc/sdk-rpi1`, QEMU `arm1176`, 1280x720 profile | 9/9 |
| `ps1` | PS-EXE (PSn00bSDK) run headless in PCSX-Redux (interpreter, OpenBIOS), fixed point | 9/9 (modules not available on ps1 skipped) |
| `esp32` | ESP-IDF v6.0 firmware in Espressif QEMU (Xtensa), UART output | 8/8 (modules test skipped) |
| `ps2` | EE ELF (`mips64r5900el-ps2-elf`, ps2sdk + gsKit display, libpad) — build only, running needs PCSX2 + BIOS | all available programs build |
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
| CLI: check, build, run, test, bench, export, init, dev, monitor, doctor, infer | ✅ | `pack` missing |
| Frontend TS 6 isolated, strict, `noLib` + zinc.d.ts, JSX lowering | ✅ | |
| Diagnostics Z1xxx (forbidden), Z2/Z4 (memory/float), Z5 (modules), Z6 (UI), Z9 (unsupported), LSP JSON | 🟡 | no per-code fixture suite (TST-04) |
| HIR / MIR / SSA passes (CMP-06/08) | 🟡 | `--emit=hir` (typed, desugared) and `--emit=mir` (SSA + CFG; folding, branch pruning, block merge, DCE), golden tests in `tests/golden`; inspection stages, the emitters still walk the AST (decision 0013); MIR skips try/async/generators; no inlining, devirtualisation, ranges, bounds, escape or RC passes |
| Generics (templates + explicit inference), tuples, unions, destructuring, spread, `?.` | ✅ | chained `?.`, call spread, labeled statements missing |
| Errors (RT-05): throw/try/catch/finally via status returns, Error subclasses | ✅ | `finally` inside async functions not supported |
| async/await, Promise, microtasks, generators (protothread frames) | ✅ | await inside loop conditions / catch blocks rejected with a diagnostic |
| `using` / Symbol.dispose | ✅ | |
| Numbers: f64, f32, fixed Q20.12/Q16.16 bit-identical with sim, i32 wrap, loop-counter inference | ✅ | |
| Memory: RC (RAII), TLSF on hal_heap_region, pools, arenas (runtime escape check), weak refs, incremental freeing, leak report | 🟡 | RC is RAII not compiler-inserted (0001); arena escape checked at runtime, not compile time; `heap: 0` mode and cycle warnings missing |
| Runtime: strings UTF-8/UTF-16, arrays, Map/Set, JSON, console levels/time/count/assert/table, JSON log mode | ✅ | number → string uses libc (0003) |
| UI: flexbox (wrap, margins, absolute), Tailwind-like classes + CSS imports, images, engine animations, Solid (keyed `<For>`, ownership), React (reconciled, keys, class components), Inferno and PocketJS compatibility | ✅ | PocketJS Hero compiles unchanged; no text selection/editing widgets |
| UI kit `zinc:ui/kit` (shadcn-style components, light/dark themes, same code under Solid and React; [ui-kit](../ui-kit.md)) | ✅ | no hover; Slider sets on click (no drag); Inter Regular/Bold only |
| 2D: shared software rasterizer (AA shapes, gradients, shadows, strokes, paths, runtime TTF glyphs, images, runtime images, render-to-image), multi-rect damage, HiDPI | ✅ | SDL3 (Retina), canvas (wasm, 1x), PS1 VRAM bands (~20 fps breakout: float rasterizer without FPU), PS2 gsKit (unrun), display plugins: fbdev, KMS/GL, SSD1306, ST7789, WS2812, reMarkable e-ink |
| Modules: sys, fs, storage, assets, net (fetch+server), osc, mqtt, telemetry, gpio, events, user native specs | ✅ | esp32: NVS, SPIFFS, esp_http_client, driver/gpio (no WiFi station bring-up yet); rpi1: libgpiod |
| Web platform (WinterTC minimum common API) as globals: URL, Encoding, events, abort, fetch / Request / Response / Headers, Blob / File / FormData, MessageChannel, crypto, structuredClone, WebAssembly ([guide ch. 9](../guide/09-web-apis.md)) | 🟡 | pure Zinc (`lib/std/web.ts`, `fetch.ts`), every target; WPT URL data 896/896 + setters 278/278; no streams, compression, URLPattern, CryptoKey operations ([parity report](txiki-elsa-parity.md)) |
| System: signals on the event loop, env / cwd / pid / stdin (`zinc:sys`), fs stat / readDir / mkdir -p / rm -r / watch / temp dirs, `zinc:os`, `zinc:path`, `zinc:assert` + `zinc test <dir>` | ✅ | watch polls (100 ms); POSIX hosts only for signals and `zinc:os` |
| Targets: macos, linux, sim, wasm, rpi1, rmpp (reMarkable Paper Pro), esp32, ps1 (PS-EXE, PCSX-Redux), ps2 (build) | 🟡 | PS2 never run (BIOS); nothing validated on real hardware yet |
| Dyn / `zinc infer` (section 9) | 🟡 | gradual: `any`/`unknown` are a NaN-boxed `Dyn` (JSON.parse, property get/set, index, `in`, `typeof`, ECMAScript operators, checked conversions, narrowing); strict: Z1006/Z1016; `dynSites` in report.json, `--no-dyn`; `zinc infer` (call sites, fields read, allocation sites) and `zinc build app.js` (decision 0014). No `word` representation, per-site caches or function specialisation (DYN-03/04/12) |
| 3D | 🟡 | `zinc:3d`: scene graph, primitives, OBJ, Gouraud/flat, perspective-correct textures, z-buffer, near clipping (software, all targets incl. fx12); no three.js API compatibility, no transparency/fog |

## Plugins (optional, `zinc plugins`)

| Plugin | Verified on | Not verified |
| --- | --- | --- |
| `zinc:video` (FFmpeg, VideoToolbox / V4L2 M2M) + display `fbdev` | macOS (gapless loop measured), rpi1 in QEMU (software decode) | real Pi decode/output |
| `zinc:mapping` + display `gl` (+ web companion) | macOS (OSC + companion driven, screenshots) | Pi 3B+/4 KMS/EGL |
| `zinc:map`, `zinc:svg`, `zinc:gestures` | macOS, rpi1 in QEMU | Pi 1 frame times |
| `zinc:gphoto2` | macOS with the fake camera, rpi1/linux builds | a physical camera |
| displays `ws2812`, `ssd1306`, `st7789`, `zinc:pixelfont` | macOS emulators, esp32 firmware in QEMU (frame checksums) | real panels / LEDs |
| `zinc:ink` + display `rmpp` | macOS e-ink emulator, aarch64 static build | the tablet |
| `zinc:lottie` | macOS vs lottie-web (12 files), esp32/rpi1 QEMU | — |
| `zinc:3d` | macOS (f64 and fx12), rpi1/esp32 QEMU | real hardware timings |
| `zinc:devtools` + `zinc dev` | macOS (hot reload ~0.5–1.2 s, red box, scripted CDP client), linux docker | Chrome DevTools frontend |
| `zinc:socket` (TCP / UDP / Unix, DNS, WebSocket client + server) | macOS (loopback conformance, ASan) | linux / rpi1 builds, real networks |
| `zinc:sqlite` (bundled amalgamation 3.53.4) | macOS (conformance vs node:sqlite, ASan) | rpi1 / rmpp builds |
| `zinc:ffi` (dlopen, no libffi) | macOS arm64 (conformance, ASan) | linux x86-64 |
| `zinc:wasm` / `WebAssembly` (wasm3 0.5.0) | macOS (conformance vs V8, ASan) | rpi1 / rmpp builds |

## Known debt

`grep -rn "ponytail:" compiler runtime targets lib sim` lists every deliberate shortcut with its ceiling.
Decisions: `docs/decisions/`.
