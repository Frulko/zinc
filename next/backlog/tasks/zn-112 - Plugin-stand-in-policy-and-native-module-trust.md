---
id: ZN-112
title: Plugin stand-in policy and native module trust
status: Backlog
assignee: []
created_date: '2026-10-06 22:57'
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
- [ ] #1 a table in docs/reports/zinc-next-hostmodules.md lists each plugin's default (real or stand-in) and why
- [ ] #2 a tampered plugin library is refused (T0)
<!-- AC:END -->
