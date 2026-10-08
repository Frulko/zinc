---
id: ZN-338
title: >-
  Reusable CI workflow for a plugin repository: build per target, test, sign,
  publish
status: Backlog
assignee: []
created_date: '2026-10-08 14:34'
labels:
  - ci
  - distribution
  - size-M
milestone: m-19
dependencies:
  - ZN-335
  - ZN-333
  - ZN-334
  - ZN-336
ordinal: 55290
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A `workflow_call` workflow any plugin repository uses: matrix macos-arm64, linux-x86_64, linux-aarch64, linux-armhf (rpi1); pinned zig and sysroots; the plugin's own tests; artifacts `<target>/<name>-<cachekey>.tar` named by the plugin cache key; provenance (D-attestations) and signature; publication to the index (D-index) on a tag.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a fixture plugin repository runs the workflow green on all four targets
- [ ] #2 each artifact name equals the cache key the client computes for the same sources and target
- [ ] #3 a tag publishes the artifacts and an index entry; without the signing secret the job stops before publishing and says why
<!-- AC:END -->
