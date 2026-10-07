---
id: ZN-313
title: >-
  Device core with a frame surface: same ZINC_FRAMEHASH from device-sim as from
  the macOS emulator
status: Backlog
assignee: []
created_date: '2026-10-07 14:15'
labels:
  - sim
  - tests
dependencies:
  - ZN-125
ordinal: 111000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-125 left AC1's device-sim half open: src/dev core has no graphics (UART only). Give the device core a frame surface (zrt gfx on the core, board size), run the s3-matrix demos on it and compare ZINC_FRAMEHASH with examples/boards/*/*/framehash.golden.
<!-- SECTION:DESCRIPTION:END -->
