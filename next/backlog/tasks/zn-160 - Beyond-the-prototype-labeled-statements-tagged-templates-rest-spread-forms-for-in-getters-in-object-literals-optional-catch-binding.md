---
id: ZN-160
title: >-
  Beyond the prototype: labeled statements, tagged templates, rest/spread forms,
  for-in, getters in object literals, optional catch binding
status: Backlog
assignee: []
created_date: '2026-10-06 23:05'
labels:
  - language
  - size-M
milestone: m-7
dependencies:
  - ZN-155
ordinal: 41020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The forms the prototype also rejects (audit 01 table B): implement in the parser and desugarer with a fixture each, keeping the typed fast paths unaffected.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fixtures equal Node's output for each form
<!-- AC:END -->
