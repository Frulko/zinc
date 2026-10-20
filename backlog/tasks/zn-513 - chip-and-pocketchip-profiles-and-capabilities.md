---
id: ZN-513
title: chip and pocketchip profiles and capabilities
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
updated_date: '2026-10-10 07:37'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-512
ordinal: 272000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Profile rows in src/frontend/profile.cpp and compiler/src/cli.ts (chip: f64, 720x576, heap 128M; pocketchip: f64, 480x272, heap 128M), zigTargetFor chip/pocketchip -> armv7-linux in src/cli_core.cpp, entries in targets/capabilities.json (tier T2, gpu gles2, gpio, power, dynlib false; pocketchip with touch and keyboard true, pointer false) and the table of docs/targets/capabilities.md; new docs/targets/chip.md (boards, OS choice, flashing, deploy). (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc build --target chip and --target pocketchip build hello and hero
- [ ] #2 zinc:platform exposes PROFILE, SCREEN_W/H, TOUCH, KEYBOARD, GPIO, POWER for both profiles
- [ ] #3 a zinc.json requires that the profile does not meet is refused with the profile named
- [ ] #4 T0 test of the profile table and the capabilities rows
- [ ] #5 docs/targets/chip.md exists and links this report
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-10 (ZN-414): profile rows chip and pocketchip exist in src/frontend/profile.cpp, and export/deploy map chip/pocketchip to the new armv7-linux target (-mcpu=cortex_a8) in cli_core.cpp zigTargetFor; capabilities rows, zinc:platform, docs and the builds remain.
<!-- SECTION:NOTES:END -->
