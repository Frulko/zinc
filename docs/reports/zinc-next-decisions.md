# Zinc Next: decisions after M1 to M6 (ZN-031)

Recorded 2026-10-06 from the results of the proof of concept. They close the "Decisions still open" of `zinc-next-design.md` (section 10).

## 1. Name of the desktop app: **Zinc Atelier**

`ZincStudio` already names the macOS box editor, so the app needs another name. Criteria: short, says "a place where you make things" (editor,
devices, profiler in one app), not a generic word that is already a famous developer tool. "Forge" (Electron Forge, Minecraft Forge) and "Foundry"
(Palantir, Foundry VTT) were set aside for that reason. The command line keeps the name `zinc`; the app is **Zinc Atelier**.
Checked: no npm package and no GitHub repository of the closed spellings of the candidates. Not checked: trademarks and domains (task ZN-056).
Fallbacks if it is taken: Zinc Forge, Zinc Foundry.

## 2. Shell of the app: a Zinc app (zinc:ui), not a web shell

The app is written in Zinc on `zinc:ui` and runs on the engine like any other app (the end goal in the product vision: one self-contained
program for Windows, macOS and Linux; no Tauri, no Electron). The proof of concept shows the base is there: the whole `zinc:ui` stack
(Solid signals, kit components, layout, text) runs in the interpreter and in AOT and draws pixel-identical frames (ZN-044, ZN-045).
What is missing is planned as tasks ZN-047 to ZN-055: a live window and input, fonts and images baked by the engine, the host modules
apps need, the shell itself, the QuickJS path, a stable IR, packaging, Windows and Linux hosts, and hardware validation.

## 3. QuickJS: the full engine, as a second engine

QuickJS is kept as a full engine next to the interpreter and the AOT output, not only for `zinc:script`: it runs plain JavaScript (npm code,
`eval`, dynamic plugins) that the typed subset does not cover, behind the same host ABI. The typed engine stays the default and the fast path
(the interpreter is 3 to 6 times faster than QuickJS on the numeric kernels, ZN-026). Constrained targets are evaluated separately (ZN-043, mquickjs).
Task ZN-051.

## 4. `--emit=ir`: not stable now, and it must become stable

The IR text changed with almost every task of M3 to M6 (inlining, devirtualisation, closures, host calls), and its goldens are regenerated each
time. It stays unstable until the passes settle. The aim is a stable, versioned format: a spec, a version number in the dump, a parser that
reads it back, and a compatibility test over old dumps. Task ZN-052. Until then nothing outside the repository may depend on the text.

## Also settled

- `clang` is not replaced by an in-process backend for now: the pinned `zig c++` is downloaded, checked and used in about 20 s (ZN-029) and
  cross builds for aarch64, armhf and x86_64 work. Revisit if the toolchain size or the first-build time proves a problem for users.
- The default path for devices is bytecode upload to a preflashed core (ZN-030); AOT is the path for speed.

## 5. Name check for Zinc Atelier (ZN-056, 2026-10-06)

What was searched, and what came back (a web search and DNS and registry look-ups; no trademark office was queried, see the limits):

| Where | Result |
|---|---|
| Web search "Zinc Atelier" (software, app, trademark) | no product, company or mark of that name |
| Marks containing ZINC (USPTO listings found by the search) | several registrations of the single word ZINC for software and apps (TemTree Co., Senseeker Engineering, Silver-Katz Entertainment, Summum S.A.) and a mark of Zinc Labs Inc (OpenObserve); older products named Zinc: the Zinc Application Framework (a C++ GUI toolkit), Zinc Inc. (messaging) |
| Domains | `zincatelier.com` is registered (Cloudflare name servers, no site); `zincatelier.io` is not registered; `zincatelier.dev` and `.app` have no DNS records (probably free, to be confirmed at a registrar); `zincforge.com` is registered (Porkbun); `zincforge.dev` and `zincfoundry.com` have no records |
| Registries | `zinc-atelier` and `zincatelier` are free on npm, PyPI and crates.io |
| GitHub | no repository named zinc atelier |

