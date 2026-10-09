---
id: ZN-437
title: 'zinc assets commands: ls, info, report, check, clean, verify'
status: Backlog
assignee: []
created_date: '2026-10-09 07:36'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-434
  - ZN-435
ordinal: 205000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Inspection and gate commands. zinc export writes report.json beside sbom.spdx.json. Report: docs/reports/games/toolchain-assets-loading.md (8).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a T0 test per subcommand
- [ ] #2 check fails on a fixture over budget and passes under it
- [ ] #3 report --diff names the groups that changed
<!-- AC:END -->
