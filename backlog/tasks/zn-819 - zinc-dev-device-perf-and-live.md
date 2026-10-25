---
id: ZN-819
title: 'zinc dev --device: --perf and --live'
status: Backlog
assignee: []
created_date: '2026-10-25 07:50'
labels:
  - agent
  - size-S
milestone: m-13
dependencies: []
ordinal: 528460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-25: zinc dev <project> --device <d> --perf shows the performance panel (ZINC_PERF_HUD) over the program on the device; --live opens the device's screen in a window here (zinc device screen --live) for the session.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 --perf starts the program on the device with ZINC_PERF_HUD=1 at every restart
- [ ] #2 --live opens the live window beside the dev session and closes it when the session ends
- [ ] #3 zinc dev --help names both options
<!-- AC:END -->
