---
id: ZN-618
title: 'Mobile targets: ids, profiles and capabilities for ios and android'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 14:02'
labels:
  - mobile
  - size-S
milestone: m-26
dependencies: []
ordinal: 193000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rows `ios` and `android` in `targets/capabilities.json` (touch, no desktop keys, `process` and `dynlib` false on iOS); target ids `ios`, `ios-sim`, `android` known to the CLI; `zinc.json` keys `app.id`, version code, orientation, permissions, icon (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc check --profile ios` and `--profile android` refuse a program that requires `process` or `tray` with the capability message
- [ ] #2 `zinc toolchain targets` lists the ids with "needs Xcode" / "needs the Android NDK"
- [ ] #3 a T0 test
<!-- AC:END -->
