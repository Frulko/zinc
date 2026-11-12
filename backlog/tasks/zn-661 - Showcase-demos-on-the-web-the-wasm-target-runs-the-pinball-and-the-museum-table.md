---
id: ZN-661
title: >-
  Showcase demos on the web: the wasm target runs the pinball and the museum
  table
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 18:18'
updated_date: '2026-11-12 05:42'
labels:
  - demo
  - size-M
milestone: m-27
dependencies: []
ordinal: 53400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Owner's answers, 2026-10-10, for the showcase demos of M27.) Both demos in a browser through the wasm target, with their physics, audio and 3D. Part of the cross-platform pass.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 both demos load and play in headless Chrome with a frame equal to the desktop within tolerance
- [ ] #2 the size of each download is measured
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-12 — partial browser-native/audio tranche; AC1 and AC2 remain unchecked.

Implemented the browser-only native registry/import without changing the WASI/compiler/transcoder stubs. Export uses existing WebPlugin discovery and the compiler's actual native-spec signatures from app.zbc. Only functions really registered in a web backend become descriptors; missing exports remain explicit loader errors and callbacks/resources/promises are explicitly unsupported. ZnVal is asserted 8 bytes on wasm32, separately marshalled from 24-byte HostArg. flags=0 keeps calls on the validated import. Strings and packed arrays have a cumulative preflight budget before decoding; transport/replies are limited to 4 MiB and 15 seconds. JSPI and the asset-free blocking SAB fallback both work. Closed/timed-out requests drop late replies; a Ready shared reply still settles if its message is delayed.

Reused existing plugins/audio/web/audio.js on Window, with registry/capability/user-gesture services extracted from targets/web/runtime.js. No miniaudio port, new dependency, new demo/service, or original application rewrite. Async unload/failure regressions are fixed: decode completion cannot resurrect an unloaded queued voice, failed decode ends queued voices and exposes the real error. Music APIs and backends needing further page services are not claimed implemented.

Research: coordinator delegated summary copied to .logs/661/research.txt; primary verification https://developer.chrome.com/blog/autoplay/ (suspended AudioContext needs user activation/resume), https://v8.dev/blog/jspi (wrap asynchronous imports plus promising entry), https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics/wait (worker-blocking shared publication). No new library was needed.

Proof (all bounded through absolute tools/work-run, one heavy process): tools/build zinc and tools/build-wasm; zinc check probe and original game-source; wasm_native T0 PASS (actual wasm add/reset/refusal, scalar/string/array ABI, signatures/errors/bounds, cumulative S/global preflight before decoding, Ready without notification, timeout/closed/stale replies, real blocking worker, audio decode failure/unload); exact existing wasm_gfx and wasm_images callers PASS after new import adaptation. No suite, T1/T2, benchmark or pixel comparison. Tests/wasm/loading.mjs import updated by reading, not run.

Actual headless Chrome: exported real 0.26-second mono WAV decodes to 48000 Hz /12480 samples. Normal policy: state suspended and PCM0 before a real CDP Enter; after input AnalyserNode peak0.7389926910, then stop gives playing=false and PCM0, exit0. Separate controlled --autoplay-policy=no-user-gesture-required proof: peak0.3694963455 without input, then stop0. Analyser is upstream of gain0, so this measures actual PCM without speakers. Asset-free no-JSPI worker fallback: peak0.7071067691 after real input, stop0, exit0. These are functional amplitudes, not performance measurements. Original generated game-2d source copied unchanged from the archived673 proof now renders Coin Rush and exits0 after its first frame, passing the former missing Audio load barrier; frame looked at, no pixel parity claim. Web JavaScript export smoke also reports real Web Audio, duration0.26/channels1/rate48000, proving shared registry publication.

Exact paths: .logs/661/{build-wasm.log,build-final.log,export-final.log,t0-final.log,gfx-callers.log,images-callers.log,normal-final/result.json,normal-final/frame.png,controlled/result.json,fallback/result.json,game-final/result.json,game-final/frame.png,web-result.json,provenance.json}. Scripts/browser instrumentation retained beside them. Expected Chrome autoplay warnings in normal-policy runs. Builds have existing unrelated warnings in agent/dev.cpp and vendored nanosvg; no warning from added bridge code.

Remaining: the actual pinball and museum originals, physics/audio/3D behavior and desktop frame tolerance, and each complete download measurement remain unproved software work. Neither AC passes from this short model-game/audio proof. No broad showcase claim. Next command: work ZN-661 on an unchanged original showcase through build/zinc export examples/pinball3d --target wasm, then address its next actual engine/backend gap.

