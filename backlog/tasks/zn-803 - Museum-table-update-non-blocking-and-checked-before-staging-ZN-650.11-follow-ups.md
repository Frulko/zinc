---
id: ZN-803
title: >-
  Museum table update: non-blocking and checked before staging (ZN-650.11
  follow-ups)
status: Backlog
assignee: []
created_date: '2026-10-24 23:55'
labels:
  - size-M
milestone: m-27
dependencies: []
ordinal: 9700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-650.11: a fused or exported table has no `zinc update-app` command, so it never updates; check and download should be a background operation of `zinc:system/update` (today they block the frame on curl with no timeout).
- ZN-650.11: a published project that does not parse is accepted (signature and hash only), then shows an empty table; check the project before staging.
- ZN-650.11: `zinc:process` promises are not awaited in deterministic runs, so `museum_update` races frames against the download (fails under heavy load).
- ZN-650.11: the update period (one hour) is a constant in `src/update.ts`; the storyboard editor has no "publish" step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Check and download run off the frame (no blocking curl without timeout) in zinc:system/update
- [ ] #2 A published project that does not parse is refused before staging
- [ ] #3 zinc:process promises are awaited in deterministic runs so museum_update no longer races
- [ ] #4 zinc update-app works on a fused or exported table
<!-- AC:END -->
