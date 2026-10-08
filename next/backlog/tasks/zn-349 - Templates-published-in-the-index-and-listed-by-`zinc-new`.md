---
id: ZN-349
title: Templates published in the index and listed by `zinc new`
status: Backlog
assignee: []
created_date: '2026-10-08 14:34'
labels:
  - distribution
  - templates
  - size-S
milestone: m-19
dependencies:
  - ZN-336
  - ZN-315
  - ZN-316
ordinal: 55400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Templates (kind: template) go through the same index, signatures, tiers and lock as plugins; `zinc new` lists the official ones and those the policy allows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc new` lists index templates with their tier
- [ ] #2 a template from a community publisher follows the policy (refused under official-only)
- [ ] #3 a template pins the plugins it needs in the generated zinc.lock
<!-- AC:END -->
