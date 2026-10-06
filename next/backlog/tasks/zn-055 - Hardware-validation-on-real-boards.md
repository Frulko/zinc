---
id: ZN-055
title: Hardware validation on real boards
status: Backlog
assignee: []
created_date: '2026-10-06 16:42'
updated_date: '2026-10-06 19:01'
labels:
  - size-M
dependencies: []
ordinal: 32800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Run on physical boards: ESP32 (closes AC 1 of ZN-030: zinc flash, zinc run), Raspberry Pi (aarch64 and armhf cross builds), reMarkable Paper Pro. Record results and the issues found.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc flash --target esp32 then zinc run hello.ts --target esp32 on a real board
- [ ] #2 an AOT program for aarch64 and armhf runs on a Pi
- [ ] #3 results written in docs/reports with the board and the versions
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
No board reachable in this session (no serial port; the Pi rig timed out on both addresses). Wrote tools/validate-hardware and docs/reports/zinc-next-hardware.md with the table to fill. Task stays in Backlog: needs a person with the boards.
<!-- SECTION:NOTES:END -->
