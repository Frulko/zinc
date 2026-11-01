---
id: ZN-931
title: Ink dataset recorder and synthetic generator
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-01 12:11'
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
- [ ] #1 tools/ink-train/make-dataset produces a deterministic JSON set under 2 MB
- [ ] #2 The recorder works in the emulator
<!-- AC:END -->
