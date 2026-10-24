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
  - parked
milestone: m-23
dependencies:
  - ZN-462
ordinal: 94400
updated_date: '2026-10-25 01:53'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. iOS 9 device lab: needs the owner's iPhone 4S, the old Xcode 13.4.1 armv7 SDK and a jailbreak or free-profile signing; no targets/ios-legacy or libc++ build tool exists; far from the owner goal (the modern iOS export is ZN-624..631). Park with the iOS 9 cluster (461, 462, 466, 475, 479, 483, 497, 498). Evidence: no targets/ios-legacy, no tools/build-ios-legacy-libcxx
<!-- SECTION:NOTES:END -->