Proposed tests (owner milestone): unchanged pinball3d and museum-table browser vs native play/frame comparison plus complete downloaded-byte accounting (~1–3 min per app, memory unmeasured); JSPI/non-JSPI browser compatibility and PCM stream/voice cancellation churn (~30s, memory unmeasured); tests/run --only wasm_loading after full caller integration (~seconds); broader web export/dev/PWA cache smoke after shared-services factor (~30s). No new test service or demo. Later: complete streaming music and the page services needed by other browser native backends within existing scope, rather than fake availability.

Usage: n/a (tools/usage). No owned app, Chrome profile/server or build process remains.

2026-11-12 — generic browser-native array ABI increment; both showcase AC remain open (Backlog).

Added U/u32[] arguments and numeric BIUD output copies in the existing browser bridge. Return the changed arrays only, matching native compat::back; an unchanged repeated argument must not overwrite an earlier changed alias. Validate the complete result/output envelope, numeric ranges, memory descriptors and cumulative budget before allocating/publishing. One aligned response arena holds multiple arrays and the scalar/string/array result until the next call; allocation failures retain old descriptors and the old arena, and views are reacquired after memory growth. Empty output arrays use a non-null replacement view. Existing Pending/Writing/Ready/Cancelled, shared-buffer deadline and closed/late response behavior remain in place. Void results discard incidental values (including nontransportable objects). A single-key numeric tag preserves -0 only across the JSON reply; structured-clone requests already preserve it, strings cannot collide, and final tagged JSON bytes still count against the 4 MiB bound.

Scope/callers read: targets/wasm native registry, NativeABI/NativeRPC/serveNative, worker nativeCall, native_gen.cpp, native_sig.h, zrt_compat.h, rtcalls.cpp, and existing wasm gfx/images/loading tests. No runtime, CLI, IR, original plugin/backend or application source changed. Delegated research .logs/research.txt: https://html.spec.whatwg.org/multipage/structured-data.html#structuredserializeinternal ; https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory/grow . Existing code and libraries suffice; no dependency or new lifecycle was introduced.

Proof: own relative tools/build-wasm through the shared queue PASS (.logs/build-wasm.log and build-wasm-2.log); no CLI/compiler-WASM build. Exact wasm_native now tests U range/unsigned high bits, strict B/I/U/D results/outputs, complete-envelope rejection before publication, cumulative budget, allocation failure, growth, grow/shrink/empty arrays, changed-only alias copies, incidental void returns, -0 and existing timeout/stale/restart/Ready/real-blocking regressions. The actual WASM interpreter executes the typed fixture under JSPI and a blocking Node worker with existing Render3D.transform/partBounds CPU methods; returns I/D/s coexist with U outputs. Final log .logs/t0-final.log. JSPI is explicitly skipped on Node versions without that optional API, while the actual blocking VM remains required; this machine's Node26 exercises both. The tiny local host fixture table only provides compilation signatures and fails if executed, while its browser fixture implements the tests; it is not a production backend.

Actual exported fixture .logs/export-arrays builds and exits0 in headless Chrome with JSPI, no console problems, through the production app.js/worker.mjs path (.logs/browser-result.json/browser-arrays.log). No WebGL painting/context use by the tested backend methods, physics, original showcase, pixel comparison, suite, conformance or performance/memory claim. Reactor/glue/CLI/export SHA provenance is in .logs/provenance.json; original Render3D and original app source integrity is recorded there. No process remains after proof.

Failed experiments remain with source snapshots and full logs: initial fixture had no module provider (Z5011); a proposed >U return is outside the actual native result-letter contract, causing the checker to skip its generated builtin (Z0101); and a fixture incorrectly expected a native VM error to be catchable in TS. The native ABI header describes engine error propagation, while the observed existing VM nativeCall implementation records m.error and reports a terminal error for that status, so the bridge's error atomicity is checked at real WASM memory instead; no caller or VM semantic was rewritten. U inputs/output arguments are supported, >U remains explicitly rejected. Proposed later line: ZN-661: reconcile native result-letter U support and unsigned toSlot conversion if an actual u32[] result API is needed; it currently needs held core work and is not browser-only support.

Proposed decision: align browser signatures with the normal native ABI and return validated changed-only numeric output views in one finite arena, rather than same-length mutation or per-plugin adapters. No decision number allocated. Proposed tests: owner-selected existing wasm_gfx/wasm_images/wasm_loading caller regressions (seconds each), old-Node no-JSPI optional-entry check plus browser SAB compatibility, then unchanged original pinball/museum parity and complete download accounting (~1–3 min each, memory unmeasured). Jolt has no web backend, Render3D image/paint services and video substitution remain separate software gaps; no showcase AC passes from this increment. Usage: n/a (tools/usage).
<!-- SECTION:NOTES:END -->
