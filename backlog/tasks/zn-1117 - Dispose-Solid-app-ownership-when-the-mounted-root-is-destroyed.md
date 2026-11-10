---
id: ZN-1117
title: Dispose Solid app ownership when the mounted root is destroyed
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-10 03:24'
updated_date: '2026-11-10 03:34'
labels:
  - ui
  - size-M
milestone: m-32
dependencies: []
ordinal: 1249.1
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Music natural canonical entry render(()=> <App/>, background,null) registers owned model cleanup in App but ui.destroy(ui.rootNode()) does not run Solid onCleanup. Minimal9line Probe counter no audio/1116 dependence .logs/blockers/solid-root-dispose/solid-root-dispose.tsx and actual QuickJS failing log; original playing Music model remains Playing rather than Disposed after root destroy. Solid render normal path calls app() without root owner (hot mode alone uses newRoot); JSX component route also lacks destroy bridge. Fix shared Solid root ownership/disposal, not per-app createSubtree workaround. Reuse existing Computation ownership/dispose and UI onDestroy, preserve hot replacement, error unwind and renderWindow callers as appropriate. Do not invent a new API/framework or change application cleanup contract. Primary reference https://docs.solidjs.com/reference/lifecycle/on-cleanup and https://docs.solidjs.com/reference/rendering/render ; short primary lookup root, Sonnet unavailable. Scope lib/std/solid.ts/tests only, no compiler/IR worker1116 files, no protected ui.ts/runtime/HAL external WIP.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Ordinary canonical Solid render owns App onCleanup and disposes it exactly once on root destroy/replacement, with throws/restarts and hot/window caller contracts preserved using existing lifecycle helpers
- [x] #2 Small exact T0 all3 and original Music owned playback/timer disposal proof pass without entry workaround; public kit size limits remain unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented normal render ownership with the existing Computation/newRoot/rendered/dispose helpers and ui.onDestroy. The prior hot-only replacement callback now applies to every canonical render; direct destruction clears it before cleanup. Rendering restores owner/current with finally, failed render destroys its root, renderWindow owns its tree and destroys it on render/open failure without changing its signature. Disposal leaves the existing live-slot list before callbacks, detaches cleanup lists, attempts sibling/parent cleanup after throws, and skips effects whose own slot or ancestor is already disposed, so a cleanup signal write cannot rerun an unvisited sibling. No application workaround, compiler/native/UI changes, new dependency or public API.

Research: https://docs.solidjs.com/reference/rendering/render establishes the root before evaluating JSX, with root disposal; https://docs.solidjs.com/reference/lifecycle/on-cleanup ties component cleanup to the current owner and runs it on disposal. Reused the existing Zinc implementation rather than adding another framework/lifecycle. The coordinator had already done the primary lookup; Sonnet is unavailable in this runtime.

Proof (headless, bounded via tools/work-run): zinc check tests/data/solid_root_cleanup.tsx PASS; exact new T0 solid_root_cleanup PASS interpreter/AOT/QuickJS and ZINC_HOT=1 interpreter. Final raw log .worktrees/1117/.logs/1117/t0-final-1116.log includes four success markers against the final candidate below; initial common-engine logs are retained too. Covers canonical JSX App cleanup after paint, root replacement, duplicate/reentrant root destroy, disposed queued effect, cleanup signal writes across siblings, and signal unsubscription, render/cleanup exceptions, remaining cleanup after a throw, surrounding-owner restoration and restart, repeated existing Subtree disposal, and renderWindow failure before opening a native window. Common read-only engine /Users/mowmow/Lab/zinc/.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc SHA256 47a238519a706c385c312611ea9c17487944861e4bd660c012fe6ef643881764. No C++ engine build.

Original Music proof (music_1078 worker, exact temporary authorized Solid copy SHA256 08b5941b29082c4348722f4471b96372b980b22ab55bb5a808a91503bd90530c): unmodified App with canonical render(()=> <App/>), real Play callback, actual PCM nonzero, ui.destroy(ui.rootNode()), PCM zero, all four Music slots reusable, then 200ms delayed silence/stale-poll success marker. All3 PASS with candidate ZN-1116 /Users/mowmow/Lab/zinc/.worktrees/1116/build/zinc SHA256 a5097ef368ac17152ffb70383979402865d0724283824eff0c994f796bd06d1e. Separate original createLibrary canonical Probe shows Playback.Disposed all3. Exact invocation env ZINC_ROOT=Music worktree, ZINC_HEADLESS=1 ZINC_AUDIO=null ZINC_FRAMES=60 ZINC_REALTIME=1 ZINC_SIZE=1280x1200, --interp/--native/--engine quickjs. Native backend explicitly asserted null; mixer inspected without audio-device output. Fixture and raw all3 logs copied into .worktrees/1117/.logs/1117/music-app-lifetime.tsx and music-{app,model}-{interp,native,quickjs}.log; original logs .worktrees/1078.26/.logs/music1078.26/final-{app,model}-lifetime-*.log. Production App/main unchanged by proof.

Unchanged kit_size gate PASS; raw script SHA256 d4516f5dbd449421d4cc872afdba00acc8f07c22c3f0476498b06cf4fbc032ed. Final raw invocation against the final Solid and ZN-1116 candidate retained all rows: .worktrees/1117/.logs/1117/kit-size-final-raw.log. JS direct236192/index246407/ten283256 B, unused10215<=10240, +4094/component (15 B strict aggregate margin); +211 B common JS vs prior235981/246196/283045 B; marginal budgets stay identical. AOT direct5325336/index5474000/ten6025776 B, unused148664<=163840 and +61308/component<=65536. editor plugin preserved. No budget, feature, icon, option or manual minifier cuts.

Later / Proposed tests: Native renderWindow close currently only removes its Surface in ui.mountWindow and does not ui.destroy its root (pre-existing path); wire native-close destruction in the UI lifecycle later and prove physical close/remount before claiming native window-close cleanup. No native window test was started here. Run tests/run --only solid_cleanup (existing list/branch cleanup coverage, seconds) and native window lifecycle smoke at an owner-picked milestone; long remount/timer/audio resource churn and physical audio output remain proposed. No suite/T1/T2/demo/pixel/benchmark/conformance/fuzz/CI run. No process left running. usage: n/a
<!-- SECTION:NOTES:END -->
