---
id: ZN-661
title: >-
  Showcase demos on the web: the wasm target runs the pinball and the museum
  table
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 18:18'
updated_date: '2026-11-11 23:26'
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
<!-- SECTION:NOTES:END -->
