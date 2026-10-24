---
id: ZN-437
title: 'zinc assets check and report --diff'
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
ordinal: 3600
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** Add `zinc assets check` (exit 1 when a group or the total is over the budgets in force, naming it), `zinc assets report [--diff old.json]`, and `clean` (empty the content cache). Criteria: a T0 test per subcommand; check fails on a fixture over budget and passes under it; report --diff names the groups that changed.

Inspection and gate commands. zinc export writes report.json beside sbom.spdx.json. Report: docs/reports/games/toolchain-assets-loading.md (8).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a T0 test per subcommand
- [ ] #2 check fails on a fixture over budget and passes under it
- [ ] #3 report --diff names the groups that changed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. Only build and info exist. The useful missing part is the gate: `check` (fails over budget, names the groups), `report --diff`, then ls/clean/verify. Cut ls/verify unless a user asks. Evidence: src/cli_core.cpp:106 only has `zinc assets build|info`; budgets are read by info
<!-- SECTION:NOTES:END -->
