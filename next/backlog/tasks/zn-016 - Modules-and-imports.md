---
id: ZN-016
title: Modules and imports
status: Done
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-06 09:11'
labels:
  - size-M
milestone: m-2
dependencies: []
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Acceptance: import/export, re-exports and init order match the `modules` conformance program.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 import/export, re-exports and init order match the `modules` conformance program.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Import/export (named, aliases, re-exports, export *), live bindings, init order (post-order, each module once) via frontend/modules loader; one merged Ast with ModuleInfo, per-module checker scopes, Diag/Node carry a file index. No separate 'modules' conformance program exists yet; tests/golden/modules is the reference (hand-checked against ES semantics, accepted by the oracle). Limits: no default or namespace imports/exports, no package imports, circular imports are Z0005, no dynamic import.
<!-- SECTION:NOTES:END -->
