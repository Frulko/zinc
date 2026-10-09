---
id: ZN-322
title: Permission manifest enforced at run time
status: In Progress
assignee: []
created_date: '2026-10-08 14:19'
updated_date: '2026-10-09 00:17'
labels:
  - security
  - runtime
  - size-M
milestone: m-19
dependencies: []
ordinal: 55070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`permissions` in zinc.json: net (hosts or *), fs (read/write roots), camera, microphone, serial, process, location. Host modules check it; a denied call fails with an error naming the missing permission. In `zinc run` (development) a missing permission warns once; exported apps enforce it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each host module family has a test: allowed call works, denied call errors with the permission name
- [ ] #2 dev mode warns once per permission, export mode denies
- [ ] #3 the permission list appears in `zinc export` output and in the bundle metadata (Info.plist usage strings on macOS)
<!-- AC:END -->
