---
id: ZN-154
title: >-
  Examples: video, camera, maps, svg, lottie, mapper, remarkable, webview,
  remote
status: Done
assignee: []
created_date: '2026-10-06 23:04'
labels:
  - examples
  - size-M
milestone: m-15
dependencies:
  - ZN-109
  - ZN-110
  - ZN-108
  - ZN-106
  - ZN-117
  - ZN-111
  - ZN-113
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The native-plugin examples with their real plugins (or the fakes where the prototype used fakes): bounce/looper/quad/mapper, camera/*, maps/*, svg-gallery, lottie-gallery, remarkable/*, webview/hybrid, remote/viewer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests/examples.lst OK for every entry (no xfail left); pixel or hash comparisons pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed by the backlog review of 2026-10-10 (docs/reports/backlog-review-2026-10-10.md), with the owner's approval: Its criterion holds: tests/examples.lst has 69 entries, all OK, no xfail; the pixel rows are in the proto manifest (33 equal, 9 known with reasons, 22 without a prototype frame). It is blocked for ever by the parked ZN-134 (reMarkable under QEMU), which keeps that part.
<!-- SECTION:NOTES:END -->
