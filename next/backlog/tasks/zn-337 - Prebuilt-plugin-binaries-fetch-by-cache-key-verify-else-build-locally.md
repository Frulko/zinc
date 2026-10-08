---
id: ZN-337
title: 'Prebuilt plugin binaries: fetch by cache key, verify, else build locally'
status: Backlog
assignee: []
created_date: '2026-10-08 14:34'
labels:
  - distribution
  - security
  - size-M
milestone: m-19
dependencies:
  - ZN-332
  - ZN-336
ordinal: 55280
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Before compiling a plugin, zinc computes its cache key (src/tc/plugin_build.cpp) and asks the configured sources for `<target>/<name>-<key>.tar`: verified by sha256 and signature against the index, unpacked into the plugin cache; any failure falls back to the local build of today. Prebuilt binaries can be refused by policy (D-policy).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hit: a published binary is used and nothing is compiled (a test counts compiler runs)
- [ ] #2 miss or a tampered archive: the local build runs and the tampered file is reported
- [ ] #3 the key of a plugin whose sources changed misses (no stale binary is ever used)
<!-- AC:END -->
