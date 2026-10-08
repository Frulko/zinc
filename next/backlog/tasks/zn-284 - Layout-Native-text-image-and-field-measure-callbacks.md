---
id: ZN-284
title: 'Layout: native text, image and field measure callbacks (engine side)'
status: Done
assignee: []
created_date: '2026-10-07 13:08'
updated_date: '2026-10-08 14:14'
labels:
  - ui
  - layout
  - size-M
milestone: m-17
dependencies:
  - ZN-283
ordinal: 50740
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-5). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A text node in a `flex: 1` row inside a `flex: 1` column wraps at its **final** width (the owner's bug case) in `rn` mode: line count and height equal a hand-computed fixture.
- [x] #2 the port of wrapText (src/host/text_wrap.cpp) gives the hand-computed lines of every mode: normal, break-words, break-all, clamp, ellipsis, pre, pre-wrap, balance, word spacing, tracking
- [x] #3 image (intrinsic size, aspect kept) and text field (200 px, rows) measure; a measured leaf refuses children instead of aborting
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Split 2026-10-08: the engine side here; the runtime bridge, the three engines and the 100-string check against wrapText moved to ZN-284.01. Done: src/host/text_wrap.{h,cpp} (port of wrapText/wrapPara/ellipsize with a TextMetric), Layout gains setText/setImage/setField/clearMeasure and lines()/lineWidths(); the Yoga leaves measure natively and re-wrap at the final content width after calculate. tests/t0/layout_yoga.sh: hand-computed lines of every wrap mode, the owner's flex:1 row in flex:1 column case (2 lines, 40 px; 4 lines at 60 px), image/field sizes, plus ASan/UBSan and heap checks with text leaves. Found: Yoga throws (std::logic_error, process abort) on a measure function for a node with children: the engine refuses instead.
<!-- SECTION:NOTES:END -->
