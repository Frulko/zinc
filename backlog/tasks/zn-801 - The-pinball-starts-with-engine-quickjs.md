---
id: ZN-801
title: The pinball starts with --engine quickjs
status: Done
assignee: []
created_date: '2026-10-24 23:55'
updated_date: '2026-10-25 11:11'
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
- [x] #1 `zinc run examples/pinball --engine quickjs` renders frames (interface imported by name resolved)
- [x] #2 A short smoke in the pinball T1 test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25: Removed the platform-specific TOUCH import from the score panel. Portable hints show keyboard, touch and gamepad controls together. New tests/t1/pinball.sh launches, flips and captures frame 240 on the interpreter and QuickJS: pixel-identical. The shared Box2D core test also passes on both engines.
<!-- SECTION:NOTES:END -->
