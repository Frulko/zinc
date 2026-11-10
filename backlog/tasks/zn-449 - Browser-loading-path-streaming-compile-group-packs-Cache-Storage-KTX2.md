---
id: ZN-449
title: 'Browser loading path: streaming compile, group packs, Cache Storage, KTX2'
status: Done
assignee: []
created_date: '2026-10-09 07:36'
updated_date: '2026-11-10 13:14'
labels:
  - games
  - assets
  - size-L
milestone: m-22
dependencies:
  - ZN-432
  - ZN-433
  - ZN-439
  - ZN-446
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
compileStreaming for app.wasm. One pack per group, fetched with progress counted against boot-manifest sizes. Cache Storage under content-hashed names. KTX2 transcoded in the worker. Inline splash. Report: docs/reports/games/toolchain-assets-loading.md (6.7).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 in headless Chrome the splash is visible before app.wasm finishes
- [x] #2 a second visit fetches no pack from the network
- [x] #3 a KTX2 texture draws
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented ZN-449 on branch work/449 (isolated worktree; source base f8e61be28).

- wasm export reuses the release asset build and emits boot.json (group names, entry names/kinds, exact pack sizes, target RAM budget), SHA-256-named ZPK files and no duplicate app.res/source asset tree. The worker keeps legacy ArrayBuffer/compiled-Module and app.res callers. The inline splash exists before any script; the page compileStreams app.wasm and clones its Module to the worker.
- Cache Storage is scoped by the absolute app-directory URL. Stream progress uses manifest body-byte sizes; every hit is SHA-256 checked and every entry passes the shared ZPK Reader (bounds, index, codecs and stored-data hashes). Corrupt hits are deleted/refetched; denied/quota cache access downloads normally. Groups/requests use explicit states, cancellation generations and shared-request reference counts; stale image completion after unload is refused. Handles retain entries after unload, and the existing target RAM budget applies to resident buffers, held entries and texture decode. One pack decode is bounded to 256 MB; textures to 4096x4096.
- KTX2 ETC1S/UASTC uses unmodified, pinned Basis Universal 2.50 sources (Apache-2.0), not an unrelated cached binary. The separate ktx2.wasm is exported only when needed and lazily compileStreamed on the first KTX2 image lookup. Its NotTried/Loading/Ready/Failed lifecycle retains the failure and retries intentionally on the next lookup. Canvas2D consumes RGBA32; no new WebGL renderer or compressed-GPU-upload claim. The texture importer records the standard KTX2 DFD premultiplied-alpha flag and its cache version is bumped, preserving premultiply:false.
- The clean wasm build exposed missing shared Math linkage. Only tools/build-wasm was wired to existing V8/CORE-MATH sources; the wasm-only fenv constants preserve WebAssembly's fixed nearest rounding/no observable exception flags. Plain WASI vm stays free of browser asset/Basis linkage. C/C++ objects invalidate on build-script changes, and the C loop includes pow.h/math_fenv.h dependency checks. Asset-free export ignores stale packs from earlier cooking passes.

