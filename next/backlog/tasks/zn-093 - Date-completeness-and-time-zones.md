---
id: ZN-093
title: Date completeness and time zones
status: Backlog
assignee: []
created_date: '2026-10-06 22:54'
labels:
  - stdlib
  - size-M
milestone: m-13
dependencies:
  - ZN-083
ordinal: 40350
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Constructor forms (parts, ISO string, string parse of the RFC 2822/ISO subset), Date.UTC/parse, setters, toISOString/toJSON/toString/toUTCString/toLocale*String (en-US, ISO), getTimezoneOffset with the host zone (TZ database via the OS) and UTC under ZINC_DETERMINISTIC; Howard Hinnant's civil algorithms (already used) or C++20 <chrono> time zone support. Intl is deferred (decision recorded: only DateTimeFormat/NumberFormat en-US if an example needs it).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fixtures equal Node's output in UTC and in two fixed TZ values (set through TZ)
- [ ] #2 audit 01 Date rows pass
<!-- AC:END -->
