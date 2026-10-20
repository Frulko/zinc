---
id: ZN-340
title: 'Publisher trust tiers: official, verified community, community'
status: Done
assignee: []
created_date: '2026-10-08 14:34'
updated_date: '2026-10-09 05:06'
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
- [x] #1 each tier has an install test: official binary accepted, verified accepted with enough matching rebuilds, community built from source
- [x] #2 a community plugin whose key changes is refused until `zinc trust <name>`
- [x] #3 `zinc add` prints the tier and the publisher before installing
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done through ZN-340.01 (official and verified tiers via the index, rebuild-gated verified binaries, zinc add <name>) and .02 (community keys pinned on first use, zinc trust). Rebuilder attestations come from ZN-341. usage: n/a
<!-- SECTION:NOTES:END -->
