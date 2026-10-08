---
id: ZN-372
title: 'Spike: iOS and Android targets, viability and plan (decision record)'
status: Backlog
assignee: []
created_date: '2026-10-08 15:16'
labels:
  - targets
  - ios
  - android
  - research
  - size-M
milestone: m-20
dependencies: []
ordinal: 50140
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-08: would Zinc be viable for native iOS and Android? Assess and prove the minimum: AOT C++ built by Xcode's clang and the Android NDK (the pinned zig cannot sign or package), SDL3's iOS and Android backends (window, touch, IME, lifecycle, safe areas, GLES/Metal through ANGLE), packaging (xcodebuild/IPA, Gradle/APK/AAB), signing, App Store rules on interpreters (the bytecode interpreter and QuickJS with bundled code only), accessibility bridges, size. Run a hello and examples/rn-showcase on the iOS simulator and an Android emulator; write the decision record with scores and the task list of a real target.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hello and rn-showcase run on the iOS simulator and an Android emulator (screenshots in the report)
- [ ] #2 a decision record in docs/reports/zinc-next-decisions.md with the scores and what blocks (if anything)
- [ ] #3 the follow-up tasks are created in a milestone for mobile targets
<!-- AC:END -->
