---
id: ZN-603
title: 'AOT program diet: hero 21.8 MB binary, 105 s build, 33.5 MB of C++'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-09 09:48'
updated_date: '2026-11-10 04:09'
labels:
  - perf
  - aot
milestone: m-21
dependencies:
  - ZN-431
priority: high
ordinal: 13900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Measure hero now; next lever: unreachable-function removal (ZN-431) and split translation units; set targets from the measure.

Owner 2026-10-09: 'how can it be so heavy?'. Measured on examples/hero: 21.8 MB binary (20.3 MB __TEXT), 105 s for zinc build, 33.5 MB of generated C++. Causes: (1) 2775 functions compiled, the whole zinc:ui and kit libraries: no unreachable-function removal (ZN-431); (2) the whole 3.25 MB ZBC module embedded (11.5 MB of decimal text) although every function is compiled: the program needs only the class, string, constant and global tables, and decoding and verifying it costs at every launch (ZN-592); (3) about 8 KB of C++ per function: every instruction carries its own error path with an inline message (shared trap labels per function would cut it); (4) one translation unit at -O2 (ZN-427).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hero AOT binary <= 8 MB and zinc build of hero <= 30 s (macOS arm64, -j3)
- [x] #2 the embedded module has no code words for functions that are compiled (tables only); interpreter and AOT frames identical
- [ ] #3 generated C++ of hero <= 10 MB
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: (1) the module the AOT program loads keeps its tables only (each function body is one Trap word, no constants or handlers: every function is compiled) and is run-length packed (zbc::packRuns / unpackRuns, runProgramPacked): the dense vtables of 1546 classes were 8.4 MB of 0xFF runs; hero's module 3.0 MB (10.8 MB of C++ text) -> 184 KB (0.54 MB), and nothing is decoded and verified at launch beyond the tables (jsonout AOT 3.3 -> 3.06 ms, native 2.6); (2) one error exit per function (Ltrap / Lrterr) instead of an inline error path on each of the 54,514 failing instructions; (3) -Wl,-dead_strip on macOS AOT links (-0.5 MB).
hero after ZN-431 + ZN-603: generated C++ 33.5 -> 16.6 MB, zinc build 105 -> 48 s, binary 21.8 -> 16.0 MB. -Os instead of -O2 only gives 15.96 MB: the size is the shape of the code and the data. AC1 and AC3 not reached: the rest (8 MB of baked fonts, 4.3 MB of code, 5 MB of runtime) is the follow-up task.
Tests: fib AOT golden refreshed, tests/run --changed 30/30, aot, canvas, ui, script, profile, layout_bridge, host_direct, run_compiled, reach_callbacks, export_wasm, macos_bundle, native_plugins, text_shaped, svg_lottie; interpreter = AOT frames on bouncing-ball, nuxt-ui, rn-showcase.
usage: n/a
Review 2026-10-25: reopened. The notes promise a follow-up for the remaining 8 MB of baked fonts, 4.3 MB of code and 5 MB of runtime, but none was filed. Hero is the showcase demo: measure the current size, move baked fonts to assets (or compress), and decide whether 30 s build is still a goal.
Review 2026-11-07: done-partly. Part done; hero binary <= 8 MB, build <= 30 s and C++ <= 10 MB not shown met. Evidence: AC2 ticked (tables-only module, run-length packed; hero module 3.0 MB -> 184 KB); one error exit per function done

### 2026-11-10 — current artifact audit and compatibility repair

Status remains **Backlog**: AC1 and AC3 fail their unchanged size limits. No optimization or gain over the historical numbers is claimed. Hero now contains 2,660 compiled functions; the old 1,678-function program and current shared-machine timings are not a matched comparison.

The first current build failed before code generation (Z0101, 0.82 s): fed3600d1 removed the gallery's exported `advanceUpload`, while both Hero and Hero without video still import and call it. Restored that existing four-line ticker in the shared gallery state provider. The standalone gallery does not call it and remains paused. Both Hero entry files and their feature sets are unchanged. No fonts, icons, controls, native plugins or budgets were removed or reduced.

One successful native build, Apple M1 Pro / arm64 / 10 physical cores / 16 GiB, Apple clang 17.0.0 (clang-1700.6.4.2), SDK 26.2, default `-O2`, `ZINC_JOBS=3`, embedded resources:

| Current artifact/check | Result |
| --- | --- |
| Native executable | **10,905,448 B**, over 8,000,000 B (also over 8 MiB) |
| Generated C++, all 57 units combined | **27,205,373 B**, over 10,000,000 B |
| Embedded resources (`hero.cpp.res`) | 1,879,059 B |
| Packed tables module | 418,769 B; tables-only emission remains in `src/aot/aot.cpp:494–500` |
| Native build wall time | 18.85 s; C++ compile phase 15.175 s; header precompile 1.088 s |
| Object cache | **0 of 57** C++ units reused; existing native plugin caches hit; normal `~/.zinc` caches |
| Build memory | `/usr/bin/time -l`: maximum RSS 292,585,472 B (not aggregate concurrent RSS) |
| Shared-machine load | Before build 5.18 / 4.96 / 5.21; after functional smokes 8.11 / 7.22 / 6.16 |

