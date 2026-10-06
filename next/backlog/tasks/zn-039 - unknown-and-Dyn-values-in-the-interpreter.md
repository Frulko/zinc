---
id: ZN-039
title: unknown and Dyn values in the interpreter
status: Backlog
assignee: []
created_date: '2026-10-06 11:23'
labels:
  - size-L
milestone: m-3
dependencies: []
ordinal: 21300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Programs: dyn, dyn_literals, dyn_unknown. Overlaps ZN-025 (inline caches, strict profiles): this task covers semantics only, ZN-025 keeps the performance and Z1006 part.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 dyn, dyn_literals and dyn_unknown match their frozen goldens in the interpreter
<!-- AC:END -->
