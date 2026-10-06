---
id: ZN-158
title: 'Beyond the prototype: typed arrays, ArrayBuffer, DataView'
status: Backlog
assignee: []
created_date: '2026-10-06 23:05'
labels:
  - language
  - size-M
milestone: m-7
dependencies:
  - ZN-155
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Uint8/16/32, Int8/16/32, Float32/64, BigInt64 arrays, ArrayBuffer (transfer, slice), DataView, TypedArray.from/of/set/subarray/fill/sort, backed by runtime byte arrays so u8[] and the web APIs share storage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fixtures equal Node's output; the web globals use them for Blob, TextEncoder and fetch bodies
<!-- AC:END -->