**Decision.** Keep **Zinc Atelier** as the name of the app. No product carries it and the registries are free. The risk is the word ZINC, not Atelier: other owners hold ZINC marks in software classes, so
the name is used descriptively as "Zinc Atelier, the app of the Zinc language" and not registered as a mark by us until a lawyer has cleared it. Domain: register `zincatelier.dev` (or `.app`) first; `.com` is taken. Fallback if a
conflict appears: **Zinc Foundry** (`zincfoundry.com` looks free), not Zinc Forge (`zincforge.com` is taken). The legacy ZincStudio box editor keeps its name; the two do not coexist in one package
(Atelier is the app of the new engine, ZincStudio belongs to the old compiler).

Limits: a trademark office search (USPTO, EUIPO, WIPO) and a registrar's availability check are not scriptable from here; the table is evidence for the decision, not legal advice.

## 6. MicroQuickJS (ZN-043, 2026-10-06)

Measured (`zinc-next-mquickjs.md`): about as fast as QuickJS, 4 to 7 times slower than the Zinc interpreter; 103 KB of Thumb-2 code against 125 KB for the Zinc core; 8 KB of heap for fib against a 24 KB register file, and 4 bytes per number in an array
against 8. It runs ES5 strict mode only, so the ES2022 path of ZN-051 does not carry over. **Decision: not adopted, not vendored.** Revisit for a product that needs user JavaScript on a device with under 100 KB of free RAM; then as a fallback engine behind `zinc:script`.

## 7. Parity plan decisions (2026-10-07)

Made under `next/RULES.md` from the four parity audits in `docs/reports/parity/` (01 language and standard library, 02 examples, 03 plugins and targets, 04 library choices). Scores follow RULES.md section 4; the reasoning and the evidence are in the audit files.

| # | Question | Decision | Why in one line | Revisit when |
|---|---|---|---|---|
| D1 | Native-module ABI | Evolve `runtime/include/zinc_abi.h` v4 into `next/include/zn/native.h`: a typed export table with the signature letters of `runtime.h`, bound by name at load, one `CallNative` opcode, versioning and finalizers from Node-API, own/borrow rules from WIT. libffi only for `zinc:ffi` | Exists and is tested on two engines; plugin C++ links unchanged through a `zrt` marshalling layer; no rewrite of ~12 000 lines | An ABI v2 is needed by a plugin that cannot express its API |
| D2 | Plugins: shared library or linked in | Desktop interpreter: one shared library per plugin, built and cached by the pinned zig; AOT programs and firmware: static link, registered by generated code | Small `zinc`, hot reload, cache; static where there is no dynamic loader | A target without `dlopen` needs the desktop path |
| D3 | Prototype plugin C++ | Compatibility adapters (`src/native/zrt_compat`) keep the 22 native specs unchanged; new native code uses the C ABI | Same behaviour at once, no churn | The adapters cost more than 10% on a plugin benchmark |
| D4 | PS2 | Build-only gate; the PCSX2 runner runs only when the owner supplies a BIOS path | An emulator cannot run without a BIOS we may not ship | The owner supplies a BIOS |
| D5 | PS1 | Spike first (a freestanding runtime and fixed-point lowering), the target afterwards; not on the critical path | Largest and most uncertain target | The spike's verdict |
| D6 | Raspberry Pi | `aarch64-linux` is the primary Pi target (qemu-user as the gate); armv6 (`armhf`) secondary | Matches `raspberry-pi.md`; 64-bit Pi OS is the shipped OS | A Pi 1 product need |
| D7 | Sockets and event loop | libuv on desktop and Pi, llhttp plus own glue for HTTP, wslay for WebSocket, mbedTLS for TLS and crypto; mongoose and wolfSSL rejected for licence | Mature, MIT/Apache, portable (also what a later Windows port needs) | Footprint on small targets |
| D8 | SVG and Lottie | ThorVG for both on desktop-class targets; nanosvg stays for the tiny profile. Goldens are re-baked in their own commits with a tolerance, the shared rasterizer remains the reference for shapes | Proven, maintained, one library for two formats instead of 1800 custom lines | A pixel regression the tolerance cannot absorb |
| D9 | Display simulation depth | Level 1 (window plus frame hashes) for all, Level 2 (chip models for SSD1306, ST7789, WS2812, IS31FL3730, QMI8658 behind a bus shim) for the shipped boards | "Validated by simulator" must mean the bus bytes were checked | Chip models prove too costly for a panel |
| D10 | Regex, Unicode, JSON, numbers | QuickJS-ng libregexp/libunicode (split files), libunibreak, yyjson, fast_float, dragonbox | Same regex semantics as the JS engine, fastest permissive options | A measurement says otherwise (each adopting task measures) |
| D11 | Fonts, images, rendering | stb_truetype plus a desktop HarfBuzz/SheenBidi tier; stb_image/stb_image_write, libwebp as plugin; software rasterizer is the reference and GLAD GL 3.3/GLES3 a second path; SDL3 vendored statically | Keeps pixels stable and sizes small; GPU is an addition | GPU path drift in goldens |
| D12 | Media | VideoToolbox/V4L2 first, dav1d and openh264 as run-time plugins, miniaudio/minimp3 for audio; FFmpeg only as a dynamically loaded plugin (LGPL) | Licence safety | A format gap |
| D13 | JIT | No JIT now. If measured need appears, a sljit baseline JIT from ZBC. The AOT and the typed interpreter already meet the performance gates; the prototype's AArch64 JIT is not ported | Complexity and security surface for no measured gain | Interpreter needs another 2x on a target without a compiler |
| D14 | Fast-math AOT (ZN-042) | No fast-math: bit-identical rounding across engines is a product rule. nbody stays about 2.9x native; vectorization without FMA contraction is a separate optimisation task | Determinism over a benchmark | Owner asks |
| D15 | Corpora and fuzzing | test262 subset, WPT URL/encoding data, wasm testsuite, JSONTestSuite as pinned data; libFuzzer with ASan/UBSan on the parser and the ZBC verifier | Reuse existing oracles | none |