Timing is one indicative current build under shared activity, not a quiet-machine guarantee, benchmark or isolated before/after measurement. It is below 30 s in this run; AC1 stays unticked because the executable is too large. The native file also depends on external FFmpeg and system libraries; this is not a self-contained bundle-size measurement.

Provenance: source base `caf808bc8` plus the archived provider patch. Read-only common engine source `037a922f9`, executable SHA256 `29ffb93a19627fb7dc465badc12c9c292ffaa55bf1db76d458b81837f4b48155`; `git diff 037a922f9..HEAD -- include src runtime targets CMakeLists.txt` is empty. Native SHA256 `5c26322368a364db00e6afd4b150b73f340b01bffa4468760dafa141ded7a254`. The 57 C++ files, in sorted filename order with each filename followed by NUL and file bytes, have SHA256 `4a42c74dea7218624dcaa07864af21887aae5e7a37298a3ae2f75bd0664e9d5e`. `provenance.json` records each file's bytes/SHA256, the 27 linked native archives, flags, compiler, source hashes and complete command.

Build command, from this worker tree (all heavy commands went through the shared queue):

```sh
/Users/mowmow/Lab/zinc/tools/work-run 240 /usr/bin/time -l env ZINC_ROOT="$PWD" ZINC_JOBS=3 ZN_KEEP_CPP=1 ZINC_LOG=debug /Users/mowmow/Lab/zinc/.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc build examples/hero -o .logs/hero603/hero
```

Functional proof: `zinc check examples/hero` and `zinc check examples/hero-novideo` pass. Original Hero runs headless/deterministically for four frames on interpreter, AOT and QuickJS, exit 0; all three print `69f9a01da063a4e4`, `56190efc4e1cea57`, `28c500b1de4b8d5f`, `c30c6b0a0061f776`. AOT and interpreter PNGs are identical, SHA256 `87b8a78416bd1d6bd05a235e45afbfa0488c59a932146a7b274aa811ef2244aa`. An additional AOT `ZINC_DEMO=kit`, 30-frame run opens the original Kit page, with Upload at 70%; screenshot inspected. Reported AOT/interpreter/QuickJS four-frame RSS: 41,320,448 / 230,031,360 / 262,029,312 B. These are short correctness smokes, not timing or memory rankings. No new demo test was added; no engine change needed a rebuild or T0.

Artifact analysis before choosing a new optimization:

- A function unit repeats a 302,429 B prelude (206,065 B of struct declarations and 94,830 B of function declarations). Read-only text analysis predicts 10,839,779 B after retaining only declarations referenced in each unit, still above AC3. No speculative generator change was applied.
- Native `__TEXT,__text` is 7,312,840 B. The 57 generated objects have 3,320,480 B of `__text` in total before linker stripping/coalescing; this includes duplicate weak helpers and is not a final executable attribution. Largest object symbol spans: `f0` 219,600 B, `f268` 49,588 B, the rest below 20 KB. Rearranging C++ declarations cannot explain or remove the missing approximately 2.9 MB of native size. Attribute the linked libraries before another optimization.
- Existing D46/D68 and RTA/unused-layout passes already cover parallel units, check sharing, table-only embedding and unreachable methods. Primary references rechecked: [Apple code-size/dead-strip guidance](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/CodeFootprint/Articles/CompilerOptions.html) (archived guidance) and [LLVM transformation passes](https://www.llvm.org/docs/Passes.html). No new dependency is justified.

Durable evidence: `/Users/mowmow/Lab/zinc/.logs/hero-603-20261110/` (native executable, generated sources/resources, captures/scenes, build/run logs, source patch, `size-m.txt`, `dylibs.txt`, `object-symbol-spans.json`, `provenance.json`). The worker-local original is `.logs/hero603/`.

Handover / next command: produce a symbol-retaining diagnostic executable, **for attribution only**, then use `nm -n -U` and `size -m` to separate linked library code from generated app code. Do not repeat builds to seek a favorable time or change the limits. The existing object cache can reuse the function units; only output-path-dependent metadata/resources need recompilation.

```sh
/Users/mowmow/Lab/zinc/tools/work-run 120 env ZINC_ROOT="$PWD" ZINC_JOBS=3 ZN_KEEP_CPP=1 ZN_KEEP_SYMBOLS=1 ZINC_LOG=debug /Users/mowmow/Lab/zinc/.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc build examples/hero -o .logs/hero603/hero-symbols
nm -n -U .logs/hero603/hero-symbols > .logs/hero603/native-symbols.txt
size -m .logs/hero603/hero-symbols
```

The diagnostic build was **not run**. No suite, T1/T2, demo script, pixel comparison, benchmark, conformance, fuzz or CI was run. No owned process remains. Broader interaction and device proof are not claimed.

**Proposed tests** (owner chooses; no new test script): one bounded original Hero/novideo Kit screen session with keyboard and upload across its 100% wrap, each engine in sequence (roughly 20 s total, observed short-run RSS under 300 MB per process); proves the retained callers beyond startup. A future generator change should add and run only its exact T0, then rebuild Hero once to inspect all emitted bytes and the original program.

usage: n/a
<!-- SECTION:NOTES:END -->
