---
id: ZN-621
title: 'zinc export --target android: Gradle project generator'
status: Backlog
assignee: []
created_date: '2026-10-10 14:04'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-618
  - ZN-620
ordinal: 385300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Writes `dist/<name>-android/`: Gradle and CMake files, an `SDLActivity` subclass, AndroidManifest from `zinc.json` (id, version, orientation, permissions), the AOT C++, the engine sources, assets; target API 36, min API 21, 16 KB alignment flags (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the generated tree equals a golden for hello
- [ ] #2 `--print` lists the commands (`./gradlew assembleDebug`, `bundleRelease`)
- [ ] #3 no Android tool is run by the test
<!-- AC:END -->
