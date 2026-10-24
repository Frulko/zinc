---
id: ZN-030
title: Bytecode upload to a preflashed ESP32 core
status: Done
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-25 01:53'
labels:
  - size-L
milestone: m-6
dependencies: []
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Acceptance: `zinc run hello.ts --target esp32` runs on a device with no manual install step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc run hello.ts --target esp32` runs on a device with no manual install step.
- [x] #2 M6 demo: hello on ESP32 (QEMU first) with no manual install
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed on 2026-10-07 under RULES.md: what remains became tasks of the parity backlog (ZN-042: H-typed-abi, C-typed-abi; ZN-053: H-updater, R-sdl-static; ZN-030: validated on Espressif QEMU and device-sim, real board parked as ZN-055).
Review 2026-10-25: the open criteria are moot. Needs a real ESP32 board; parked, cross pass.
<!-- SECTION:NOTES:END -->
