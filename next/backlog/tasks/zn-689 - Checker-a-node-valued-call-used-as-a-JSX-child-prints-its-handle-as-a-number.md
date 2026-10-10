---
id: ZN-689
title: 'Checker: a node-valued call used as a JSX child prints its handle as a number'
status: Backlog
assignee: []
created_date: '2026-10-10 19:42'
labels:
  - checker
  - ui
  - bug
  - size-S
milestone: m-27
dependencies: []
ordinal: 450410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the museum editor: `{Part()}` as a JSX child, where Part returns a node, prints the node's handle as a number unless the function is named `children` or `renderX`. It should mount the node, or be refused with a message.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `{Part()}` mounts the returned node (test on the interpreter and the AOT), or the checker reports it with a Z code and a fix
- [ ] #2 a regression program in tests/golden
<!-- AC:END -->
