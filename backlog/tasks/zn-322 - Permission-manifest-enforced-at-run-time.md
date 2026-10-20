---
id: ZN-322
title: Permission manifest enforced at run time
status: Done
assignee: []
created_date: '2026-10-08 14:19'
updated_date: '2026-10-09 00:50'
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
- [x] #1 each host module family has a test: allowed call works, denied call errors with the permission name
- [x] #2 dev mode warns once per permission, export mode denies
- [x] #3 the permission list appears in `zinc export` output and in the bundle metadata (Info.plist usage strings on macOS)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done through ZN-322.01 (model, fs, net), .02 (process, sockets, osc, mqtt, camera) and .03 (exported apps enforce, export lists, Info.plist usage strings). usage: n/a
<!-- SECTION:NOTES:END -->
