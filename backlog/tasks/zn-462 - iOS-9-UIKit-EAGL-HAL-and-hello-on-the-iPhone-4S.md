---
id: ZN-462
title: 'iOS 9: UIKit/EAGL HAL and hello on the iPhone 4S'
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
labels:
  - handheld
  - handhelds
  - ios
  - size-M
  - parked
milestone: m-23
dependencies:
  - ZN-461
  - ZN-455
ordinal: 93800
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
targets/ios-legacy/hal_ios.mm: UIApplicationMain without storyboard, a view backed by CAEAGLLayer (contentsScale 2), EAGLContext ES2, CADisplayLink with frameInterval 1, touches to HalInput, mach_absolute_time clock, background stops GL. The core app bundle is prebuilt; zinc export --target ios-legacy adds program.zbc and signs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/hello runs on the iPhone 4S with output in idevicesyslog between the zinc markers
- [ ] #2 the same HAL builds for the iOS Simulator (arm64) as a logic test in T2, skipped without Xcode
- [ ] #3 going to the home screen and back neither crashes nor issues GL calls in the background
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. iOS 9 UIKit/EAGL HAL: needs the owner's iPhone 4S, the old Xcode 13.4.1 armv7 SDK and a jailbreak or free-profile signing; no targets/ios-legacy or libc++ build tool exists; far from the owner goal (the modern iOS export is ZN-624..631). Park with the iOS 9 cluster (461, 462, 466, 475, 479, 483, 497, 498). Evidence: no targets/ios-legacy, no tools/build-ios-legacy-libcxx
<!-- SECTION:NOTES:END -->
