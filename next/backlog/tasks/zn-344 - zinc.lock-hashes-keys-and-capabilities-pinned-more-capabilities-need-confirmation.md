---
id: ZN-344
title: >-
  zinc.lock: hashes, keys and capabilities pinned; more capabilities need
  confirmation
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
  - ZN-322
ordinal: 55350
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc.lock records for every plugin and template: version, source hash, artifact hashes per target, publisher key, tier and the capabilities (permissions of ZN-322) it requests. An update that asks for a capability the lock does not list stops for confirmation (`zinc add --accept`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a second machine installs exactly the locked bytes
- [ ] #2 an update requesting a new capability is refused without confirmation and names the capability
- [ ] #3 `zinc install --frozen` fails when zinc.json and zinc.lock disagree
<!-- AC:END -->
