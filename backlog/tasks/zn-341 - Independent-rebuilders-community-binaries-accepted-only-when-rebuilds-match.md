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
ordinal: 10700
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** The client half already ships: src/tc/plugin_build.cpp:315-322 reads rebuilds/<sha256>.json and builds locally when matches < policy.rebuilds; the policy setting exists (src/tc/policy.cpp:32, ZINC_REBUILDS_MIN at :62) and docs/guide/08-security.md:256 documents it. Only AC1 (the rebuilder job) is missing; dropping leaves shipped code and a documented feature with no task.

A rebuilder job (ours on CI, others anywhere) rebuilds published community plugins from their sources and publishes a signed statement (name, version, target, cache key, artifact sha256). The client accepts a verified-community binary when N independent statements (policy, default 2) match its hash.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the rebuilder job rebuilds a fixture plugin and its statement matches the publisher's hash
- [ ] #2 a binary whose hash no rebuilder confirms is not used (local build instead)
- [ ] #3 N is a policy setting (D-policy)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. (drop proposed, corrected by the verifier) The client half already ships: src/tc/plugin_build.cpp:315-322 reads rebuilds/<sha256>.json and builds locally when matches < policy.rebuilds; the policy setting exists (src/tc/policy.cpp:32, ZINC_REBUILDS_MIN at :62) and docs/guide/08-security.md:256 documents it. Only AC1 (the rebuilder job) is missing; dropping leaves shipped code and a documented feature with no task.
<!-- SECTION:NOTES:END -->
