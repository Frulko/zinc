---
id: ZN-818
title: >-
  zinc device update --local: put this tree's engine on a device without a
  release
status: Backlog
assignee: []
created_date: '2026-10-25 07:50'
labels:
  - agent
  - size-M
milestone: m-13
dependencies: []
ordinal: 527460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-25: updating a device in dev mode should not need a release. zinc device <d> update --local cross-builds the engine for the device's system and architecture (tools/build-linux with the pinned zig), sends the package over the paired channel and installs it as the device's engine the way an OTA update does (versions/<ver>-<id>, current link, trial and roll back), marked as a local build. The paired TLS channel is the trust: no release signature is asked for a local package.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc device <d> update --local builds the package for the device's architecture when it is missing or older than the tree, sends it and switches the device to it
- [ ] #2 zinc device <d> info names the engine as a local build (version and commit)
- [ ] #3 a T1 test installs a local package on a loopback agent and checks the running engine
<!-- AC:END -->
