---
id: ZN-319
title: 'Fused executables: runtime plus .zapp in one file'
status: Backlog
assignee: []
created_date: '2026-10-08 14:19'
labels:
  - packaging
  - size-S
milestone: m-19
dependencies:
  - ZN-318
ordinal: 55040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`zinc fuse app.zapp --target macos|linux|rpi|rpi1 -o app`: the prebuilt runtime with the archive appended (LOVE's fused mode), for apps that do not need the AOT; the AOT stays the default of `zinc export`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the fused file runs on a machine without zinc (test: a clean environment with no ZINC_HOME)
- [ ] #2 fusing for another target uses the pinned cross runtime
- [ ] #3 size of a fused hello recorded in the notes
<!-- AC:END -->
