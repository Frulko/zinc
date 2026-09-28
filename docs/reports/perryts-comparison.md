# PerryTS and Zinc: what to learn

Research summary, 2026-09-28, from these sources:
- https://www.perryts.com/ and https://docs.perryts.com;
- the blog posts on the generational GC and on compiling Claude Code;
- the https://github.com/PerryTS/perry repository (docs/src, benchmarks, perry-diagnostics).

## PerryTS in one paragraph

PerryTS compiles TypeScript and JavaScript ahead of time to native code.
- **Pipeline:** SWC → HIR → LLVM 22, a Rust workspace of about 90 crates.
- **Runtime:** NaN-boxed values and a per-thread generational tracing GC. Types are erased (`--type-check` is optional).
- **Bet:** npm compatibility, with about 95–97% of Node's own test suite passing across 53 `node:*` modules.
- **UI:** native platform widgets through a SwiftUI-like API.
- **Targets:** 11 desktop, mobile, watch, TV and web targets; nothing embedded.
- **Size:** about 330 KB for hello world, with about 3.2 ms startup.

Its strengths are presentation and process:
- rustc-style diagnostics with codes and `perry explain`;
- a `check --fix` command;
- benchmarks published with the rows it loses, raw JSON artifacts and a staleness check;
- doc examples compiled in CI;
- one-line installs (npm, brew, winget, apt).

## Zinc compared

| | PerryTS | Zinc |
|---|---|---|
| Typing | erased, optional tsc | strict TS checker, machine types (`i32`, `fx12`), gradual `Dyn` opt-in |
| Memory | generational GC | deterministic refcount, TLSF, pools, arenas, `@weak` |
| Concurrency | OS threads with deep-copied messages | single-threaded async; the renderer is parallel in bands |
| UI | native widgets | one pixel-identical renderer for every target (e-ink, LED matrices included) |
| Targets | desktop, mobile, web | + ESP32, Pi 1, reMarkable, PS1/PS2 |
| Size | ~330 KB, ~3.2 ms | ~70 KiB, ~2 ms |
| Verification | Node-parity test suites | byte-exact sim oracle on every target, plus pixel goldens |
| Packages | npm | none yet |

**Positioning:** "TypeScript for devices: deterministic, tiny, verified". Don't compete with "your Node code just works".

## Adopted practices and their status

| # | Practice | Status |
|---|---|---|
| 1 | Editor setup matching the compiler: tsconfig with Zinc's lib, `zinc:*` paths, JSX typings, tsserver plugin | **done**: `zinc init`, `zinc tsconfig`, `lib/editor/` |
| 2 | Honest benchmark headline: geometric mean of ratios, name the losses | **done**: PERF.md, README, scripts/bench.mjs |
| 3 | Diagnostic registry: code, title, why, fix, example; code frames; `zinc explain Z1008`; generated docs table; one fixture per code | todo |
| 4 | `zinc check --fix` for mechanical rewrites (`var`→`let`, `in`→`has`...), with confidence tiers | todo |
| 5 | Benchmark rigor: 11 runs, p95 / σ, idle machine and clean tree, versioned JSON artifact, peers (XS, Espruino, MicroPython), compile times | todo |
| 6 | Generated compatibility matrix (target × program / module / plugin) with a CI gate | todo |
| 7 | Executable docs: compile every guide sample in CI, marker-checked numbers | todo |
| 8 | Distribution: npm package (`npx zinc init`), prebuilt SDK images, `zinc doctor` install hints | todo |
| 9 | Incremental builds: one translation unit per module, cached runtime / plugins, published cold and hot times | todo |
| 10 | Packages carrying a `"zinc"` field resolved from node_modules | todo |
| 11 | End-of-build notice listing Dyn and unsupported sites (gradual profile) | todo |
| 12 | Debugging page: lldb / CodeLLDB with the emitted `#line` | todo |
| 13 | Website: Getting started / Language / Limitations / Targets / Modules / CLI / Internals, compare pages, llms.txt | todo |
