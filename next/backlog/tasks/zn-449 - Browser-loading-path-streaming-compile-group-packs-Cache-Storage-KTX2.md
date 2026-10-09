---
id: ZN-449
title: 'Browser loading path: streaming compile, group packs, Cache Storage, KTX2'
status: Backlog
assignee: []
created_date: '2026-10-09 07:36'
labels:
  - games
  - assets
  - size-L
milestone: m-22
dependencies:
  - ZN-432
  - ZN-433
  - ZN-439
  - ZN-446
ordinal: 217000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
compileStreaming for app.wasm. One pack per group, fetched with progress counted against boot-manifest sizes. Cache Storage under content-hashed names. KTX2 transcoded in the worker. Inline splash. Report: docs/reports/games/toolchain-assets-loading.md (6.7).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 in headless Chrome the splash is visible before app.wasm finishes
- [ ] #2 a second visit fetches no pack from the network
- [ ] #3 a KTX2 texture draws
<!-- AC:END -->