| D16 | Nullable scalars (ZN-065) | `T \| undefined` for number and boolean is the existing boxed `T \| null` representation (undefined reads as null). `Map.get` and `find`/`at` of scalars return it through generated lookups; truthiness of a nullable number or boolean uses a generated test | No new IR slot kind; reuses the Dyn-era box and its compare | Measured cost of the boxes on a hot path |
| D17 | Narrowing of property paths (ZN-066) | Paths of locals, `this`, fields and constant or local indexes (`this.head`, `n.next.next`, `a[i]`) narrow like variables. A write to a local, field or element forgets the paths below it; a call `p.m()` forgets the paths below `p`; a loop forgets what it writes or calls on. Calls of free functions forget nothing (as tsc); `m.get(k)` is not a path | Sound for the common aliasing, no whole-program analysis, close to tsc so demos keep compiling | A demo needs call-through writes via a free function |
| D18 | undefined versus null (ZN-074) | The two share one representation (a null reference, or a null box for scalars). The distinction is in the type: a union with null carries an `undef` flavour (optional fields and parameters, `T \| undefined`, `Map.get`, find, at, `a?.b`, a variable declared without a value) and the code generated for printing, templates, typeof and JSON follows it; a union that mixes a plain null in is a null one. Files that use Dyn values keep the Dyn undefined | No change to values, so the fast path and the IR are untouched (bench-m4 unchanged); a value that is null in one place and undefined in another prints by its static type, not by its history | A program that stores both into one variable and prints it |
| D19 | JSON and number formatting stay in tree (ZN-092, revises D10) | The runtime keeps its own JSON.parse into Dyn (a strict recursive parser that shares keys, short strings and small numbers) and `std::to_chars` for number printing; yyjson, fast_float and dragonbox are not added to the runtime. Scored 1-5 by speed / size / risk: keep 4/5/5, yyjson then convert 3/3/3 (a second tree and a second pass to build the Dyn), fast_float and dragonbox 3/4/4 (the C++ library already gives shortest round-trip digits, the ECMAScript layout is ours) | Measured first: JSONTestSuite 95 y_ accepted, 188 n_ rejected, the 35 i_ as Node (tests/t1/jsontestsuite.sh); String(number) hash of 1 000 000 doubles of every magnitude equals Node (tests/golden/run/number_print.ts). The one slow part was JSON.stringify of a Dyn tree, written in Zinc: now a runtime call (bench/json.ts: parse+stringify x10 1373 ms to 227 ms; QuickJS 690 ms). No new library, no size change | A platform whose libc++ lacks `std::to_chars` for double (the ESP32 firmware has its own printing); a document nested deeper than 1000 levels (Node accepts more) |
| D20 | `// @ts-ignore` and `// @ts-expect-error` (ZN-094) | Not honoured: a comment never hides a diagnostic. Scored by predictability / parity / effort: refuse 5/4/5, honour 3/3/2 | One rule for every file; the registry says what is wrong and the fix is in the code (a cast, an annotation, the construct). The prototype honoured them only through tsc, which Next does not run | A migrating project with ts-ignore lines gets new errors, listed in docs/diagnostics-vs-tsc.md |
| D21 | Native code versus stand-ins (ZN-101, refines D2) | `ZINC_NATIVE=auto` (default): a stand-in `x.next.ts` / `x.sim.ts` next to the spec wins when there is one, native code is built when there is none; `real` forces the plugin's native code (an error naming the cause when it cannot be built), `sim` is today's behaviour. The shared library exports `zn_module_<Name>` (one module per plugin spec) instead of one `zn_module_open`. Scored by parity / determinism / effort: auto 5/5/5, real-first 3/2/3 | The 49 demos that run today keep their stand-ins; golden tests stay deterministic and need no compiler; a plugin without a stand-in becomes usable at once | `real` by default once every plugin builds in CI and a stand-in is only a fallback |
| D22 | zinc:script on the engine's QuickJS-ng (ZN-103, applies D10) | A built-in native module `QuickJS` (src/qjs/script_native.cpp, the C ABI, registered by `zinc` and linked into AOT programs that use it) implements plugins/script/native/quickjs.spec.ts. `unknown` crosses as JSON text (generated wrappers `__nativeJson` / `__nativeValue` / `__nativeArgs`), a script function as `{"__zn_fn": n}` (a handle into the Vm's table, sent back it becomes the function). The plugin's own vendored QuickJS and its zrt::Dyn host.cpp are not used by Next. Scored by one-engine / parity / effort: this 5/4/3, the plugin's vendored copy through the thunk 2/5/4 (two QuickJS in one process, symbol clashes under -rdynamic) | One QuickJS, one regexp and unicode, no zrt in the script path; the prototype keeps its own host.cpp | Values whose JSON form loses information (NaN, undefined inside arrays, cycles) differ from the prototype's Dyn snapshot |
| D23 | SVG and Lottie renderers (ZN-106, revises D8) | Keep the prototype's own renderers (plugins/svg/native/svg.host.cpp, plugins/lottie/native/lottie.host.cpp): they already run unchanged through the plugin pipeline (thunk + cache + dlopen/static link) on the host library's rasterizer and are the parity baseline of every demo. ThorVG stays a later quality upgrade (more of the SVG and Lottie specs, expressions), to be weighed against a pixel-diff budget. Scored by parity / effort / coverage: keep 5/5/3, ThorVG 3/2/5 | No pixel re-bake and no 1 MB dependency for the same demos; the galleries draw real content now; the `.next.ts` metadata-only stand-in of lottie is removed | A demo needs a Lottie or SVG feature the custom renderers lack (then vendor ThorVG behind the same Spec) |
| D24 | Vector tiles (ZN-108, revises D11 for the map) | Keep the prototype's map engine (plugins/map/native/map.host.cpp: its own MVT decoder, triangulation and MapLibre-subset style evaluator): it already runs unchanged through the plugin pipeline and renders both map examples. protozero, vtzero and earcut.hpp stay a later upgrade if decoding cost (about 90 ms per new tile) matters on small targets. Scored by parity / effort / speed: keep 5/5/3, rewrite on protozero+vtzero+earcut 3/1/4 | No new vendored code and no pixel re-bake; the map draws real tiles | Pan cost on the Pi or a demand for more of the style spec |
