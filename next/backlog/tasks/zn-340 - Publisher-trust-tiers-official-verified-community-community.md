---
id: ZN-340
title: 'Publisher trust tiers: official, verified community, community'
status: Backlog
assignee: []
created_date: '2026-10-08 14:34'
labels:
  - distribution
  - security
  - size-M
milestone: m-19
dependencies:
  - ZN-336
ordinal: 55310
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Official: built by the Zinc CI from tagged sources, signed by the release role. Verified community: a publisher key delegated in the index, binaries accepted once rebuilders agree (D-rebuilders). Community: signed by its publisher only; installed from source (local build), the key pinned on first use in zinc.lock and a key change refused without `zinc trust`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each tier has an install test: official binary accepted, verified accepted with enough matching rebuilds, community built from source
- [ ] #2 a community plugin whose key changes is refused until `zinc trust <name>`
- [ ] #3 `zinc add` prints the tier and the publisher before installing
<!-- AC:END -->
