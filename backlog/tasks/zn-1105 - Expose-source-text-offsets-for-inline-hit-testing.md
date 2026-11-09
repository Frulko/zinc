---
id: ZN-1105
title: Expose source text offsets for inline hit testing
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 22:35'
labels:
  - ui
  - text
  - size-M
milestone: m-32
dependencies: []
ordinal: 1023
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks real inline links in ZN-1078.13 Markdown/RichText. Existing static text supports selectable styled runs but has no public point-to-source-offset API. Code worker proposes ui.textOffsetAt(h,x,y):i32 using PointerEvent x/y LOCAL to the handling text node, plain-string source offsets, -1 outside glyph content. Link model stores exact [start,end) ranges, pointer down/up must remain same range and reject drag/cancel; keyboard paragraph navigation is provider logic, not new engine policy. Private ui.ts tsPosAt near6582 computes caret offsets over displayed lines laid end-to-end, so exposing it unchanged is WRONG for source ranges after skipped wrap whitespace/newlines. Rich runs already store n.lineAt and use linePrefixW/runsWidth for actual faces; reuse/extract that geometry. Existing static selection semantics/tsStart stay coherent; don't copy layout into Markdown. Distinguish glyph hit from nearest insertion caret and cover last glyph/space boundaries. Main has external sparse-Fenwick ui.ts42add19del near638/1077, separate from text hit region; preserve them on integration. Current sole core worker1101 gets this as FIFTH/FINAL task after1102. Optional numeric Box<i32>→Box<f64> baseline goes to NEXT fresh core task1106, not a sixth. Primary API leads: Flutter TextPainter.getClosestGlyphForOffset and CSSOM View caretPositionFromPoint; inspect source offsets/grapheme boundaries before implementation. No suite/benchmark, exact T0 and actual Code caller only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A small public textOffsetAt(handle,x,y) uses node-local coordinates and returns the source-string offset of the hit displayed glyph, or -1 outside visible glyph content/invalid text nodes; wrapped styled runs keep their existing measured geometry and source line offsets
- [ ] #2 Exact T0 proves wrapping across whitespace/newlines, mixed run fonts/styles, non-ASCII text, left/center/right alignment, boundaries/empty/outside, scroll/transform coordinates and destroyed/reused nodes on all three engines without changing existing static-selection units
- [ ] #3 Actual shared Markdown/RichText inline links use the primitive for same-link pointer activation and keyboard navigation without duplicate destination controls or copied layout logic; Code gallery proof and docs/changelog/proposed checks are recorded
<!-- AC:END -->

Primary reference check: Flutter TextPainter glyph hit uses paragraph-local coordinates and grapheme-cluster source ranges (https://api.flutter.dev/flutter/painting/TextPainter/getClosestGlyphForOffset.html ; https://api.flutter.dev/flutter/dart-ui/GlyphInfo-class.html). CSSOM caretPositionFromPoint returns an insertion position, a different boundary contract (https://www.w3.org/TR/cssom-view/#dom-document-caretpositionfrompoint). This task chooses an actual glyph source offset with -1 outside painted content, suitable for inline link ranges; do not conflate that with the existing selection caret.
