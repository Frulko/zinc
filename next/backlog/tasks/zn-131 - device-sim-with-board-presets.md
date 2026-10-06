---
id: ZN-131
title: device-sim with board presets
status: Backlog
assignee: []
created_date: '2026-10-06 23:00'
labels:
  - simulator
  - size-M
milestone: m-11
dependencies:
  - ZN-128
  - ZN-125
ordinal: 40730
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`zinc device-sim --board <preset>` runs the ESP32 core with the board's chip models and a window; the core reports its modules and `zinc run` checks imports before upload.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 s3-matrix demos run in a window with tilt from the mouse; uploading a program that needs a missing module fails early with the module name
<!-- AC:END -->
