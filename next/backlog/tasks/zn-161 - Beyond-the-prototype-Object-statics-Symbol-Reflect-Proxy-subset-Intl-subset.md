---
id: ZN-161
title: >-
  Beyond the prototype: Object statics, Symbol, Reflect/Proxy subset, Intl
  subset
status: Backlog
assignee: []
created_date: '2026-10-06 23:05'
labels:
  - language
  - stdlib
  - size-L
milestone: m-7
dependencies:
  - ZN-160
  - ZN-093
ordinal: 41030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Object.assign/freeze/fromEntries/getOwnPropertyNames/defineProperty on typed records and Dyn objects, Symbol and well-known symbols used by iteration, Reflect, a Proxy subset on Dyn, Intl.DateTimeFormat/NumberFormat/Collator for en-US and the host locale only where an example or web API needs them (ICU4C subset is rejected for size: libunicode tables plus the OS formatter).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fixtures equal Node's output; a size budget recorded for each addition
<!-- AC:END -->
