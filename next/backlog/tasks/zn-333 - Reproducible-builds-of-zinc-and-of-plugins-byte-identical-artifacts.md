---
id: ZN-333
title: Reproducible builds of zinc and of plugins (byte-identical artifacts)
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
  - ZN-332
ordinal: 55240
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rebuilders (D-rebuilders) and content-addressed caches need byte-identical outputs: SOURCE_DATE_EPOCH, -ffile-prefix-map / -fdebug-prefix-map, deterministic `ar` (zig ar D), sorted inputs, no build paths or timestamps in archives (tar --mtime, --sort=name, numeric owners).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 two builds of zinc and of three plugins in different directories and at different times are byte-identical (a CI job diffs them)
- [ ] #2 the plugin archive (.tar) of D-binary-cache is byte-identical across two machines of the same target
- [ ] #3 docs/reports/zinc-next-reproducible.md lists the flags and what breaks reproducibility
<!-- AC:END -->
