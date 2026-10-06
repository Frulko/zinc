---
id: ZN-033
title: Interface properties and object literals
status: Done
assignee: []
created_date: '2026-10-06 09:14'
updated_date: '2026-10-06 09:43'
labels:
  - size-M
milestone: m-2
dependencies: []
ordinal: 16200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prerequisite of ZN-017: interfaces with data properties, object literals checked against them, anonymous object literals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Object literals typed by an interface and anonymous ones run with the Node output; the oracle accepts everything we accept
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Records (data-only interfaces) and object literals, typed and anonymous; golden records matches Node; oracle accepts; adversarial batch 0 violations; ASan T1 green. Limits: nominal records (stricter than tsc), no optional props/spread/methods in literals.
<!-- SECTION:NOTES:END -->
