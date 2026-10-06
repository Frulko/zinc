---
id: ZN-094
title: 'Diagnostics parity: codes, wording, --json, ts-ignore policy'
status: Backlog
assignee: []
created_date: '2026-10-06 22:54'
labels:
  - language
  - tools
  - size-M
milestone: m-13
dependencies:
  - ZN-062
ordinal: 40360
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Table C of audit 01: add the Z1xxx codes for var, regex (until supported), dynamic import, holey array literals, `in` on non-objects, labeled statements with the prototype's wording; one error per cause; `zinc check --json` in the LSP diagnostic shape (docs/guide/06-testing.md); document the differences from tsc and decide `// @ts-ignore` handling (honour it or refuse it, recorded).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests/golden/diagnostics fixtures for each code (message, line, column)
- [ ] #2 `zinc explain Z....` prints the page for every code (docs/diagnostics.md regenerated)
<!-- AC:END -->
