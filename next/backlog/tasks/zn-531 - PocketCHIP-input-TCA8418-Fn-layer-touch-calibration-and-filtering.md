---
id: ZN-531
title: 'PocketCHIP input: TCA8418 Fn layer, touch calibration and filtering'
status: Backlog
assignee: []
created_date: '2026-10-09 07:41'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-522
ordinal: 320190
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the display plugins' evdev code: a PocketCHIP keymap with the Fn layer (brackets, braces, F-keys, Home/End, PgUp/PgDn), a 6-value touch calibration matrix in zinc.json (default invert X and Y for the sun4i-ts panel), median plus IIR de-jitter and settle filtering as tslib does, and a zinc calibrate screen that writes the matrix. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 after calibration a tap lands within 4 px of the target across the PocketCHIP screen
- [ ] #2 Fn combinations produce the expected keys in a text field
- [ ] #3 touch filtering removes jitter on a held stylus (recorded event traces replayed in a test)
- [ ] #4 the keymap and filter are covered by tests with injected events
<!-- AC:END -->
