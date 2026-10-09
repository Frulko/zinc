---
id: ZN-433
title: ZPK pack format with lz4 and zstd vendored
status: Backlog
assignee: []
created_date: '2026-10-09 07:35'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies: []
ordinal: 201000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Writer and mapped reader: sorted TOC, per-entry codec (none, lz4, zstd, zstd with a dictionary), alignment per profile, lazy SHA-256 check, deterministic output. Vendor lz4 1.10.0 (lib/ only) and zstd 1.5.7. Write docs/zpk.md and the decision record. Report: docs/reports/games/toolchain-assets-loading.md (6.1).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a 10 000-entry round trip passes
- [ ] #2 two packs of the same inputs are byte-identical across directories and homes
- [ ] #3 a libFuzzer target on the reader runs clean for 10 minutes
- [ ] #4 the decoder bytes added to the runtime are recorded in the D40 table
<!-- AC:END -->
