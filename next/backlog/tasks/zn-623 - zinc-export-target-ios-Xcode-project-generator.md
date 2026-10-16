---
id: ZN-623
title: 'zinc export --target ios: Xcode project generator'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 14:05'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-618
  - ZN-620
ordinal: 197000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Writes `dist/<name>-ios/`: an Xcode project (or CMake with the Xcode generator), Info.plist from `zinc.json` (bundle id, `UILaunchScreen`, orientations, usage strings), asset catalog with the icon, the AOT C++, engine sources, SDL3 (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the generated tree equals a golden for hello
- [ ] #2 `--print` lists the `xcodebuild` commands
- [ ] #3 no Xcode needed by the test
<!-- AC:END -->
