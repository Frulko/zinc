---
id: ZN-629
title: 'Packaging and signing for ios and android: IPA, AAB, dry-run'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 14:08'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-622
  - ZN-624
ordinal: 201000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`zinc export --target ios --ipa` (archive, exportArchive with a provisioning profile), `--target android --aab` (bundleRelease, upload key), the 16 KB alignment check, `PrivacyInfo.xcprivacy`; `--dry-run` prints every command as `tools/sign-macos` does (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the dry-run output is tested on the desktop
- [ ] #2 a debug IPA installs on the simulator and a debug APK on the emulator
- [ ] #3 the upload commands are in the task notes for the owner (paid accounts: that step is parked)
<!-- AC:END -->
