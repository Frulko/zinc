---
id: ZN-1091
title: Release native aspect lock when UI switches to fill
status: Done
assignee: []
created_date: '2026-11-09 14:41'
updated_date: '2026-11-09 14:43'
labels:
  - ui
  - host
  - size-S
milestone: m-32
dependencies:
  - ZN-1092
type: bug
ordinal: 1009
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks owner screenshot responsive fix ZN-1087. Gallery worker confirmed minimal12line /tmp/1087-proof/resize.tsx: simple UI render, frame2 gfx.windowCtl(0,1,empty,360,800), frame10 gfx/native dimensions report360x245 instead of360x800 with ordinary defaults. Explicit ZINC_RESIZE=fill passes, but this must not become an app workaround. targets/macos/hal_sdl.cpp startup near692 sets SDL_SetWindowAspectRatio(win,W/H,W/H) when !fill; later hal_set_resize near439 switches fill and resize_pending but never clears that native aspect constraint. ui.mount/onResize requests fill after lazy window initialization, leaving the startup aspect lock active. Fix actual policy transition at the shared HAL operation.

Preserve fixed-aspect/contain modes when requested and correctly release/reapply native aspect limits on transition; do not change app data/layout to hide it or invent startup flags. Actual SDL/native window dimensions and UI surface must agree after change. File is not in the other-session runtime/LVGL WIP. Primary SDL documentation https://wiki.libsdl.org/SDL3/SDL_SetWindowAspectRatio documents0.0 as unconstrained; inspect existing wrapper/callers before editing. Owner explicitly asked responsive app testing, so one short bounded background native resize proof is authorized; no full window suite or benchmark.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Switching a lazily initialized window from fixed aspect to fill clears its native aspect constraint; switching back preserves documented fixed-aspect behavior
- [x] #2 A narrow regression and bounded background native resize proof show ordinary UI requests360x800 with correct surface/window sizes without ZINC_RESIZE workaround
- [x] #3 Original design gallery responsive interaction passes default parameters across representative widths; targeted build and relevant interpreter/AOT/QuickJS smoke pass, limitations documented
<!-- AC:END -->

## Implementation Notes

- [SDL_SetWindowAspectRatio](https://wiki.libsdl.org/SDL3/SDL_SetWindowAspectRatio) specifies zero for an unconstrained ratio. `hal_set_resize` now updates the native constraint on each real surface-policy transition: fill releases the startup lock; letterbox restores W/H. An explicit app.window.aspectRatio remains authoritative. Existing fixed configuration, deterministic, device-display, no-graphics and equal-policy guards are unchanged.
- Read startup/window_limits, module lazy loading and forwarded resize state, the host gfx resize row, surface allocation and documented resize policy before changing the shared HAL. No application resize flag or layout workaround was added.
- `tools/build zinc` succeeded in this isolated tree; the changed HAL compiles without warnings. The fresh build reported existing V8/vendor warnings and unrelated assets/agent warnings; log `.logs/build-1091.log`. No suite or cross build.
- Exact `tests/run --only window_resize_policy` passes. It compiles the actual HAL operation with mocked SDL and drives fill, return to fixed, explicit aspect limits in both directions, equal-policy idle behavior and all policy guards, without a display.
- Native smoke is `ZINC_BACKGROUND=1 ZINC_FRAMES=20 build/zinc run tests/data/window_resize_policy` (no resize override, deterministic mode or headless): interpreter, AOT and QuickJS all pass portrait360x800 then landscape800x500, asserting both native-window and logical-surface sizes. The fixture starts800x500 so default automatic zoom is1; smaller initial surfaces correctly use automatic zoom2 and are not pixel-for-point at native-window sizes. Every command is serialized/bounded with tools/work-run.
- Original `/tmp/1087-proof/resize.tsx` unchanged passes: surface360x800, window360x800. Original `/tmp/1087-proof/main.tsx` type check passes and its native run confirms actual360width, layout scan, pointer/Enter/Space, field editing and focus. Its later independent assertion still fails `last card unreachable` before the768/1024/1440 scans. Coordinator is preparing the nested-wrap/layout blocker1092; AC3 remains open until that original full-gallery proof passes. No process remains.

## Proposed tests

- After the independent layout blocker: rerun `/tmp/1087-proof/main.tsx` for90 background frames with this HAL and noZINC_RESIZE; it checks360/768/1024/1440 widths plus scrolling/keyboard/touch interactions (roughly2seconds, one window).
- At the chosen host milestone: existing window_live_resize and multiwindow feature sessions; manual window-manager constraint/drag checks on other SDL platforms remain unproven.

- Coordinator closure: after1092 integration414861c46, the corrected outer-vertical-scroll proof passed all assertions on ordinary native defaults at360/768/1024/1440, including finalMinGW visibility, horizontalbounds, pointer reveal/edit/focus andEnter/Space. Proofworker closure5bd6649c3 records commands/captures; noZINC_RESIZE workaround. Clean window_resize_policy, ui_animation_reset, ui_nested_wrap, layout_css andkit_inputs all passed. AC3 complete.
