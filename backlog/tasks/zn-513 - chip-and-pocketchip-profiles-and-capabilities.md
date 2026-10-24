---
id: ZN-513
title: 'chip and pocketchip: capabilities rows and docs'
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
updated_date: '2026-10-25 01:53'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-512
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** capabilities.json rows (T2, gles2, gpio, power; pocketchip touch+keyboard), a T0 table test, docs/targets/chip.md. Already there: src/frontend/profile.cpp:24; src/cli_core.cpp:1041; targets/capabilities.json has no chip.

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
Review 2026-10-25: done-partly. Profile rows chip and pocketchip exist (src/frontend/profile.cpp:24-25) and export/deploy map them to armv7-linux. Missing: capabilities.json rows (0 matches), zinc:platform constants, docs/targets/chip.md, a T0 table test. Cheap, but only matters if the CHIP is pursued. Evidence: src/frontend/profile.cpp:24; src/cli_core.cpp:1041; targets/capabilities.json has no chip
<!-- SECTION:NOTES:END -->
