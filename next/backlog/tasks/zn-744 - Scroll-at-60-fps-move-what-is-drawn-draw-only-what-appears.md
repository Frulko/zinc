---
id: ZN-744
title: 'Scroll at 60 fps: move what is drawn, draw only what appears'
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-16 14:06'
updated_date: '2026-10-16 14:31'
labels:
  - perf
  - ui
  - size-L
milestone: m-21
dependencies: []
ordinal: 196450
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-16: "le scroll à 60 fps, y'a pas de raison", on every platform. Measured on the Nexus 7 (ZN-622, docs/reports/zinc-next-android.md): rn-showcase is 60 fps at rest but ~25 fps while scrolling by hand, because each scroll frame re-rasterises the whole scrolled area (~23 ms) then presents it (~13 ms). Browsers (composited scroll layers and tiles), Flutter (raster cache) and Android (RecyclerView over hardware layers) never redraw content that only moved. Do the same for zinc:ui scroll containers: the frame marks a scroll region (bounds, content offset, delta since the last frame); the software raster moves the pixels already drawn by the delta (one memmove of the rows inside the clip) and rasterises only the strip that came into view plus what changed inside; the GPU replay keeps the scrolled content in a layer texture (tiles if larger than the max texture size, 2048 on Tegra 3) and draws it translated, replaying only new tiles and changed rectangles. Fixed elements over the scroll area (headers, the tab bar, the perf panel) are drawn after, unchanged. Works with ZN-191's property slots (scroll records zero primitives per frame) and ZN-741/ZN-743 (damage-aware GPU replay, zero-copy present); none of them is required to start.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 rn-showcase scrolled by a scripted fling (ZINC_INPUT) at 60 fps on the Nexus 7 with the software raster: p99 frame under 16.7 ms in the perf panel, numbers before and after in docs/reports/zinc-next-perf.md
- [ ] #2 the same on the desktop (macOS window and headless timing) and with the GLES 2 replay once ZN-741 lands
- [ ] #3 pixels: a scrolled frame equals a full redraw of the same state (hash), including rounded clips, shadows crossing the scroll edge and translucent fixed headers
- [ ] #4 a T0 test: a scroll of N px rasterises only the exposed rows (counted) and gives the full-redraw hash
- [ ] #5 Pi 3 and TouchPad runs are one line each under Cross-platform pass in backlog/later.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-16, part 1 (coordinator's addition, docs/reports/zinc-next-first-interaction.md): a tap in a scroll view no longer damages the whole screen twice. (1) runtime/raster.cpp diff_rects and diff_rects_sig skip the common tail as well as the head: a command inserted or removed in the middle damages its own box, not every command it shifts (the shifted UNCLIP's bounds are the screen). (2) lib/std/ui.ts: scrolledAt is set only when the content moves (directScroll with dx or dy non-zero, stepScroll when sx/sy changed): a finger that lands without moving shows no indicator and starts no 1.2 s of animating; the indicator's RECT at alpha 0 is skipped. (3) zinc capture --scene A --damage B prints the union box. Test tests/t0/damage_tap.sh (rn-showcase, deterministic): a press on the tab bar gap damages nothing (before: 414,1 419,603 then the whole 420x860 on the indicator's removal), and every frame of the wheel indicator's fade-out, including the frame that removes the RECT, damages only its 5 px column (before: the whole screen on removal). damage_sig, scene_dump, framehash, backend_sw, scroll_axis, scroll_end, ui_virtual, rn_showcase, react_native_lists, ui, touch_spread, input_touch, pan_responder, perf_hud pass; proto-capture compare canary 4/4.
<!-- SECTION:NOTES:END -->
