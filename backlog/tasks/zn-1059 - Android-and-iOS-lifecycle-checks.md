---
id: ZN-1059
title: Android and iOS lifecycle checks
status: Backlog
assignee: []
created_date: '2026-11-07 16:41'
labels:
  - mobile
  - cross
  - size-S
  - parked
milestone: m-26
dependencies: []
ordinal: 102300
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Live resize and record passes on phones.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-850: records over the phone glue (Android JNI, iOS) and rec.h checked on a 32-bit ARM (unaligned little-endian reads).
- ZN-631: rn-showcase in Zinc Go on the Nexus 7 crashes when the tablet turns to portrait (array index out of bounds, in the task notes).
- Live resize (owner, 2026-10-16): Android and iOS send no live resize; the watcher stays off the UI thread (ZN-622): rotate a phone with a zinc:ui app and check one frame at the new size, no frame drawn from the UI thread.
- ZN-722: optional resource diagnostic hooks and CDP snapshots on Windows/Linux/mobile during the final target pass; only the development Mac was checked.
- Owner memory pass 2026-10-31: verify shared UI image-cache ownership, WebP scaled decode and destroyed-image GPU collection on Windows/Linux/mobile during the cross-platform pass; exercised locally on macOS with interpreter/AOT/QuickJS.
- Clear shared storage fix: verify temporary-file replacement and error propagation on Windows/Linux/mobile in the cross-platform pass; native macOS interpreter/AOT/QuickJS regression covered. Validate Clear gestures on physical touch hardware.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Rotating a phone sends one resize frame, not drawn from the UI thread
- [ ] #2 Records over the phone glue and rec.h on 32-bit ARM
- [ ] #3 Shared UI image cache and Clear storage fix verified on mobile; resource diagnostics hooks
<!-- AC:END -->
