---
id: ZN-847
title: 'CarPlay: Native USB transport on macOS'
status: Ready
assignee:
  - '@parallel'
created_date: '2026-10-28 21:07'
labels:
  - carplay
  - size-L
dependencies: []
ordinal: 556460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: finish the separate Zinc CarPlay plugin, wired and wireless, with software identity authentication. Reuse proven open protocol implementations; do not put CarPlay into the engine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A separate plugin backend provides a real USB CarPlay transport on macOS without an MFi chip
- [ ] #2 USB transport framing and lifecycle have targeted automated tests and physical verification limits are explicit
<!-- AC:END -->
