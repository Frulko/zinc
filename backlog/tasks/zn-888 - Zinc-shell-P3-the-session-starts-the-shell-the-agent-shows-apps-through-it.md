---
id: ZN-888
title: 'Zinc shell P3: the session starts the shell, the agent shows apps through it'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 22:04'
labels:
  - size-L
  - pi
  - ui
milestone: m-25
dependencies: []
ordinal: 582460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase of the Zinc shell (D194, docs/reports/zinc-shell/03-design.md §8).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc-session with ZINC_SHELL=1 runs the player as the shell (launch loop, boot app, next-app moved into the shell); two shell failures within 60 s fall back to the old loop
- [ ] #2 zinc agent: under a live shell.sock, apps start with ZINC_DISPLAY=shell and no file lease, unless app.json says display gl
- [ ] #3 zinc device run replaces the app shown by the shell; stop returns to the hub
- [ ] #4 on the Spark: zinc device run, stop, Home
<!-- AC:END -->
