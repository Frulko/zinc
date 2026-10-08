---
id: ZN-346
title: 'Trust policy: official only, verified, community; prebuilt allowed or not'
status: Backlog
assignee: []
created_date: '2026-10-08 14:34'
labels:
  - distribution
  - security
  - size-S
milestone: m-19
dependencies:
  - ZN-340
  - ZN-337
ordinal: 55370
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One policy in zinc.json, the user config or the system (for companies and CI): accepted tiers, prebuilt binaries allowed or source only, rebuild threshold N, transparency required, allowed mirrors.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each policy key has a test that changes what gets installed
- [ ] #2 a system policy cannot be loosened by a project's zinc.json
- [ ] #3 `zinc doctor` prints the effective policy and where each value comes from
<!-- AC:END -->
