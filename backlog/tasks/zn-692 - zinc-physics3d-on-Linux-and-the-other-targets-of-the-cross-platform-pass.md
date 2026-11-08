---
id: ZN-692
title: 'zinc:physics3d on Linux and the other targets of the cross-platform pass'
status: Backlog
assignee: []
created_date: '2026-10-10 19:46'
labels:
  - physics
  - size-S
dependencies: []
ordinal: 57600
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of the first playable pinball, D77.) The plugin was built and proved on x86_64 macOS only; Jolt's cross-platform determinism flag is set and was not run on arm64.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the plugin builds for the Linux targets with the pinned zig and tests/t1/physics3d.sh passes there
- [ ] #2 the replay positions on arm64 equal the x86_64 golden
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. arm64 and Linux builds of physics3d: cross-platform pass.
Review 2026-11-07: cross-platform pass. (corrected: park proposed; it needs only the Raspberry Pi 3B+ or the Intel Mac, both available since 2026-11-07 (owner): cross-platform pass, not parked.)
<!-- SECTION:NOTES:END -->
