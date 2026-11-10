---
id: ZN-1115
title: Restore flex display for responsive hidden regions
status: Done
assignee: []
created_date: '2026-11-10 02:53'
updated_date: '2026-11-10 03:10'
labels:
  - ui
  - size-S
milestone: m-32
dependencies: []
ordinal: 1259
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Notes and Assistant desktop areas remain hidden with natural className hidden md:flex. lib/std/ui.ts apply utility flex returns true without clearing hidden; width1080 repro reports Detail(hidden). Minimal4line Notes source and log .logs/blockers/responsive-display/responsive-gap.tsx/.log, Assistant original also fails at1100. Fix shared display utility semantics rather than substitute classes/conditional app views. Cover responsive reveal and hide over resize, base flex after hidden, breakpoint/order behavior and layout/focus accessibility across all3. Primary short reference https://tailwindcss.com/docs/display (hidden displaynone vs flex displayflex; responsive display variants). Limited isolated worktree carveout: ONLY display token handling near2956, away from main external Map/Fenwick WIP639/1074; preserve that external patch byte-for-byte at integration. No virtualization/runtime/HAL/other engine edits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Natural hidden md:flex and supported display utilities show and hide the same node correctly as breakpoints change, including normal class updates, layout and focus eligibility
- [x] #2 Small exact T0 all3 and unchanged Notes plus Assistant desktop/mobile repros pass; no caller rewrite and unchanged kit size limits
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The supported flex display token now clears hidden, matching its existing hidden counterpart. Direction/layout utilities keep their current meaning; no added CSS utility family, class rewrite or conditional-view workaround. The existing style rebuild owns class writes and breakpoint resize reapplication.

Research: Tailwind display https://tailwindcss.com/docs/display maps hidden to display:none and flex to display:flex, with responsive display variants. Coordinator research inherited; Sonnet unavailable, primary reference read directly.

Exact ui_display T0 PASS all3: hidden→flex/base token order, flex→hidden, flex-row/flex-col leave display unchanged, same-node class updates, three real headless rotations1080↔360 crossing md, visible-region80x80 layout, hidden region occupies no flow space, Tab includes only the visible input subtree. zinc check PASS.

Original Notes27 and Assistant28 source snapshots copied unchanged into own log directory to keep physical UI module identities local, then probed through import-only main entries. Desktop1080x760/mobile360x900 PASS all3; natural hidden md:flex regions have full desktop layout and remain hidden on mobile. Inspected four interpreter pictures: Notes desktop list+editor/mobile list, Assistant desktop sidebar+chat/mobile chat. All source hashes, twelve logs/captures and provenance in .worktrees/1114/.logs/ui-display/. No app source committed or changed.

Unchanged final kit_size raw PASS after ZN-1114, ZN-1115 and reopened ZN-1112 fixes: JS direct235981/index246196/ten283045B, unused10215<10240 (25B margin), per-component4094<4096; AOT5325320/5474000/6025776B, unused148680<163840, per-component61308<65536. No threshold, icon, capability or manual-minification change. These are binary/bundle size values, not performance measurements. Raw output and source hashes: .worktrees/1114/.logs/kit-tabs-idle/{size-raw.log,gate-manifest.json}.

All checks use read-only common engine SHA25647a238519a706c385c312611ea9c17487944861e4bd660c012fe6ef643881764, ZINC_ROOT=.worktrees/1114. No C++ engine build, runtime/HAL or virtualization change. All runs bounded and headless through coordinator work-run; no process left running. No suite, benchmark, cross-device, physical keyboard or screen-reader run. usage: n/a.

Proposed tests:
- ZINC_BACKGROUND=1 zinc run examples/ui/notes and examples/ui/assistant, resize across md while editing/navigating with keyboard and screen reader; about60s each, memory not measured.
<!-- SECTION:NOTES:END -->
