---
id: ZN-603
title: 'AOT program diet: hero 21.8 MB binary, 105 s build, 33.5 MB of C++'
status: Done
assignee: []
created_date: '2026-10-09 09:48'
updated_date: '2026-11-10 09:59'
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
- [x] #1 hero AOT binary <= 8 MB and zinc build of hero <= 30 s (macOS arm64, -j3)
- [x] #2 the embedded module has no code words for functions that are compiled (tables only); interpreter and AOT frames identical
- [x] #3 generated C++ of hero <= 10 MB
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

### 2026-11-10 — intermediate engine attribution and return-window work

Short primary-source research: Apple's code-size guide recommends dead stripping and avoiding excessive inlining (https://developer.apple.com/library/archive/documentation/Performance/Conceptual/CodeFootprint/Articles/CompilerOptions.html); ld64's atom model explains why direct references retain code while unused archive atoms disappear (https://github.com/apple-oss-distributions/ld64/blob/main/doc/design/linker.html). Existing links already enable dead-strip; no new dependency or optimization-level change was chosen.

One diagnostic relink reused the original 57 cached objects with current common archives, retaining symbols and writing a link map. The original release artifact is unchanged. Diagnostic SHA256 c6f422ab77101d6da394869f142474825d9b35344d9decaef91b5b57774a60a0; 11,924,640 B includes retained symbols and is NOT the size-gate result. Provenance captures every object/archive hash under .logs/hero603-diagnostic/provenance.json; exact map attribution is in attribution.json and hero.map. Current diagnostic __text is 7,325,400 B (the historical release was 7,312,840 B, so these are explicitly different linked libraries).

Live text attribution: generated app 3,003,248 B; SDL 1,102,060; graphics/system host 650,952; HarfBuzz 623,784; Mbed TLS 397,732; zstd 377,676; runtime 199,708; WebP decoder 164,620; window host 139,680. No frontend or IR atoms survive. Largest app function remains f0 at 219,600 B. TLS server and pack compressor code remains live through the full system host; Lottie/video default to full system-host metadata, while SVG already opts into lite.

Narrow emitter change in progress: copy back only a successful, non-void return slot after calls. The verifier invalidates the rest of every call window; reference ownership is explicit RC and native output arrays update their existing ArrObj, so no ownership is held by the removed slot assignments. Native promises have no immediate return, and zero-argument native calls need no input-slot copy. Error checks now precede copying the result. New semantic coverage exercises reference and scalar returns, void side effects, virtual calls, runtime array mutations, thrown calls, retained aliases, and existing native callbacks/promises. Source fixture passes zinc check with the common engine. Candidate engine build and exact T0 are pending the coordinator's build slot; no correctness or size gain is claimed yet.

Further evidence, not implemented: the raw 1,879,059 B resource blob losslessly compresses with zlib to 494,325 B (a size calculation only, no timing claim). Shared generated declarations counted once with all sources plus return-only copies are estimated near 9.97 MB; any header implementation must preserve exported artifacts and invalidate cached objects on common-header changes. AC1/AC3 remain open.

### 2026-11-10 — engine size criteria met

All acceptance criteria pass on source base `4f198e9c1afe6e58190e70fa03a454967bdfdfbb` plus the reviewed production patch SHA256 `000ec9776525076089e8c718e0a7afb3ff28da48b2fda8d37957b591e011071d`. This includes the integrated structural-record/optional-Dyn fixes and host provider locks. The proof engine SHA256 is `32278380b2505fb8e73a11a286414286fb9ccab12e964924c3154a8bd62d7748`.

| Final gate | Result |
| --- | --- |
| Native executable | **7,995,032 B**, 4,968 B below the strict decimal 8,000,000 B limit |
| Generated program source | **9,527,337 B**: all 57 C++ units plus the 302,442 B shared header |
| Inclusive generated-source accounting | **9,527,397 B**, also counting the existing 60 B cached PCH wrapper; below decimal 10,000,000 B |
| Compiled functions | **2,660**, the same count as the original artifact audit; no app source, assets, icons or features removed |
| Full native build | **19.16 s wall**, 14.141 s C++ compile phase, default `-O2`, `ZINC_JOBS=3`, **0/57** object-cache reuse |
| Build memory | `/usr/bin/time -l` maximum RSS 295,796,736 B; not aggregate concurrent compiler RSS |
| Embedded resources | 1,879,059 -> **404,041 B**, lossless; decoded SHA256 `49c8b84d87f3658a3362cfcd8d38cfb184f3772a5db3c38f30c8b5e92610709a` equals the original resource blob exactly |
| Embedded RLE tables | 418,786 -> **78,185 B**, lossless; functions still have only Trap placeholders and no compiled code/constants/handlers in their embedded metadata |

The final frontend checkpoint was rebased and regenerated once more: only the version in `ZINC_PROGRAM_INFO` changed; every function body, shared header and embedded table/resource byte matched the prior source. The actual rebuilt native artifact has the new SHA below and again compiled 0/57 cached objects. The earlier 16.99 s/source97af proof remains archived separately.

The build is one full observed run on the shared Mac (Apple M1 Pro, clang 17.0.0, SDK 26.2). It is not a quiet-machine benchmark or timing comparison. The executable retains the original external FFmpeg/system-library dependencies; this is not a self-contained bundle size claim.

Implementation: shared generated declarations with their content hash in every unit's cache key; copy back only a successful non-void return from call windows (including zero-input native calls and promise results); existing zstd at level 19 for native graphics table/resource bytes when smaller, with compiler-owned original sizes and frame/result validation. The resource temporary ends after the unchanged installer copies it. The bounded 418,786 B table temporary stays alive through `runProgramPacked()`. Raw stdout, cross, console, iOS/Android C++ export, `.app` and `--no-embed` routes are preserved explicitly. Installed SDK header availability is confirmed by `tools/package` copying all `src` headers.

Lottie/video opt into the existing lite system-host metadata after auditing every backend and common player: portable Lottie stdio/graphics; FFmpeg, Android MediaCodec, AVFoundation and webOS GStreamer with their own platform libraries. Native archives retain the same code. Full-host classification now also scans nested typed workers; undecodable workers conservatively keep the full host. Native/cross `usesNet`, recursive Script classification and opaque-plugin defaults were reviewed together.

Final feature proof: unchanged Hero and Hero-without-video pass `zinc check`. Interpreter, AOT and QuickJS all produce the historical four hashes `69f9a01da063a4e4`, `56190efc4e1cea57`, `28c500b1de4b8d5f`, `c30c6b0a0061f776`. All three PNGs are byte-identical, SHA256 `87b8a78416bd1d6bd05a235e45afbfa0488c59a932146a7b274aa811ef2244aa`. Native Detail/Lottie renders; original Hero video uses VideoToolbox and shows 20 distinct decoded positions through 0.7917 s. The headless video Canvas remains black on both the retained historical executable and the new one, even at 3.79 s with coloured source frames: decode/progress is proven, visible video-pixel playback is not claimed. No workaround or runtime/plugin rendering edit was made.

Exact T0s on the final source all pass: `aot` (<1 s), `aot_native_args` (2 s; reference/void/virtual/exception/native-callback semantics plus leak checks), `aot_declarations` (2 s; split programs, declaration invalidation, exports and normal/failure cleanup), `aot_embedded_blob` (1 s; resource and actual-table byte roundtrips, malformed lengths/truncation, tables-only metadata, parent/worker/nested/negative/malformed network classification), `aot_blob_routes` (<1 s; native versus raw stdout/export/bundle/external-resource output, using a rejected compiler to avoid unnecessary native builds). Tests were explicitly restricted to tier T0. No suite, T1/T2, demo script, pixel-comparison tool, benchmark, conformance, fuzz or CI run.

Durable evidence: `/Users/mowmow/Lab/zinc/.logs/hero-603-engine-20261110/last-combined/` has the complete generated sources/header/resources, native artifact, build/feature/test logs, input/archive hashes, compiler/configuration, source patch and screenshots. `provenance.json` SHA256 **`1b046cd09d07072c599bfcd5f0b638514fd060014cf1d278defc1c671b457181`**. Native SHA256 **`d71d64adca8f7b27a84ff233b23d60f8dd9e1cf7a8570be06758d1c1f92a539c`**. The adjacent diagnostic directory is the earlier attribution map, explicitly a different symbol-retaining link. The original ignored Big Buck Bunny file was copied unchanged into the worker tree for playback; SHA256 `f9056382cceab11235eaee562a7ca0b81dd9ac7d1c68b634350701031b66066b`.

Proposed decision (coordinator allocates a number if useful): reuse the existing zstd decoder and share declarations instead of adding a codec or relying on RLE alone. Qualitative RULES §4 scores: existing zstd path 63/70 (fit 5, performance 4, size 5, maintainability 4, supply 5, portability 4, effort 4); RLE-only path 55/70 (2,5,2,5,5,5,5), which misses the native limit. Revisit if a native target cannot afford the bounded temporary or full builds exceed the budget; target exports retain their prior raw path.

Proposed later lines (coordinator only):
- ZN-603: investigate Hero's headless Video Canvas invalidation; retained historical native also decodes moving frames while its Canvas stays black.
- ZN-603: recheck the strict native/source size gates when compiler, standard library or host code grows; native headroom is only 4,968 B.
- ZN-603: prove native packing on the real Linux/Mojave machines during the cross-platform pass; no off-Mac performance or size claim here.

**Proposed tests** (owner chooses): `tools/diff-matrix` at the next milestone, for language/call/exception parity over the corpus (about 10 min, under 1 GB); one bounded original Hero/novideo Kit session with keyboard and upload wrap on each engine (about 20 s per engine, estimated under 1 GB). No new demo test was written. No owned process remains.

usage: n/a
<!-- SECTION:NOTES:END -->
