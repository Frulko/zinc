# Shard F review (50 tasks, no milestone)

Counts: keep 29, done-partly 6, park 4, review-close 4, rewrite 3, merge 2, done 2. No task is assigned to another session.

## Findings

- Done: ZN-691 (callbacks and promises on the QuickJS native bridge: `src/qjs/native_js.cpp`, `tests/t0/qjs_native.sh`) and ZN-676 (`host_direct` passes).
- Review tasks to close: ZN-121.01, ZN-121.04, ZN-312 (their remaining criteria are documented exceptions) and ZN-593 (the bench gate now compares against the pinned engine on the same runner; release 0.8.0 shipped).
- Mostly there: ZN-674 (WebP and GIF already decode in `decodeRgba`; only a test and a size note are left), ZN-697 (per-voice volume and pan exist; only the fade is left), ZN-695 (seek exists as `offset`; pause is left), ZN-698 (SHA-256 of bytes exists in pure Zinc in `zinc:web`; a native, streaming file hash is left), ZN-690 (threads done; only the quiet-machine measure is left), ZN-054 (Linux done and Windows builds in CI; Windows T0/T1 is left).
- Merges: ZN-320.03 into ZN-393 (the same AppImage run in a Linux container), ZN-677 into ZN-680 (software raster speed).
- Confirmed still broken, on `build/zinc`: ZN-699 (`Math.atan` gives Z0106), ZN-664 (`Object` is not a known name), ZN-693 (`instanceof` gives `true false`, interpreter and AOT), ZN-667 (the fuzz fixture gives "invalid IR after reference counting").
- Stale: ZN-591 is written around the prototype (`compiler/src/abi.ts`, `tests/engines/prebuilt-core.mjs`, which is gone); rewrite without AC4 or drop. ZN-313 has no criteria. ZN-394 reduces to one golden line.
- Park (hardware, Apple Silicon, cross pass): ZN-055, ZN-412.04, ZN-600.01, ZN-692.
- ZN-335.01 and ZN-351.01 both wait for ZN-338 (reusable plugin workflow) and can share one fixture.
- ZN-395 may already be done: `main.cpp` is largely guarded by `ZN_HOST_GFX` now; one `-DZN_HOST_GFX=OFF` link settles it.

## The 10 that matter most

1. ZN-693: instanceof wrong after `any`, a correctness bug that hits every error-handling program.
2. ZN-664: no `Object.keys` or for-in on parsed JSON; blocks loaders of unknown fields.
3. ZN-699: `Math.atan` missing (S, trivial, language parity).
4. ZN-667: invalid IR from duplicate names (S, a compiler crash on valid TS).
5. ZN-389: record arrays do not convert to wider records, which TypeScript accepts.
6. ZN-682: `bounds(node)` in zinc:3d, small and every viewer needs it.
7. ZN-665: kiosk relaunch and presentation, needed by the museum table.
8. ZN-684: manipulate gesture in the plugin (moves the museum table code into a reusable plugin).
9. ZN-391: double-click `.zapp`, a visible gain for makers sharing apps.
10. ZN-698 (rewritten): a fast native SHA-256, for package integrity.

## Surprises

The no-milestone tasks are mostly follow-ups of m-22 (ZN-432, physics, audio) and m-27 (museum, pinball); the milestone is named in each `milestone` field. Windows and Linux items (ZN-054, ZN-392, ZN-393) open the cross-platform pass.
