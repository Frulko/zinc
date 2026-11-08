---
id: ZN-1029
title: 'Allocation speed: JSON.parse in one block, mimalloc TLS slot, mimalloc upgrade'
status: Backlog
assignee: []
created_date: '2026-11-07 16:37'
labels:
  - perf
  - runtime
  - size-M
milestone: m-21
dependencies: []
ordinal: 1021000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
JSON.parse allocates 6 times per object (keys, values, dead flags of a Table): lay them in one block toward 3x the speed of 2026-10-29; use MI_TLS_SLOT on macOS (about 5% of allocation-heavy work is `_tlv_get_addr`); upgrade mimalloc to the release with the macOS MADV_FREE_REUSABLE decommit and drop the local prim.c patch.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- JSON.parse: a Table's keys, values and dead flags in one block (6 allocations per JSON object today), toward 3x faster than 2026-10-29 (it is 2x now).
- mimalloc: MI_TLS_SLOT on macOS without MI_MALLOC_OVERRIDE (_tlv_get_addr is ~5% of allocation-heavy work).
- ZN-885: upgrade mimalloc from 2.1.7 to a release with the macOS MADV_FREE_REUSABLE decommit and drop the local prim.c patch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 JSON.parse of the 10 MB benchmark is at least 1.5x faster than now (tools/bench, logged in zinc-next-perf.md)
- [ ] #2 allocation-heavy bench shows the TLS gain or the line is closed with the number
- [ ] #3 mimalloc is on the new release, `third_party/README.md` updated, no local patch
<!-- AC:END -->
