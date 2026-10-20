---
id: ZN-281
title: 'Layout: Layout benchmark `layout-175` and size job'
status: Done
assignee: []
created_date: '2026-10-07 13:07'
updated_date: '2026-10-07 15:25'
labels:
  - ui
  - layout
  - size-S
milestone: m-17
dependencies: []
ordinal: 50710
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-2). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `bench` entry builds the 175-node tree through a minimal tree API, runs full, one-leaf and clean cases for Yoga and, when present, for `classic` (via a headless `ui.layout()` run).
- [x] #2 Numbers (including the so-far unmeasured `classic` AOT and interpreter times) are written to the task notes and `--check-regressions` works.
- [x] #3 `size` of `zn_yoga` for 3 targets printed; fails above 90 KB.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. tests/bench/layout_bench.cpp (175 nodes, Yoga, fake 7 px text) and bench/layout-classic.ts (same tree through zinc:ui + ui.layout(), interpreter and AOT); tools/bench-layout writes bench/layout.json, --check-regressions at 15% (works against HEAD's file), size job: zn_yoga code+data armv6 69.7 KB, aarch64 82.0 KB, wasm32 74.5 KB (limit 90 KB, fails above). Numbers on this Mac: Yoga full 276 us / one leaf 20 us / clean 0.04 us; classic interpreter 267 us per pass, classic AOT 162 us (always a full pass, no dirty bits). The classic numbers were unmeasured before.
<!-- SECTION:NOTES:END -->
