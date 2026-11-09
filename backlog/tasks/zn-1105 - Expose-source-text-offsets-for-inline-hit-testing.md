---
id: ZN-1105
title: Expose source text offsets for inline hit testing
status: Done
assignee: []
created_date: '2026-11-09 22:35'
updated_date: '2026-11-09 23:21'
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
Blocks real inline links in ZN-1078.13 Markdown/RichText. Existing static text supports selectable styled runs but has no public point-to-source-offset API. Code worker proposes ui.textOffsetAt(h,x,y):i32 using PointerEvent x/y LOCAL to the handling text node, plain-string source offsets, -1 outside glyph content. Link model stores exact [start,end) ranges, pointer down/up must remain same range and reject drag/cancel; keyboard paragraph navigation is provider logic, not new engine policy. Private ui.ts tsPosAt near6582 computes caret offsets over displayed lines laid end-to-end, so exposing it unchanged is WRONG for source ranges after skipped wrap whitespace/newlines. Rich runs already store n.lineAt and use linePrefixW/runsWidth for actual faces; reuse/extract that geometry. Existing static selection semantics/tsStart stay coherent; don't copy layout into Markdown. Distinguish glyph hit from nearest insertion caret and cover last glyph/space boundaries. Main has external sparse-Fenwick ui.ts42add19del near638/1077, separate from text hit region; preserve them on integration. Fresh sole core worker work/1105 owns1105, live neutral signal1107, then nullable numeric1106 in one three-task batch. Previous1101 batch ended after four tasks; no sixth task was appended. Primary API leads: Flutter TextPainter.getClosestGlyphForOffset and CSSOM View caretPositionFromPoint; inspect source offsets/grapheme boundaries before implementation. No suite/benchmark, exact T0 and actual Code caller only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A small public textOffsetAt(handle,x,y) uses node-local coordinates and returns the source-string offset of the hit displayed glyph, or -1 outside visible glyph content/invalid text nodes; wrapped styled runs keep their existing measured geometry and source line offsets
- [x] #2 Exact T0 proves wrapping across whitespace/newlines, mixed run fonts/styles, non-ASCII text, left/center/right alignment, boundaries/empty/outside, scroll/transform coordinates and destroyed/reused nodes on all three engines without changing existing static-selection units
- [x] #3 Actual shared Markdown/RichText inline links use the primitive for same-link pointer activation and keyboard navigation without duplicate destination controls or copied layout logic; Code gallery proof and docs/changelog/proposed checks are recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Need → provider → gap: inline links need source glyph hits; `UiNode.lineAt`, `linePrefixW`, `runsWidth`, `shownText`, `charRight` and existing local pointer dispatch already own the geometry. Added only `textOffsetAt` and per-layout generated-ellipsis line indices. Static selection `tsStart` / `tsPosAt` stay unchanged.
- Primary reference check: [Flutter TextPainter](https://api.flutter.dev/flutter/painting/TextPainter/getClosestGlyphForOffset.html) uses paragraph-local glyph geometry, [GlyphInfo](https://api.flutter.dev/flutter/dart-ui/GlyphInfo-class.html) retains UTF-16 source ranges, while [CSSOM caretPositionFromPoint](https://www.w3.org/TR/cssom-view/#dom-document-caretpositionfrompoint) returns insertion positions. Zinc chooses measured glyph advance cells, rejecting outside cells rather than selecting the closest caret. No new library or layout/cache framework.
- Source contract: monotonic source search after previous displayed plain line, run line source starts unchanged, code-point stepping via existing `charRight`, source mapping after case expansion, synthetic ellipsis rejected independently of literal source ellipses. Node-local coordinates include padding/alignment; existing box geometry rejects clipped ancestor regions. Hidden/invisible/unmounted/dead/non-text nodes return -1; recycled handles address the current node (callers retain `nodeSerial` for identity).
- Exact `text_offset` T0 passes interpreter/AOT/QuickJS using frozen 1102 engine SHA256 `8637544164c92f8d5d9e5ca8691c59b98faeb5d2eda2aaa9b2d657390c18088b`, source root this worktree. Covers last-half glyph vs insertion caret, spaces/right edge/padding/empty/invalid/hidden/destroy/reuse, repeated whitespace and hard/empty newlines, mixed bold/mono/italic wrapping, accented/surrogate text, three alignments, literal/synthetic ellipsis, uppercase expansion, unchanged static selection, real local pointer dispatch through scroll/scale/translation and ancestor clipping. No engine rebuild for this TS-only task.
- Limit: a glyph cell is its measured advance by line height, not an ink-pixel mask or new grapheme-shaping API. Existing font shaping/wrap policy is retained; no bidirectional-shaping feature added.

## Proposed tests

- Physical mouse/touch/keyboard and VoiceOver checks of Markdown/RichText in the actual gallery, including drag and cancel while scrolled; a few minutes, normal one-window UI memory.
- Pi/Mojave glyph/layout parity on mixed-font wrapped text; short background run, memory unmeasured. No suite, benchmark or pixel comparison started.

## Integration handover

Provider and exact T0 are complete. AC3 remains open until the Code worker finishes original shared Markdown/RichText pointer and keyboard replay on all engines with this source. The first actual Solid/interpreter caller replay passed wrapped accented inline link pointer and Home/Enter/Right/Space callbacks, then reached an unrelated JSON-fold assertion in the broader Code proof. The candidate overlay was restored. No layout copied into components. Coordinator integrates this tested provider so the original caller can complete; do not mark Done from the provider regression alone.

Final provider SHA256: `ebb8069543b6a6aefd2a29cb0fc07be650b22f366746317792f97791921c5196`; declaration SHA256 `6e4a54801e491f8394937b680b85dfdf6c9f3c1a0ee8fd4f9c827dbe70317ca3`. `zinc check tests/data/text_offset/main.ts` passes. Final `tests/run --only text_offset` passes; all three engines print `text offset: pass`. The binary remained frozen, no build or owned process left.

Original shared Code fixture passes Solid/React on interpreter, native AOT and QuickJS with source-hit provider and the integrated live neutral getter fix (4399fedce). Same-link pointer activation, wrapped accented text, Home/Enter/Right/Space, drag and background cancellation pass. JSON row assertions observe the first normal setAfterPaint; no duplicate controls, copied layout, extra UI frame or component workaround. Caller logs and candidate hashes: .worktrees/1078-code/.logs/kit-code/t0.log, t0-summary.log, candidates-provenance.txt. Provider acceptance is complete; Code family retains its own final cache/gallery/size work.
<!-- SECTION:NOTES:END -->

Primary reference check: Flutter TextPainter glyph hit uses paragraph-local coordinates and grapheme-cluster source ranges (https://api.flutter.dev/flutter/painting/TextPainter/getClosestGlyphForOffset.html ; https://api.flutter.dev/flutter/dart-ui/GlyphInfo-class.html). CSSOM caretPositionFromPoint returns an insertion position, a different boundary contract (https://www.w3.org/TR/cssom-view/#dom-document-caretpositionfrompoint). This task chooses an actual glyph source offset with -1 outside painted content, suitable for inline link ranges; do not conflate that with the existing selection caret.
