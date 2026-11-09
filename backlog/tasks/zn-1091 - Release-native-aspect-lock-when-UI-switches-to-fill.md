---
id: ZN-1091
title: Release native aspect lock when UI switches to fill
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 14:41'
labels:
  - ui
  - host
  - size-S
milestone: m-32
dependencies: []
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
- [ ] #1 Switching a lazily initialized window from fixed aspect to fill clears its native aspect constraint; switching back preserves documented fixed-aspect behavior
- [ ] #2 A narrow regression and bounded background native resize proof show ordinary UI requests360x800 with correct surface/window sizes without ZINC_RESIZE workaround
- [ ] #3 Original design gallery responsive interaction passes default parameters across representative widths; targeted build and relevant interpreter/AOT/QuickJS smoke pass, limitations documented
<!-- AC:END -->
