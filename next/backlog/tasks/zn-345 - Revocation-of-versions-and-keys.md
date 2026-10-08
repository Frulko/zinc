---
id: ZN-345
title: Revocation of versions and keys
status: Backlog
assignee: []
created_date: '2026-10-08 14:34'
labels:
  - distribution
  - security
  - size-S
milestone: m-19
dependencies:
  - ZN-336
  - ZN-344
ordinal: 55360
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The index can revoke a version or a publisher key; zinc refuses to install it and warns at `zinc run` / `zinc install` when a revoked item is already installed or locked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a revoked version is refused at install
- [ ] #2 an installed revoked version prints a warning naming the reason and the replacement
- [ ] #3 a revoked key invalidates every artifact it signed that has no other valid signature
<!-- AC:END -->
