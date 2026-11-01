---
id: ZN-931
title: Ink dataset recorder and synthetic generator
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-01 12:11'
updated_date: '2026-11-01 13:19'
labels:
  - ink
  - size-M
milestone: m-29
dependencies: []
ordinal: 625460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Record mode in the notes app writes per-writer stroke JSON; a generator renders stroke variants from fonts; held-out split by writer. Design, scores and context: docs/reports/murdoku-eink-handwriting.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tools/ink-train/make-dataset produces a deterministic JSON set under 2 MB
- [x] #2 The recorder works in the emulator
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
make-dataset is pure stdlib Python: hand-written stroke skeletons (several ways to draw each class) bent by per-writer style and per-sample jitter, not font outlines (no third-party glyph data, CC0, no font dependency). 12 writers x 11 classes x 14 samples, 4 held-out writers, 750 KB. Recorder: examples/remarkable/notes/src/recorder.ts (Record button, NOTES_RECORD=<writer>, NOTES_DIR); tests/t0/ink_dataset.sh, tests/t1/ink_recorder.sh (headless emulator, scripted pen path) pass.
<!-- SECTION:NOTES:END -->
