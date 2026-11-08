---
id: ZN-814
title: devices/iphone.json and devices/android-phone.json for zinc run --simulate
status: Backlog
assignee: []
created_date: '2026-10-24 23:56'
labels:
  - size-S
milestone: m-26
dependencies: []
ordinal: 51000
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Add safe-area insets and a cutout to devices/phone.json (and an android variant only if the behaviour differs); one T1 smoke of insets.

From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-625: `devices/iphone.json` and `devices/android-phone.json` for `zinc run --simulate`, with safe-area insets, a cutout and their behaviour profile, so phone layouts are proven on the Mac (item 3).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Two device presets with safe-area insets, cutout and behaviour profile
- [ ] #2 A T1 smoke shows a layout with insets on the Mac
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: rewrite. devices/phone.json exists with no insets; add insets and cutout to it (one preset) rather than two files. Evidence: devices/phone.json
<!-- SECTION:NOTES:END -->
