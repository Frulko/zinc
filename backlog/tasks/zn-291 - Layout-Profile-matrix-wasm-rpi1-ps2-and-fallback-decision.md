---
id: ZN-291
title: Document the layout modes
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-07 13:08'
updated_date: '2026-11-09 02:00'
labels:
  - ui
  - layout
  - size-S
milestone: m-17
dependencies:
  - ZN-285
ordinal: 6700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Write the "Layout modes" page in docs/ui.md (classic vs rn differences table); the wasm/rpi1/ps2 measurements go to the cross pass. Already there: targets/capabilities.json ui.layout.rn=true for macos, linux, wasm, rpi1, ps2; tests/t1/layout_rn.sh; docs/ui.md has no "Layout modes" page.

From docs/reports/layout-engines.md (section 8, LE-12). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `rn` builds and runs the `layout-175` test on wasm (size printed), rpi1 (Pi test rig or its emulation) and ps2 (PCSX2/emulator) or is marked unsupported with the measured reason.
- [ ] #2 `targets/capabilities.json` `ui.layout.rn` values updated from the measurement.
- [x] #3 `docs/ui.md` has a "Layout modes" page with the section 4 differences table.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. The rn (Yoga) mode exists and capabilities list it; the measured runs on wasm/rpi1/ps2 and the docs page are missing. Evidence: targets/capabilities.json ui.layout.rn=true for macos, linux, wasm, rpi1, ps2; tests/t1/layout_rn.sh; docs/ui.md has no "Layout modes" page

Worked 2026-11-09 (parallel worktree agent).

Research (sonnet search): RN's flexbox page lists the defaults that differ from the web (column, alignContent flex-start, flexShrink 0) https://reactnative.dev/docs/flexbox ; Yoga's styling page: border-box, the same defaults plus position relative, `UseWebDefaults` flips the first three https://www.yogalayout.dev/docs/styling ; Yoga 3.0 errata (AbsolutePercentAgainstInnerSize) https://www.yogalayout.dev/blog/announcing-yoga-3.0 ; NativeWind's "Platform Differences" page as a model of a short quirk-by-quirk page https://nativewind.dev/core-concepts/differences .

Done (AC #3): docs/ui.md "Layout modes: classic and rn side by side" under "Layout engines": the section 4 table of docs/reports/layout-engines.md brought up to date from the code (classic now has shrink, min/max, basis, alignSelf, alignContent, reverse and column wrap, aspectRatio on any node, text re-wrapped at its final width, borders in layout, and since ZN-1022 CSS's flex-1 / w-full / h-full with the automatic minimum), the conformance counts (rn 482 of 482 expressible, classic 343), where each engine exists, and what to look at when moving a screen to rn. docs/react-native.md no longer says borders are paint-only in classic.

Handover (AC #1 and #2, the cross pass): build and run `tests/t1/layout_rn.sh`'s layout-175 program with `"ui": {"layout": "rn"}` for wasm (`tools/build-wasm`, print the .wasm size with and without Yoga), rpi1 (armv6 cross build with the pinned zig; no rpi1 board: run it on the Pi 3B+ player `spark@192.168.2.31` only if it can execute armhf, else record it as unmeasured) and ps2 (PCSX2), then set `ui.layout.rn` in targets/capabilities.json from what ran (false with a "why" as for esp32/ps1). Nothing measured here: cross builds were out of this worktree's scope.

Line for backlog/later.md (Cross-platform pass):
- ZN-291: measure rn (Yoga) on wasm (size), rpi1 and ps2 and set targets/capabilities.json ui.layout.rn from it.

Proposed tests: none (documentation only).
<!-- SECTION:NOTES:END -->
