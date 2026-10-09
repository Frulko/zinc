---
id: ZN-483
title: 'iOS 9 device lab: automated runs on a tethered iPhone 4S'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
labels:
  - handheld
  - handhelds
  - ios
  - testing
  - size-M
milestone: m-23
dependencies:
  - ZN-462
ordinal: 300300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tools/ios-device-run: ideviceinstaller install, launch (idevicedebug with the 9.3 DeveloperDiskImage mounted, or open over SSH when jailbroken), idevicesyslog capture between zinc:start and zinc:exit, idevicescreenshot.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc run --target ios-legacy --device prints the program output and its exit status
- [ ] #2 a T2 test is skipped (77) without a device
- [ ] #3 documented in docs/targets/handhelds.md
<!-- AC:END -->
