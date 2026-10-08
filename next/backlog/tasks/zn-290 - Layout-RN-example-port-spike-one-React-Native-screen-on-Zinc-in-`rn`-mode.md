---
id: ZN-290
title: 'Layout: RN example port spike: one React Native screen on Zinc in `rn` mode'
status: Done
assignee: []
created_date: '2026-10-07 13:08'
updated_date: '2026-10-08 19:49'
labels:
  - ui
  - layout
  - size-M
milestone: m-17
dependencies:
  - ZN-367.03
ordinal: 50800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-11). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A real RN screen (FlatList, nested flex, percent, absolute badge, text wrapping) from the owner's app (or a public RN sample if not shared) runs unchanged apart from imports.
- [x] #2 Pixel golden recorded; a diff list of what differs from the device screenshot is written.
- [x] #3 Gaps become backlog tasks (each with a fixture).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a
Done: examples/rn-port, a React Native screen (FlatList, nested flex, percent widths, absolute badge, numberOfLines, baseline, hairlineWidth, TextInput, Pressable, default export, no return types, useState('')) runs with only its two imports changed, in the react-native preset at 390x844. Golden: tests/golden/rn-port (frame hash + layout facts and a search filter), tests/t1/rn_port.sh. Fixed on the way: zinc run . ignored zinc.json entry (own commit); numberOfLines; alignItems/alignSelf baseline (Yoga real, classic flex-end); StyleSheet.hairlineWidth; width/height from a template percent; keyExtractor with one parameter; TextInput without a border. Diff list against React Native (no device: Yoga is the layout reference, ZN-289) in docs/reports/rn-port-spike.md; gaps: ZN-367.05 (import aliases), ZN-385 (text defaults, hairlineWidth, system font), ZN-382 (classic baseline), ZN-383 (contextual typing). tests/run --changed 48/48, proto-capture 4/4.
<!-- SECTION:NOTES:END -->
