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
ordinal: 96900
updated_date: '2026-11-07 18:30'
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

2026-10-31 owner-requested iPhone 4 / iOS 7.1.2 experiment: native UIKit host plus the console interpreter now run unchanged examples/hello and bouncing-ball on the real iPhone3,1. Hello output equals Mac; deterministic 120-frame ball capture has hash bd21d35ce981f6d6 and zero pixel difference. POSIX TLS preserves worker isolation; static libc++/libc++abi and the build tool are in the tree. Owner confirmed display/touch; background/resume retained the process. See docs/reports/iphone4-ios7-bringup.md and D203. Original iPhone 4S/iOS 9, simulator and wider feature criteria remain open; no unsupported criteria checked.
Review 2026-11-07: parked. iOS 9 HAL on the iPhone 4S; needs the iPhone 4S and Xcode; mobile is last in the owner's order.
<!-- SECTION:NOTES:END -->

Renderer follow-through (2026-10-31, owner requested iPhone 4/iOS 7 performance work): display-gl now uses retained circular scroll, opaque copy specialization, conservative rounded-clip elimination and SGX535 lean shaders. Native 640×960 Forms diagnostic median total is 24.226 ms across 12 samples (earlier full replay about 140 ms), maximum 48.306 ms; no steady-60-fps claim. Actual settled drawable versus full replay: identical RGB pixels. Targeted gl_clip/gl_caps/display_gl_scroll/gl_scroll/gl_renderer checks passed. Details and raw artifact locations: docs/reports/iphone4-ios7-bringup.md. Original iPhone 4S/iOS 9 acceptance criteria remain open.

Motion/input follow-through (2026-10-31): native Return/Done, keyboard traits and submit policies corrected and tested. SGX535 clip/gradient/polygon policies plus a logical-density drawable reduce the heavy card replay from 485.101 ms at Retina to 39.044 ms at scale 1, copy 3.283 ms; still below smooth animation. Pixel and transform checks pass, circle cache experiment removed. See the appended bring-up report and motion-input evidence; no iPhone 4S/iOS 9 criteria claimed.
