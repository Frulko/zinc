---
id: ZN-819
title: 'zinc dev --device: --perf and --live'
status: Done
assignee: []
created_date: '2026-10-25 07:50'
updated_date: '2026-10-25 07:53'
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
- [x] #1 --perf starts the program on the device with ZINC_PERF_HUD=1 at every restart
- [x] #2 --live opens the live window beside the dev session and closes it when the session ends
- [x] #3 zinc dev --help names both options
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: zinc dev --device <d> --perf sends ZINC_PERF_HUD=1 with every start (the start message's env, ZINC_* names only on the device side); --live runs zinc device <d> screen --live as a child of the session, started again 10 s after a failed try (a first start on a Pi can outlast the viewer's wait), left closed when the person closes it, ended with the session. zinc dev --perf without a device sets the panel here; --live without one is refused. tests/t1/agent_dev_perf.sh (ps of the program's environment, the viewer process beside and after the session); agent_dev passes.
<!-- SECTION:NOTES:END -->