Primary research (coordinator's short research worker, completed before implementation): MDN compileStreaming https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/compileStreaming_static ; CacheStorage https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage ; upstream transcoder guide https://github.com/BinomialLLC/basis_universal/wiki/How-to-Use-and-Configure-the-Transcoder ; pinned wrapper https://github.com/BinomialLLC/basis_universal/blob/v2_50/webgl/transcoder/basis_wrappers.cpp . Reused Zinc's validated Reader and existing canvas path as recommended.

Decision proposal (no number allocated in worker): keep ZPK/raw-image support in the base reactor, load Basis as a sidecar. Weighted scores (fit/performance/size/maintenance/licence/portability/effort, weights 3/3/2/2/2/1/1): monolithic Basis 5/4/2/5/5/4/5 = 60; lazy sidecar 5/5/4/4/5/4/4 = 64; new GPU renderer now 3/4/2/2/5/3/1 = 43. Revisit the Canvas RGBA choice when the browser graphics host supplies a compressed texture upload contract.

Proof, 2026-11-10 on development Mac, Chrome 157.0.8103.40 (all commands bounded through tools/work-run, one process at a time):
- tools/build zinc and tools/build-wasm pass. No new warning; existing nanosvg sign-compare and initial clean-build src/agent/dev.cpp missing-field warning remain outside scope.
- build/zinc check tests/data/wasm_loading/main.ts passes; tests/run --only wasm_loading passes (shared request completion, corrupt/denied cache, cancellation, RAM rejection, malformed actual wasm boundary, optional decoder failed fetch/retry).
- Headless browser holds app.wasm after 64 bytes: inline Loading splash visibly rendered before response completion (screenshot inspected). After release, the unchanged fixture loads a 760-byte lazy group, draws UASTC/premultiplied and ETC1S/straight textures; sampled over black: [120,40,20] and [119,40,20], expected [120,40,20], tolerance 5. First visit 1 pack network request; second visit 0 with HTTP cache disabled. Math output: NaN, -0, 5e-324, NaN, -0 for pow/sin edge cases.
- The asset-free hello export with a deliberately stale cooked pack has no pack and no ktx2.wasm. Its ZBC runs successfully on the plain WASI vm through Node. Manual reproducible command: ZINC=build/zinc timeout 60 tests/wasm/loading_export.sh (same focused feature proof; outside tiers).

Sizes/provenance (release -O2, pinned zig; no timing/RSS benchmark claim): clean math-fixed vm-web 677758 B; monolithic adapter 1912244 B; final base 755134 B (+77376 B over clean), optional Basis sidecar 1271721 B, combined 2026855 B (+114611 B versus monolith, separate libc/Zstd cost). Plain WASI 681438 B. Final SHA256: vm-web fffc34d80be13caec1ce2d76278a1a2301fec10e3684957e6fc7b53db706f0d2; sidecar e6dc70700ec61cb11596b1da4de6c66e5c702b8c9c824db1995cd27a92f03f8e; vm 6a95860a3eb38db41ba9addb88d374c0115201783a86247b7284b6d2859618d6. Basis tag v2_50 commit 9bebe16726b3a61c8c213eeee3b7cffb462ef34e: 28 upstream files, 4082374 B, Git blob IDs verified while fetching; all 28 per-file SHA256SUMS rechecked. LICENSE/NOTICE/PIN retained; local Zstd include forwards to existing pinned Zstd 1.5.7. No installed toolchain or global SDK changed.

Proposed tests (owner chooses; not run):
- tests/run --only export_wasm (~10-30 s, memory unmeasured): original hello/forms export compatibility.
- tests/run --only image_rect_wasm (~15-40 s, memory unmeasured): the existing sprite/image export expectation now checks boot.json instead of app.res.
- tests/run --only web_dev_wasm (~10-30 s, memory unmeasured): dev export/reload callers.
- tests/run --only texture (~seconds to encoder build cost, memory unmeasured): broader imported texture formats and metadata cache change.
- Manual other-browser JSPI/CacheStorage checks and larger group churn (~1 min, memory unmeasured); Chrome/Edge 137+ is the documented lazy-import minimum, no Safari/mobile proof.

No suites/T1/T2/demo/pixel compare/benchmark/conformance/fuzz/CI runs. No runtime core, main.cpp, UI, renderer/HAL or other protected changes touched. No processes left running. Suggested later line: ZN-449: verify optional compressed GPU uploads when the browser renderer supports them; current supported path decodes RGBA32 for Canvas2D.
usage: n/a
Coordinator root common0e8bd9b90/compiler3ec59faa independently rebuilds identical wasm hashes and passes exactwasm_loading, actualChrome3AC/empty stale-pack exclusion/plainWASI. Hero7,994,920B/source9,537,381B inclusive and all3fourhashes pass. D292; durable .logs/archive-completed-workers-20261110/449-final.

<!-- SECTION:NOTES:END -->
