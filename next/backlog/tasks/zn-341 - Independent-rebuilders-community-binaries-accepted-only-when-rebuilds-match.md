---
id: ZN-341
title: 'Independent rebuilders: community binaries accepted only when rebuilds match'
status: Backlog
assignee: []
created_date: '2026-10-08 14:34'
labels:
  - distribution
  - security
  - ci
  - size-M
milestone: m-19
dependencies:
  - ZN-333
  - ZN-338
  - ZN-340
ordinal: 55320
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A rebuilder job (ours on CI, others anywhere) rebuilds published community plugins from their sources and publishes a signed statement (name, version, target, cache key, artifact sha256). The client accepts a verified-community binary when N independent statements (policy, default 2) match its hash.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the rebuilder job rebuilds a fixture plugin and its statement matches the publisher's hash
- [ ] #2 a binary whose hash no rebuilder confirms is not used (local build instead)
- [ ] #3 N is a policy setting (D-policy)
<!-- AC:END -->
