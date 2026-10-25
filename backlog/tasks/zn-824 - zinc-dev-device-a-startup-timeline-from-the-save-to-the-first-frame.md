---
id: ZN-824
title: 'zinc dev --device: a startup timeline from the save to the first frame'
status: Backlog
assignee: []
created_date: '2026-10-25 08:00'
labels:
  - agent
  - perf
  - size-M
milestone: m-13
dependencies: []
ordinal: 533460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-25: know end to end why an app takes long to start on a device. zinc dev --device prints, at each start, one line per phase with its duration: pack on the workstation, bytes sent, waiting for the screen, engine start, each plugin (cached, prebuilt or compiled, with its time), program load, first frame; --timing writes the same as JSON. The program reports its first frame over its dev socket.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each start of zinc dev --device prints the phases and their durations up to the first frame on the device
- [ ] #2 a plugin compiled on the device shows as such with its time
- [ ] #3 a T1 test checks the phases on a loopback agent
<!-- AC:END -->
