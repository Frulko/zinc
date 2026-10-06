---
id: ZN-075
title: Plugin sim and native stand-ins are checked against the Spec
status: Backlog
assignee: []
created_date: '2026-10-06 22:51'
labels:
  - plugins
  - checker
  - size-S
milestone: m-13
dependencies: []
ordinal: 40170
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Audit 02 RC22: a plugin's `*.sim.ts` default-exported object literal is typed as the literal (fewer params than the Spec), so `index.ts` calls fail (Z0104). Check the sim/next stand-in against the Spec (assignability with parameter dropping allowed as in TypeScript) and use the Spec's signatures for the call sites.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fixture: a spec with 5 parameters and a sim implementing 1 compiles and calls with 5 arguments
- [ ] #2 plugins/process, socket, gphoto2 sims pass this step
<!-- AC:END -->
