---
id: ZN-631
title: 'Development client on ios and android: interpreter and zinc dev over the LAN'
status: Backlog
assignee: []
created_date: '2026-10-10 14:08'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-625
ordinal: 385400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A debug build of the app entry with the interpreter that loads bytecode from `zinc dev`; refused in release builds; QuickJS engine linked statically (WebGL module included, no `dlopen`) (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a save on the desktop reloads the app on the emulator
- [ ] #2 a release export contains no reload code (`nm`)
- [ ] #3 the store policy of each mode is in `docs/guide`
<!-- AC:END -->
