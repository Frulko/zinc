---
id: ZN-052
title: 'Stable, versioned IR and ZBC format'
status: Backlog
assignee: []
created_date: '2026-10-06 16:42'
labels:
  - size-M
dependencies: []
ordinal: 32500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make --emit=ir a stable format: a specification, a version in the dump, a parser that reads it back, ZBC version and migration rules, and a compatibility test over old dumps and files. Decision of ZN-031: unstable now, must become stable once the passes settle.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/ir-format.md specifies the text and the binary format with a version
- [ ] #2 zinc ir --check parses a dump and round-trips it
- [ ] #3 files of the previous version still load or fail with a clear message; tested
<!-- AC:END -->
