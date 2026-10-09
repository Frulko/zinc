---
id: ZN-461
title: >-
  iOS 9 armv7 toolchain spike: Xcode clang + ld-classic + armv7 SDK + static
  libc++
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
labels:
  - handheld
  - handhelds
  - ios
  - toolchain
  - size-M
milestone: m-23
dependencies:
  - ZN-453
ordinal: 300080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build a C++20 hello .app for armv7-apple-ios9.0 on this Mac: Xcode 26 clang (verified to emit armv7-apple-ios9 objects and thread_local) and ld (ld-classic handles armv7), an iPhoneOS SDK that still has armv7 .tbd stubs (Xcode 13.4.1's, owner-downloaded), and LLVM libc++/libc++abi built static for armv7-apple-ios9.0 by tools/build-ios-legacy-libcxx at a pinned LLVM version (src/rt/machine.cpp uses floating std::to_chars, unavailable in iOS 9's libc++). Sign with ldid on a jailbroken phone (Phoenix + AppSync Unified) or codesign with a free Apple ID profile; install with ideviceinstaller.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the hello binary has LC_VERSION_MIN_IPHONEOS 9.0 and is armv7 (otool -l, lipo -info)
- [ ] #2 it runs on the iPhone 4S (iOS 9.3.6) and its output shows in idevicesyslog
- [ ] #3 a check lists undefined symbols of the binary and finds none missing from the SDK's armv7 stubs
- [ ] #4 the signing route used and its expiry are documented
<!-- AC:END -->
