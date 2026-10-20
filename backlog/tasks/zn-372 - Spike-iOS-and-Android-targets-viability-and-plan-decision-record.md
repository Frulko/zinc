---
id: ZN-372
title: 'Spike: iOS and Android targets, viability and plan (decision record)'
status: Done
assignee: []
created_date: '2026-10-08 15:16'
updated_date: '2026-10-10 14:10'
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
- [x] #2 a decision record in docs/reports/zinc-next-decisions.md with the scores and what blocks (if anything)
- [x] #3 the follow-up tasks are created in a milestone for mobile targets
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research spike, 2026-10-10 (worktree agent). Report: docs/reports/zinc-next-mobile-spike.md.

Verdict: Android viable, low risk, first. iOS viable with three conditions (store builds are AOT plus bundled bytecode/JS only; Xcode 26 on a Mac and a paid account build, sign and upload; the iOS GPU back end is a later measured decision, the software raster through SDL's Metal renderer works first). Nothing blocks in the engine.

Decision (text in section 11 of the report, 'Decision record (number to be assigned by the coordinator)'): hosting A, the SDL3 shell reusing targets/macos/hal_sdl.cpp (62/70; own HALs 53, web view 42, native widgets 33); toolchain T1, zinc export --target ios|android generates an Xcode or Gradle project built by the platform clang (60/70; pinned zig with sysroots 47, prebuilt engine and bytecode only 42).

Acceptance criteria:
- #1 NOT met: nothing was built or run for iOS or Android. The owner's rule of 2026-10-10 forbids cross-target builds now, and this Mac has no Xcode (Command Line Tools only) and no Android SDK. Carried by MOB-05 (Android emulator) and MOB-07 (iOS simulator).
- #2 text written (report section 11); the coordinator copies it into docs/reports/zinc-next-decisions.md with its number (worktree rule: an agent allocates no decision number).
- #3 follow-up tasks proposed, not created (worktree rule); the coordinator files them in a new milestone 'Mobile targets (iOS, Android)'. Full rows (description, acceptance criteria, size, dependencies) in section 12 of the report:
  MOB-01 Mobile targets: ids, profiles and capabilities for ios and android (S)
  MOB-02 Android: vendor the SDL3 Android backend and Java glue (S)
  MOB-03 App entry without the CLI: static engine library for embedders (M, provable on the Mac)
  MOB-04 zinc export --target android: Gradle project generator (M)
  MOB-05 Android: hello and rn-showcase on the emulator (M)
  MOB-06 zinc export --target ios: Xcode project generator (M)
  MOB-07 iOS: hello and rn-showcase on the simulator (M)
  MOB-08 Mobile HAL on ios and android: lifecycle, density, safe areas, orientation, back (M)
  MOB-09 Mobile text input on ios and android: keyboard, IME, avoidance (M)
  MOB-10 Mobile GPU path: GLES 3 replay on android, renderer decision for ios (M)
  MOB-11 Plugins on ios and android: static linking, manifest targets, permissions (L)
  MOB-12 Packaging and signing for ios and android: IPA, AAB, dry-run (M; uploads need paid accounts)
  MOB-13 Accessibility bridges on ios and android from the zinc:ui tree (L)
  MOB-14 Development client on ios and android: interpreter and zinc dev over the LAN (M)
  MOB-15 Mobile budgets on a device: size and frame time (S, parked, needs a phone)

Status Review, not Done: the three criteria wait for the coordinator (#2, #3) and for the deferred cross-platform phase (#1).
Not verified: see section 10 of the report (Intel Mac and the iOS 26 simulator, x86_64 emulator image for API 36, the licence clause number, Android IME through SDL3, sizes and frame times).
Usage: tools/usage printed 'usage: n/a' in this worktree.

Coordinator, 2026-10-10: decision filed as D59 (docs/reports/zinc-next-decisions.md); follow-up tasks ZN-618..632 created in M26 Mobile targets (m-26, in the cross-platform group of priority.json). Criterion 1 (hello and rn-showcase on a simulator and an emulator) is not met here: no Xcode and no Android SDK on the development Mac, and cross-target runs are deferred; it is carried by ZN-622 (Android) and ZN-624 (iOS).
<!-- SECTION:NOTES:END -->
