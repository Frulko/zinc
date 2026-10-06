---
id: ZN-052
title: 'Stable, versioned IR and ZBC format'
status: Done
assignee: []
created_date: '2026-10-06 16:42'
updated_date: '2026-10-06 18:27'
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
- [x] #1 docs/ir-format.md specifies the text and the binary format with a version
- [x] #2 zinc ir --check parses a dump and round-trips it
- [x] #3 files of the previous version still load or fail with a clear message; tested
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. IR text v1: version line, quoted names, selector lines and #k disambiguation, ir::parse + zinc ir --check; ZBC version messages; docs/ir-format.md; tests/compat fixtures; T0 irformat. Goldens regenerated (ir, zbc records).
<!-- SECTION:NOTES:END -->
