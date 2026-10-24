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
ordinal: 18000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Object.assign/freeze/fromEntries/getOwnPropertyNames/defineProperty on typed records and Dyn objects, Symbol and well-known symbols used by iteration, Reflect, a Proxy subset on Dyn, Intl.DateTimeFormat/NumberFormat/Collator for en-US and the host locale only where an example or web API needs them (ICU4C subset is rejected for size: libunicode tables plus the OS formatter).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fixtures equal Node's output; a size budget recorded for each addition
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: split into subtasks (Object statics on records and Dyn (assign, freeze, fromEntries, getOwnPropertyNames, defineProperty); Symbol and the well-known iteration symbols; Intl.NumberFormat/DateTimeFormat subset (with the zinc:i18n line of backlog/later.md)). Five unrelated features in one task, too big for a session. Reflect and Proxy have no user: drop. Intl overlaps the later line for zinc:i18n.
<!-- SECTION:NOTES:END -->
