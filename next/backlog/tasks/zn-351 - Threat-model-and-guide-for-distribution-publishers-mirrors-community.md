---
id: ZN-351
title: 'Threat model and guide for distribution: publishers, mirrors, community'
status: Backlog
assignee: []
created_date: '2026-10-08 14:35'
labels:
  - distribution
  - security
  - docs
  - size-S
milestone: m-19
dependencies:
  - ZN-346
  - ZN-343
  - ZN-345
ordinal: 55420
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/guide/08-security.md and 07-distribution.md: what each tier guarantees, what a mirror or proxy can and cannot do, how to publish (keys, CI workflow, rebuilders), how to run a private index and mirror for a company, key rotation and incident response.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 every attack of the TUF tests and of D-transparency maps to a guarantee in the guide
- [ ] #2 a publisher can follow the guide from a new repository to a verified-community release with the reusable workflow
- [ ] #3 the guide is linked from `zinc help add`
<!-- AC:END -->
