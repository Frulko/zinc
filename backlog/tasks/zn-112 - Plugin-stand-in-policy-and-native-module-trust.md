---
id: ZN-112
title: Plugin stand-in policy and native module trust
status: Done
assignee: []
created_date: '2026-10-06 22:57'
updated_date: '2026-10-07 10:35'
labels:
  - plugins
  - security
  - size-S
milestone: m-9
dependencies:
  - ZN-101
ordinal: 40540
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stand-ins (*.next.ts / *.sim.ts) stay only where the real native cannot run in a profile (gphoto2 fake, process/socket on ESP32); delete the lottie/video stand-ins from the default path once the real plugins exist; record library hashes in the program manifest and refuse unlisted native modules (`--allow-native` for ad hoc ones); update docs/security.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a table in docs/reports/zinc-next-hostmodules.md lists each plugin's default (real or stand-in) and why
- [x] #2 a tampered plugin library is refused (T0)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. usage: n/a. Digest file plugin.sha256 verified on every build/load, tampered library refused (tests/t0/plugin_trust.sh); table of defaults in docs/reports/zinc-next-hostmodules.md. Not done: program-level hash manifest and --allow-native (no way for a program to name a library today).
<!-- SECTION:NOTES:END -->
