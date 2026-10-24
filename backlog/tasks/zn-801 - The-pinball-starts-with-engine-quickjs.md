---
id: ZN-801
title: The pinball starts with --engine quickjs
status: Backlog
assignee: []
created_date: '2026-10-24 23:55'
labels:
  - size-S
milestone: m-15
dependencies: []
ordinal: 6300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-649.17: the pinball does not start with `--engine quickjs` ("Could not find export 'TableDef'", an interface imported by name).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc run examples/pinball --engine quickjs` renders frames (interface imported by name resolved)
- [ ] #2 A short smoke in the pinball T1 test
<!-- AC:END -->
