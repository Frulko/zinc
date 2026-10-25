---
id: ZN-821
title: Remote debug and performance tools through the agent
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-25 07:50'
labels:
  - agent
  - perf
  - size-L
milestone: m-13
dependencies: []
ordinal: 530460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-25: from the workstation, start the debug and measuring tools on a device through its agent: the program's profile (zinc profile) and its trace brought back, the zbench render suite run there with its JSON brought back, the DevTools inspector of a dev session reached through the agent's forwarded port, a CPU/memory/temperature view (zinc device top) during a run.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc device <d> profile <app> runs it with the profiler and brings back the report
- [ ] #2 zinc device <d> bench runs the zbench render suite there and writes its JSON here
- [ ] #3 the DevTools inspector of zinc dev --device opens on the workstation (chrome://inspect)
- [ ] #4 docs/guide names each tool
<!-- AC:END -->
